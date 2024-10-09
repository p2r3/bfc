const process = require("process");

const args = Bun.argv.slice(2);

function printUsage () {
  console.log(`
BFC compiles human-readable high-level code to brainfuck.

Usage: bfc <input.bfc> [...flags] [--output|-o output.b]

Flags:
  --comments | -c          Enable compiler comments in output
  --debug    | -d          Enable debug symbols in output
  --optimize | -O          Enable basic optimization of output
  --help     | -h          Display this usage text and quit
`);
}

if (args.includes("--help") || args.includes("-h") || args.length === 0) {
  printUsage();
  process.exit(0);
}

const comments = args.includes("--comments") || args.includes("-c");
const debug = args.includes("--debug") || args.includes("-d");
const optimize = args.includes("--optimize") || args.includes("-O");

const inputFileName = args.find(c => !c.startsWith("--"));
if (!inputFileName) throw "no input file provided.";

let outputFileName = inputFileName.split(".").slice(0, -1).join(".") + ".b";

const outputFlag = args.indexOf("-o") || args.indexOf("--output");
if (outputFlag !== -1 && outputFlag < args.length - 1) {
  outputFileName = args[outputFlag + 1];
  if (!outputFileName.endsWith(".b")) outputFileName += ".b";
}

function extractToken (string, token) {

  const arr = string.split(token);

  return arr.reduce((acc, curr, index) => {
    acc.push(curr);
    if (index < arr.length - 1) acc.push(token);
    return acc;
  }, []);

}

function extractMultiple (arr, tokens) {

  for (const token of tokens) {
    const tmp = [];
    for (const elem of arr) {
      if (tokens.includes(elem)) {
        tmp.push(elem);
        continue;
      }
      tmp.push(...extractToken(elem, token));
    }
    arr = tmp;
  }

  return arr;

}

function tokenize (string) {

  const spaces = string.split(/\s+|\t+|\n+|\r+|;/);
  const out = [];

  return extractMultiple(spaces, ["==", "!=", "=", "<<", ">>", "<", ">", "(", ")", "'"]);

}

const file = Bun.file(inputFileName);
if (file.size === 0) throw "input file not found or empty.";

const tokens = tokenize(await file.text());

function createEnum (values) {
  const enumObject = {};
  for (let i = 0; i < values.length; i ++) {
    enumObject[values[i]] = i;
  }
  return Object.freeze(enumObject);
}

const tok = createEnum([
  "DECLARE",
  "ASSIGN",
  "EQ",
  "NE",
  "GT",
  "LT",
  "ADD",
  "SUB",
  "IF",
  "WHILE",
  "READ",
  "WRITE",
  "CHAR"
]);

function processBranch (firstToken, branchTerminator) {

  const tree = [];
  let i = 0;

  while (firstToken + i < tokens.length) {
    const token = tokens[firstToken + i];

    switch (token) {

      case "{":
      case "(": {
        const branch = processBranch(firstToken + i + 1, token === "{" ? "}" : ")");
        tree.push(branch.tree);
        i += branch.processed;
        break;
      }

      case branchTerminator: {
        return { tree, processed: i + 1 };
      }

      case "let": { tree.push(tok.DECLARE); break; }
      case "=": { tree.push(tok.ASSIGN); break; }
      case "==": { tree.push(tok.EQ); break; }
      case "!=": { tree.push(tok.NE); break; }
      case ">": { tree.push(tok.GT); break; }
      case "<": { tree.push(tok.LT); break; }
      case "if": { tree.push(tok.IF); break; }
      case "while": { tree.push(tok.WHILE); break; }
      case "+": { tree.push(tok.ADD); break; }
      case "-": { tree.push(tok.SUB); break; }
      case ">>": { tree.push(tok.READ); break; }
      case "<<": { tree.push(tok.WRITE); break; }
      case "'": { tree.push(tok.CHAR); break; }

      default: {
        if (token !== "") tree.push(token);
        break;
      }

    }
    i ++;
  }

  return { tree, processed: i + 1 };
}

const vars = {};
const literals = [];
let addr = 0, stack = 0, maxStack = 0;
let program = "";

// returns a valueToken pointing to the top of the stack
function stackTop () {
  return new valueToken(-stack, false);
}

// grows the stack size by one, returns new stack top
function pushStack () {
  stack ++;
  if (stack > maxStack) maxStack = stack;
  return stackTop();
}

// shrinks the stack by one, returns new stack top
function popStack () {
  stack --;
  return stackTop();
}

class valueToken {

  isConstant;
  value;

  constructor (token, isConstant = true) {
    if (isNaN(token)) {
      if (token in vars) {
        this.isConstant = false;
        this.value = vars[token];
      } else {
        throw new Error(`bfc error: attempted to dereference undeclared variable \`${token}\`.`);
      }
    } else {
      this.isConstant = isConstant;
      this.value = parseInt(token);
    }
  }

  toString () {
    if (this.isConstant) return this.value;
    if (this.value < 0) return `(${this.value.toString().replace("-", "s")})`;
    for (const name in vars) if (vars[name] === this.value) return name;
  }

}

