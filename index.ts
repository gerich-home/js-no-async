import { parse } from '@babel/parser';
import { Engine } from './engine';

const ast = parse(`
function num(a) {
    return {
        inc(b) { a = a + b; },
        get() { return a; }
    };
}

function cnt(a) {
    this.a = a;
}

cnt.prototype.inc = function(b) { this.a = this.a + b; };
cnt.prototype.get = function() { return this.a; };

var n = new cnt(30);

var n1 = num(10);
var n2 = num(20);
log(n1.get());
log(n2.get());
log(n.get());
{
    n1.inc(5);
    n2.inc(33);
    log(n1.get());
}
log(n2.get());
n.inc(7);
log(n.get());
`);

const globalScope = new Engine().globalScope;


globalScope.evaluateStatements(ast.program);

if(false) {
  for (const variableName of Object.keys(globalScope.variables)) {
      console.log(variableName, globalScope.variables[variableName]);
  }
}