# What is it?

JS interpreter written in TS using Babel to parse AST.

\+ test harness to run public EcmaScript [conformance test suite](https://github.com/tc39/test262#test262-ecmascript-test-suite-ecma-tr104)

# Why?
Just for fun :)


Actually as the name implies it has something related to `async` construct.

This was my initial motivation - I wanted to write a POC of JS engine where you do no need to mark your code with `async`/`await` keywords and make it the default behavior

(the same way as in Rust you do not need to mark you variable to be `const`, instead you mark it with `mut` when needed).

This no-`async` part is not finished (I switched to something more important).

# How it works?

[Your code] -> Babel -> [AST] -> Interpreter

Actually Interpreter works with AST node-by-node executing constructs on-fly and creating appropriate in-memory structures that represent ES runtime concepts.

The interpreter **as expected for a toy** does support only a small subset of EcmaScript, but anyway conformance tests are executed against the codebase and some of tests and sub-suites **pass** (check [here](https://gitlab.com/gerich.home/js-no-async/-/pipelines))!
