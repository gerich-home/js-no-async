import { parse } from '@babel/parser';
import { Engine } from './engine';

const ast = parse(`
function sin(x) {
    return function() { return x + a; };
}

var a = 10;
const b = a + 20;
let c = a + b * 20;
a = 2;
let d = a + b * 20;
let e = { x: { y: 10 }, z: 30, w: sin };
let f = e.x;
e.x.y = 56;
const bar = e.w();

const foo = sin(2)();

log(1,2,'3faf', { toString: function(){ return 10; }});
`);

const globalScope = new Engine().globalScope;

globalScope.evaluateStatements(ast.program.body);

return;
for (const variableName of Object.keys(globalScope.variables)) {
    console.log(variableName, globalScope.variables[variableName]);
}
