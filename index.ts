import { parse } from "@babel/parser";
import { Expression, Statement, LVal } from "@babel/types";

const ast = parse(`
var a = 10;
const b = a + 20;
let c = a + b * 20;
a = 2;
let d = a + b * 20;
`);

class NotImplementedError extends Error {
}

type Value = NumberValue | StringValue | BooleanValue | NullValue | UndefinedValue | ObjectValue;

type NumberValue = {
    readonly type: 'number';
    readonly value: number;
};

type StringValue = {
    readonly type: 'string';
    readonly value: string;
};

type BooleanValue = {
    readonly type: 'boolean';
    readonly value: boolean;
};

type NullValue = {
    readonly type: 'null';
};

type UndefinedValue = {
    readonly type: 'undefined';
};

type ObjectValue = {
    readonly type: 'object';
};

const nullValue: NullValue = {
    type: 'null'
};

const undefinedValue: UndefinedValue = {
    type: 'undefined'
};

type VariablesObject = {
    [variableName: string]: Value
};

const variables: VariablesObject = {};

for (const statement of ast.program.body) {
    evaluateStatement(variables, statement);
}

for (const variableName of Object.keys(variables)) {
    console.log(variableName, variables[variableName]);
}

function evaluateStatement(variables: VariablesObject, statement: Statement): void {
    switch(statement.type) {
        case 'VariableDeclaration':
            for(const declaration of statement.declarations) {
                const initialValue = declaration.init === null ?
                    undefinedValue :
                    evaluateExpression(variables, declaration.init)

                assignValue(variables, initialValue, declaration.id);
            }
            return;
        case "ExpressionStatement":
            evaluateExpression(variables, statement.expression);
            return;
        default:
            throw new NotImplementedError('not supported statement type ' + statement.type);
    }
}

function evaluateExpression(variables: VariablesObject, expression: Expression): Value {
    switch(expression.type) {
        case 'NumericLiteral':
            return numberValue(expression.value);
        case 'StringLiteral':
            return stringValue(expression.value);
        case 'BooleanLiteral':
            return booleanValue(expression.value);
        case 'NullLiteral':
            return nullValue;
        case 'ObjectExpression':
            for(const property of expression.properties) {
                switch(property.type) {
                    case 'ObjectProperty':
                    property.key
                        break;
                    default:
                        throw new NotImplementedError('unsupported property type ' + property.type);
                }
            }
            return nullValue;
        case 'BinaryExpression':
            const left = evaluateExpression(variables, expression.left);
            const right = evaluateExpression(variables, expression.right);

            switch (expression.operator) {
                case '+':
                    if (left.type === 'string' || right.type === 'string') {
                        return stringValue(toString(left) + toString(right));
                    } else {
                        return numberValue(toNumber(left) + toNumber(right));
                    }
                case '-':
                    return numberValue(toNumber(left) - toNumber(right));
                case '*':
                    return numberValue(toNumber(left) * toNumber(right));
                case '/':
                    return numberValue(toNumber(left) / toNumber(right));
                default:
                    throw new NotImplementedError('unsupported operator ' + expression.operator);
            }
        case 'AssignmentExpression':
            const value = evaluateExpression(variables, expression.right);
            assignValue(variables, value, expression.left);
            return value;
        case 'Identifier':
            return variables[expression.name];
    }

    throw new NotImplementedError('unsupported expression ' + expression.type);
}

function assignValue(variables: VariablesObject, value: Value, to: LVal): void {
    switch(to.type) {
        case 'Identifier':
            variables[to.name] = value;
            return;
        default:
            throw new NotImplementedError('unsupported left value type ' + to.type);
    }
}

function toString(value: Value): string {
    switch(value.type) {
        case 'string':
            return value.value;
        case 'boolean':
            return value.value.toString();
        case 'number':
            return value.value.toString();
        case 'null':
            return 'null';
        case 'object':
            throw new NotImplementedError('object.toNumber is not supported');
        case 'undefined':
            return 'undefined';
    }
}

function getObjectField(value: ObjectValue, fieldName: string): Value | null {
    throw new NotImplementedError('fields of objects are not supported');
}

function executeFunction(functionValue: ObjectValue, thisArg: Value, args: Value[]): Value | null {
    throw new NotImplementedError('methods of objects are not supported');
}

function toNumber(value: Value): number {
    switch(value.type) {
        case 'string':
            return Number(value.value);
        case 'boolean':
            return Number(value.value);
        case 'number':
            return value.value;
        case 'null':
            return 0;
        case 'object':
            throw new NotImplementedError('object.toNumber is not supported');
        case 'undefined':
            return NaN;
    }
}

function numberValue(value: number): NumberValue {
    return {
        type: 'number',
        value
    };
}

function stringValue(value: string): StringValue {
    return {
        type: 'string',
        value
    };
}

function booleanValue(value: boolean): BooleanValue {
    return {
        type: 'boolean',
        value
    };
}