function runTo (target) {

  if (!(target instanceof valueToken)) throw new Error(`bfc error: run target is not a valueToken.`);
  if (target.isConstant) throw new Error (`bfc error: attempted to run to a constant.`);
  target = target.value;

  const steps = Math.abs(target - addr);
  const sign = target > addr ? ">" : "<";

  for (let i = 0; i < steps; i ++) program += sign;
  addr = target;

}

function move (from, to, sign = "+") {

  if (from.isConstant) throw `bfc error: attempted to move from a constant.`;
  if (to.isConstant) throw `bfc error: attempted to move to a constant.`;

  if (from.value === to.value) throw new Error(`bfc error: attempted no-op move`);

  if (debug) program += "m";
  runTo(from);
  program += "[-";
  runTo(to);
  program += sign;
  runTo(from);
  program += "]";
  if (debug) program += "M";

}

function split (from, to1, to2) {

  if (from.isConstant) throw `bfc error: attempted to split a constant.`;
  if (to1.isConstant || to2.isConstant) throw `bfc error: attempted to split into a constant.`;

  if (debug) program += "s";
  runTo(from);
  program += "[-";
  runTo(to1);
  program += "+";
  runTo(to2);
  program += "+";
  runTo(from)
  program += "]";
  if (debug) program += "S";

}

function assign (to, from, clear = true, sign = "+") {

  if (to.isConstant) throw `bfc error: attempted to assign to a constant.`;

  if (debug) program += "a";

  runTo(to);
  if (clear) program += "[-]";

  if (from.isConstant) {
    const abs = Math.abs(from.value);
    for (let i = 0; i < abs; i ++) program += sign;
  } else {
    const s = pushStack();
    split(from, to, s);
    move(s, from, sign);
    popStack();
  }

  if (debug) program += "A";

}

function comment (str) {
  if (!comments) return;

  const lineLength = program.split("\n").pop().length;
  const spaces = 80 - lineLength;

  for (let i = 0; i < spaces; i ++) program += " ";
  program += `// ${str}\n`;
}

function add (to, from) {
  if (debug) program += "a_";
  return assign(to, from, false);
}
function subtract (to, from) {
  if (debug) program += "s_";
  return assign(to, from, false, "-");
}

