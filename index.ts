import { parse } from "@babel/parser";
import { Expression, Statement, LVal, PatternLike, Identifier, FunctionDeclaration, FunctionExpression } from "@babel/types";

class Scope {
    readonly variables: Variables = {};
    
    constructor(private readonly parent: Scope | null = null) {}
    
    evaluateStatement(statement: Statement): void {
        switch(statement.type) {
            case 'VariableDeclaration':
                for(const declaration of statement.declarations) {
                    const initialValue = declaration.init === null ?
                        undefinedValue :
                        this.evaluateExpression(declaration.init);

                    this.assignValue(initialValue, declaration.id);
                }
                return;
            case 'FunctionDeclaration':
                if(statement.id === null) {
                    throw new NotImplementedError('wrong function declaration');
                } else {
                    this.assignValue(this.functionValue(statement), statement.id);
                }
                return;
            case "ExpressionStatement":
                this.evaluateExpression(statement.expression);
                return;
            default:
                throw new NotImplementedError('not supported statement type ' + statement.type);
        }
    }

    evaluateExpression(expression: Expression | PatternLike): Value {
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
                const fields: ObjectFields = {};

                for(const property of expression.properties) {
                    switch(property.type) {
                        case 'ObjectProperty':
                            const key: Identifier = property.key;
                            fields[key.name] = this.evaluateExpression(property.value);
                            break;
                        default:
                            throw new NotImplementedError('unsupported property type ' + property.type);
                    }
                }

                return objectValue(fields, rootPrototype);
            case 'FunctionExpression':
                return this.functionValue(expression);
            case 'BinaryExpression':
                const left = this.evaluateExpression(expression.left);
                const right = this.evaluateExpression(expression.right);

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
            case 'MemberExpression':
                const object = this.evaluateExpression(expression.object);
                const key: Identifier = expression.property;

                if (object.type === 'object') {
                    return getObjectField(object, key.name);
                } else {
                    throw new NotImplementedError('member access is unsupported for ' + object.type);
                }
            case 'AssignmentExpression':
                const value = this.evaluateExpression(expression.right);
                this.assignValue(value, expression.left);
                return value;
            case 'Identifier':
                return this.variables[expression.name];
        }

        throw new NotImplementedError('unsupported expression ' + expression.type);
    }

    assignValue(value: Value, to: LVal): void {
        switch(to.type) {
            case 'Identifier':
                this.variables[to.name] = value;
                return;
            case 'MemberExpression':
                const object = this.evaluateExpression(to.object);
                const key: Identifier = to.property;

                if (object.type === 'object') {
                    object.ownFields[key.name] = value;
                } else {
                    throw new NotImplementedError('member assignment is unsupported for ' + object.type);
                }

                return;
            default:
                throw new NotImplementedError('unsupported left value type ' + to.type);
        }
    }
    
    functionValue(functionNode: FunctionDeclaration | FunctionExpression): ObjectValue {
        return objectValue({}, functionPrototype, {
            function: functionNode,
            scope: this
        });
    }
}

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
    readonly ownFields: ObjectFields;
    readonly internalFields: InternalObjectFields;
    readonly prototype: ObjectValue | NullValue;
};

type ObjectPrototypeValue = ObjectValue | NullValue;

type ObjectFields = {
    [variableName: string]: Value;
};

type InternalObjectFields = {
    [variableName: string]: any;
};

const nullValue: NullValue = {
    type: 'null'
};

const undefinedValue: UndefinedValue = {
    type: 'undefined'
};

const rootPrototype: ObjectValue = {
    type: 'object',
    ownFields: {},
    internalFields: {},
    prototype: nullValue
};

const functionPrototype = objectValue();

type Variables = {
    [variableName: string]: Value;
};

const globalScope = new Scope();

for (const statement of ast.program.body) {
    globalScope.evaluateStatement(statement);
}

for (const variableName of Object.keys(globalScope.variables)) {
    console.log(variableName, globalScope.variables[variableName]);
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

function getObjectField(value: ObjectValue, fieldName: string): Value {
    if (fieldName in value.ownFields) {
        return value.ownFields[fieldName];
    }

    if (value.prototype.type === 'null') {
        return undefinedValue;
    }

    return getObjectField(value.prototype, fieldName);
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

function objectValue(ownFields: ObjectFields = {}, prototype: ObjectPrototypeValue = rootPrototype, internalFields: InternalObjectFields = {}): ObjectValue {
    return {
        type: 'object',
        ownFields,
        internalFields,
        prototype
    };
}