## What is BFC

BFC compiles human-readable code to brainfuck, an esoteric programming language. It works much like a compiler, but instead of producing bytecode, it outputs brainfuck code. You may call it a transpiler.

BFC is written in JavaScript for the Bun runtime. Porting it to Node or Deno shouldn't be hard, but why would you do that?

The compiler features something resembling a tokenizer, an AST, and a stack, though in a very primitive form. You don't need much for brainfuck.

## Usage

Download the appropriate executable for your system from Releases, then run it on the command line. Alternatively, clone the project and use `bun run main.js`.

## The language

BFC uses an in-house programming language as input, which is also called BFC due to a lack of creativity. The language syntax can be likened to the C family of languages.

Here are the tokens that make up the BFC language:

  - `DECLARE` (`let <name>`) - creates a global variable slot under the given name. Currently, all variables in BFC are globals, there is no scope distinction.
  - `ASSIGN` (`= <right>`) - assigns the value at `right` to the address currently pointed to.
  - `EQ` (`== <right>`) - pushes a truthy value to the stack if the value at `right` is equal to the value at the current address or the most recently encountered number literal.
  - `NE` (`!= <right>`) - pushes 0 to the stack if the value at `right` is equal to the value at the current address or the most recently encountered number literal.
  - `ADD` (`+ <right>`) - pushes the result of the value at `right` plus the value at the current address or the most recently encountered number literal to the stack.
  - `SUB` (`- <right>`) - pushes the result of the value at `right` minus the value at the current address or the most recently encountered number literal to the stack.
  - `IF` (`if <head> <block>`) - evaluates the expression at the `head` block and, if truthy, runs the code in `block`.
  - `WHILE` (`while <head> <block>`) - begins a loop which evaluates the expression at the `head` block and, if truthy, runs the code at `block` and continues the loop.
  - `READ` (`>> <right>`) - saves the next character at stdin to `right`.
  - `WRITE` (`<< <right>`) - outputs the value of `right` or most recently encountered number literal to stdout as a character.
  - `CHAR` (`'<char>`) - expects a single ASCII character in place of `char`, pushes its ASCII index to the stack of number literals.

Special tokens:

  - Upon encountering a known variable name, the compiler will run to that variable's address.
  - Upon encountering a number literal, the compiler will push it to its stack of number literals. They do not consume memory on their own.
  - Blocks are defined with either `()` or `{}` brackets, with both types being semantically identical. Most expressions accept literals, variables, and blocks equally.
  - Upon encountering a free-standing block, the compiler will evaluate the code in that block.

Tokens can be separated by various separators, all of which function identically to each other:

  - Semicolons (`;`)
  - Spaces and tabs
  - Line feed, carriage return

## Example program
```js
  let i = 5

  while (i != 0) {
    i = (i - 1)
    <<('H)<<('i)<<10
  }
```
This program will produce brainfuck code that prints 5 lines of "Hi" to stdout:
```b
>>>>+++++<+[-<[-]>>[-<<+<<+>>>>]<<<<[->>>>+<<<<]>[-][->-<]>[[-]>>[-<<<+<+>>>>]<<<<[->>>>+<<<<]>->>>[-]<<<[->>>+<<<<+>]<[->+<]>[-]++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.[-]+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.[-]++++++++++.[-]>>+<[-]]>]<
```

## Compiler features

By default, the compiler will insert comments and debug symbols into the output file. These can be disabled by setting `comments` and `debug` respectively to false in the code.

Optionally, basic optimization is available via the `optimize` flag, which is false by default. Optimized programs should function identically, as no logic is reevaluated.