function evalBranch (tokens) {

  for (let i = 0; i < tokens.length; i ++) {
    const token = tokens[i];

    switch (token) {

      case tok.DECLARE: {

        const leftstr = tokens[i + 1];
        if (leftstr in vars) throw `bfc error: \`${leftstr}\` has already been declared.`;

        vars[leftstr] = Object.keys(vars).length;
        const left = new valueToken(leftstr);

        runTo(left);
        comment(`declare ${left} at (${left.value})`);

        i ++;
        break;
      }

      case tok.IF: {

        const head = tokens[i + 1];
        const block = tokens[i + 2];

        evalBranch(head);
        const result = new valueToken(addr, false);

        if (result.isConstant || result.value >= 0) {
          throw `bfc error: if statement head ${result} not on stack.`;
        }

        program += "["; // start block if result is truthy (not 0)
        evalBranch(block);

        runTo(result);
        program += "[-]";
        popStack();
        comment(`free ${result}`);

        program += "]"; // end block
        comment(`end if`);

        i += 2;
        break;
      }

      case tok.WHILE: {

        const head = tokens[i + 1];
        const block = tokens[i + 2];

        const s = pushStack();
        runTo(s);
        program += "+[-";
        comment(`${s} = 1; open while loop`);

        evalBranch(head);
        const result = new valueToken(addr, false);

        program += "[[-]"; // start block if result is truthy (not 0)
        evalBranch(block);
        comment(`start while block`);

        runTo(s);
        program += "+";
        runTo(result);
        program += "[-]]";
        comment(`end while block`);

        runTo(s);
        program += "]";
        comment(`return to ${s}; end while loop`);

        // clear loop entry stack variable s
        // this should be empty already
        popStack();

        if (result.value < 0) { // is result on stack (yes)
          runTo(result);
          program += "[-]";
          popStack();
          comment(`free ${result}`);
        }

        i += 2;
        break;
      }

      case tok.WRITE: {

        let right = tokens[i + 1];

        if (Array.isArray(right)) {
          evalBranch(right);
          if (literals.length !== 0) right = literals.pop();
          else right = new valueToken(addr, false);
        } else {
          right = new valueToken(right);
        }

        // push right to stack if not there already
        if (right.isConstant || right.value >= 0) {
          const s = pushStack();
          assign(s, right);
          comment(`assign ${right} to ${s}`);
          right = s;
        }

        runTo(right);
        program += ".";
        comment(`write out ${right}`);

        program += "[-]";
        popStack();
        comment(`free ${right}`);

        i ++;
        break;
      }

      case tok.READ: {

        let right = tokens[i + 1];

        if (Array.isArray(right)) {
          evalBranch(right);
          right = new valueToken(addr, false);
        } else {
          right = new valueToken(right);
        }

        if (right.isConstant) {
          throw `bfc error: attempted to read input into a constant`;
        }

        if (right.value < 0) { // is right on the stack
          throw `bfc error: attempted to read input into stack`;
        }

        runTo(right);
        program += ",";
        comment(`read into ${right}`);

        i ++;
        break;
      }

      case tok.CHAR: {

        const right = tokens[i + 1];

        if (!isNaN(right) || right.length !== 1) {
          throw `bfc error: \`${right}\` is not a character`;
        }

        literals.push(new valueToken(right.charCodeAt(0)));
        comment(`push '${right} to literal stack at ${literals.length - 1}`);

        i ++;
        break;
      }

      case tok.SUB:
      case tok.ADD: {

        const left = literals.length ? literals.pop() : new valueToken(addr, false);
        let right = tokens[i + 1];

        const s = pushStack();

        // copy left hand operand to s
        add(s, left);
        comment(`copy ${left} to ${s}`);

        // get address from right hand operand
        if (Array.isArray(right)) {
          evalBranch(right);
          right = new valueToken(addr, false);
        } else {
          right = new valueToken(right);
        }

        // add/subtract right to/from s
        if (token === tok.ADD) add(s, right);
        else subtract(s, right);
        comment(`${s} ${token === tok.ADD ? "plus" : "minus"} ${right}`);

        runTo(s);

        i ++;
        break;
      }

      case tok.EQ:
      case tok.NE: {

        const left = literals.length ? literals.pop() : new valueToken(addr, false);
        let right = tokens[i + 1];

        if (Array.isArray(right)) {
          evalBranch(right);
          right = new valueToken(addr, false);
        } else {
          right = new valueToken(right);
        }

        const s1 = pushStack();
        const s2 = pushStack();

        assign(s1, left);
        assign(s2, right);
        comment(`assign left/right to ${s1} and ${s2}`);

        runTo(s2);
        program += "[->-<]"; // subtract s2 from s1

        // s2 now always empty
        // s1 empty if equals, not empty if not equals

        // in case of not equals, we're done
        // otherwise, flip the condition
        if (token === tok.EQ) {
          program += "+"; // make s2 not empty
          runTo(s1);
          program += "[<->[-]]"; // clear s2 ONLY if s1 is not 0
          runTo(s2);
          program += "[>+<-]"; // move 1 from s2 to s1
        }
        comment(`write ${left} ${token === tok.EQ ? "==" : "!="} ${right} to ${s1}`);

        popStack();
        comment(`free ${s2}; not cleared because already empty`);

        runTo(s1);

        i ++;
        break;
      }

      case tok.ASSIGN: {

        const left = new valueToken(addr, false);
        let right = tokens[i + 1];

        if (left.value < 0) throw `bfc error: invalid assignment address (\`... = ${right}\`).`;

        if (Array.isArray(right)) {
          evalBranch(right);
          right = new valueToken(addr, false);
        } else {
          right = new valueToken(right);
        }

        assign(left, right);
        comment(`${left} = ${right}`);

        if (right.value < 0) { // is right on the stack
          runTo(right);
          program += "[-]";
          popStack();
          comment(`free ${right}`);
        }

        i ++;
        break;
      }

      default: {

        if (typeof token === "number") { // unimplemented token
          for (const name in tok) {
            if (tok[name] === token) {
              console.warn(`bfc warning: ignoring unimplemented token \`${name}\`.`);
              break;
            }
          }
          break;
        }

        if (typeof token === "string" && !isNaN(token)) { // number literal

          literals.push(new valueToken(token));
          comment(`push ${token} to literal stack at ${literals.length - 1}`);

        } else if (Array.isArray(token)) { // block
          evalBranch(token);
        } else if (token in vars) { // variable
          runTo(new valueToken(token));
        } else { // ??
          throw `bfc error: unexpected token \`${token}\`.`;
        }

        break;
      }

    }

  }

}

const topBranch = processBranch(0);
evalBranch(topBranch.tree);

console.log(topBranch);

if (comments || debug) program = "\n" + program;
for (let i = 0; i < maxStack; i ++) program = ">" + program;
comment(`end of program; stack size ${stack}`);

if (optimize) {
  let prev = 0;
  while (prev !== program.length) {

    prev = program.length;
    program = program
      .replaceAll("<>", "")
      .replaceAll("><", "")
      .replaceAll("+-", "")
      .replaceAll("-+", "")
      .replaceAll("[]", "")
      .replaceAll("[-][-]", "[-]");

    if (program.endsWith(">")) program = program.slice(0, -1);
    if (program.endsWith("<")) program = program.slice(0, -1);
    if (program.endsWith("+")) program = program.slice(0, -1);
    if (program.endsWith("-")) program = program.slice(0, -1);

    if (program.endsWith("[-]")) program = program.slice(0, -3);
    if (program.slice(maxStack).startsWith("[-]")) {
      program = program.slice(0, maxStack) + program.slice(maxStack + 3);
    }

  }
}

await Bun.write(outputFileName, program);
console.log(`program written to \`${outputFileName}\`.`);
