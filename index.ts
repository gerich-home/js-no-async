import { parse } from "@babel/parser";
import { Scope } from "./scope";

const ast = parse(`
function sin() {
    return 20 + 80;
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

const foo = sin();
`);

const globalScope = new Scope();

globalScope.evaluateStatements(ast.program.body);

for (const variableName of Object.keys(globalScope.variables)) {
    console.log(variableName, globalScope.variables[variableName]);
}
