import { parse } from "@babel/parser";
import { Scope } from "./scope";


const ast = parse(`
function sin() {
    var a = 20;
}

var a = 10;
const b = a + 20;
let c = a + b * 20;
a = 2;
let d = a + b * 20;
let e = { x: { y: 10 }, z: 30 };
let f = e.x;
e.x.y = 56;
`);

const globalScope = new Scope();

for (const statement of ast.program.body) {
    globalScope.evaluateStatement(statement);
}

for (const variableName of Object.keys(globalScope.variables)) {
    console.log(variableName, globalScope.variables[variableName]);
}
