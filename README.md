=== What is it?
JS interpreter written in TS using Babel to parse AST.
+ test harness to run public EcmaScript [conformance test suite](https://github.com/tc39/test262#test262-ecmascript-test-suite-ecma-tr104)

=== Why?
Just for fun

=== How it works?

[Your code] -> Babel -> [AST] -> Interpreter

Actually Interpreter works with AST node-by-node creating appropriate in-memory structures that represent ES runtime concepts.

The interpreter **as expected for a toy** does support only a small subset of EcmaScript, but anyway conformance tests are executed against the codebase and some of tests and sub-suites **pass**!