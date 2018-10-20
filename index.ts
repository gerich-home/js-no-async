import { parse } from '@babel/parser';
import { Engine } from './engine';

const ast = parse(`
function num(a) {
    return {
        inc(b) { a = a + b; },
        get() { return a; }
    };
}

var n = new num(30);

var n1 = num(10);
var n2 = num(20);
log(n1.get());
log(n2.get());
{
    n1.inc(5);
    n2.inc(33);
    log(n1.get());
}
log(n2.get());
`);

const globalScope = new Engine().globalScope;


globalScope.evaluateStatements(ast.program);

if(false) {
  for (const variableName of Object.keys(globalScope.variables)) {
      console.log(variableName, globalScope.variables[variableName]);
  }
}