import { AssignmentExpression, BinaryExpression, Block, BlockStatement, BooleanLiteral, CallExpression, Expression, ExpressionStatement, FunctionDeclaration, FunctionExpression, Identifier, IfStatement, JSXNamespacedName, LVal, MemberExpression, NewExpression, Node, NumericLiteral, ObjectExpression, ObjectMethod, PatternLike, ReturnStatement, SpreadElement, Statement, StringLiteral, ThisExpression, traverse, UnaryExpression, VariableDeclaration } from '@babel/types';
import { Engine } from './engine';
import { booleanValue, nullValue, numberValue, objectValue, stringValue, undefinedValue } from './factories';
import { getObjectField } from './globals';
import { NotImplementedError } from './notImplementedError';
import { BooleanValue, NumberValue, ObjectFields, ObjectValue, StringValue, Value, Variables } from './types';

function isFunctionNode(node: Node): boolean {
    return node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ObjectMethod'
}

export class Scope {
    readonly variables: Variables = {};
    
    constructor(
        readonly engine: Engine,
        private readonly parent: Scope | null = null,
        private readonly thisValue: Value = undefinedValue
    ) {}
    
    createChildScope(thisValue: Value = this.thisValue): Scope {
        return new Scope(this.engine, this, thisValue);
    }

    evaluateStatements(block: Block): Value {
        const state = {
            functionDepth: 0,
            vars: [] as string[]
        };
        
        traverse(block, {
            enter(node, ancestors, state) {
                const type = node.type;
                if (state.functionDepth === 0) {
                    switch(node.type) {
                        case 'FunctionDeclaration':
                            if(node.id !== null) {
                                state.vars.push(node.id.name);
                            }
                        break;
                        case 'VariableDeclaration':
                            state.vars.push(...node.declarations
                                .filter(d => d.id.type === 'Identifier')
                                .map(d => (d.id as Identifier).name)
                                );
                        break;
                    }
                }
                
                if (isFunctionNode(node)) {
                    state.functionDepth++;
                }
            },
            exit(node, ancestors, state) {
                if (isFunctionNode(node)) {
                    state.functionDepth--;
                }
            }
        }, state);

        for (const varName of state.vars) {
            this.variables[varName] = undefinedValue;
        }

        for (const statement of block.body) {
            const result = this.evaluateStatement(statement);

            if (result !== null) {
                return result;
            }
        }

        return undefinedValue;
    }

    evaluateStatement(statement: Statement): Value | null {
        switch(statement.type) {
            case 'VariableDeclaration':
                return this.evaluateVariableDeclaration(statement);
            case 'FunctionDeclaration':
                return this.evaluateFunctionDeclaration(statement);
            case 'ExpressionStatement':
                return this.evaluateExpressionStatement(statement);
            case 'BlockStatement':
                return this.evaluateBlockStatement(statement);
            case 'IfStatement':
                return this.evaluateIfStatement(statement);
            case 'ReturnStatement':
                return this.evaluateReturnStatement(statement);
            default:
                throw new NotImplementedError('not supported statement type ' + statement.type);
        }
    }

    evaluateExpression(expression: Expression | PatternLike | SpreadElement | JSXNamespacedName): Value {
        switch(expression.type) {
            case 'NumericLiteral':
                return this.evaluateNumericLiteral(expression);
            case 'StringLiteral':
                return this.evaluateStringLiteral(expression);
            case 'BooleanLiteral':
                return this.evaluateBooleanLiteral(expression);
            case 'NullLiteral':
                return nullValue;
            case 'ObjectExpression':
                return this.evaluateObjectExpression(expression);
            case 'FunctionExpression':
                return this.evaluateFunctionExpression(expression);
            case 'CallExpression':
                return this.evaluateCallExpression(expression);
            case 'NewExpression':
                return this.evaluateNewExpression(expression);
            case 'BinaryExpression':
                return this.evaluateBinaryExpression(expression);
            case 'UnaryExpression':
                return this.evaluateUnaryExpression(expression);
            case 'MemberExpression':
                return this.evaluateMemberExpression(expression);
            case 'AssignmentExpression':
                return this.evaluateAssignmentExpression(expression);
            case 'Identifier':
                return this.evaluateIdentifier(expression);
            case 'ThisExpression':
                return this.evaluateThisExpression(expression);
        }

        throw new NotImplementedError('unsupported expression ' + expression.type);
    }

    evaluateVariableDeclaration(statement: VariableDeclaration): null {
        for(const declaration of statement.declarations) {
            const initialValue = declaration.init === null ?
                undefinedValue :
                this.evaluateExpression(declaration.init);

            this.assignValue(initialValue, declaration.id);
        }

        return null;
    }

    evaluateFunctionDeclaration(statement: FunctionDeclaration): null {
        if(statement.id === null) {
            throw new NotImplementedError('wrong function declaration');
        } else {
            this.assignValue(this.functionValue(statement), statement.id);
        }

        return null;
    }

    evaluateExpressionStatement(statement: ExpressionStatement): null {
        this.evaluateExpression(statement.expression);

        return null;
    }

    evaluateReturnStatement(statement: ReturnStatement): Value {
        if (statement.argument === null) {
            return undefinedValue;
        } else {
            return this.evaluateExpression(statement.argument);
        }
    }

    evaluateBlockStatement(statement: BlockStatement): null {
        const childScope = this.createChildScope();
        
        childScope.evaluateStatements(statement);

        return null;
    }

    evaluateIfStatement(statement: IfStatement): null {
        const test = this.evaluateExpression(statement.test);

        if (this.engine.toBoolean(test)) {
            this.evaluateStatement(statement.consequent);
        } else if(statement.alternate !== null) {
            this.evaluateStatement(statement.alternate);
        }

        return null;
    }

    evaluateNumericLiteral(expression: NumericLiteral): NumberValue {
        return numberValue(expression.value);
    }

    evaluateStringLiteral(expression: StringLiteral): StringValue {
        return stringValue(expression.value);
    }

    evaluateBooleanLiteral(expression: BooleanLiteral): BooleanValue {
        return booleanValue(expression.value);
    }

    evaluateCallExpression(expression: CallExpression): Value {
        const callee = this.evaluateExpression(expression.callee);

        const thisArg = this.getThisArg(expression.callee);
        const args = expression.arguments.map(arg => this.evaluateExpression(arg));

        return this.engine.executeFunction(callee, thisArg, args);
    }

    evaluateNewExpression(expression: NewExpression): Value {
        const callee = this.evaluateExpression(expression.callee);
        
        if (callee.type !== 'object') {
            throw new NotImplementedError('new is unsupported for ' + callee.type);
        }
    
        if (callee.prototype !== this.engine.functionPrototype) {
            throw new NotImplementedError('cannot use new for non-function');
        }

        const prototype = getObjectField(callee, 'prototype');
        
        if (prototype.type !== 'object') {
            throw new NotImplementedError('prototype cannot be ' + callee.type);
        }

        const thisArg = objectValue(prototype);
        const args = expression.arguments.map(arg => this.evaluateExpression(arg));
        
        const result = this.engine.executeFunction(callee, thisArg, args);
        
        return result === undefinedValue ? thisArg : result;
    }
    
    getThisArg(callee: Expression): Value {
        switch (callee.type) {
            case 'MemberExpression':
                return this.evaluateExpression(callee.object);
            default:
                return undefinedValue;
        }
    }

    evaluateThisExpression(expression: ThisExpression): Value {
        return this.thisValue;
    }

    evaluateUnaryExpression(expression: UnaryExpression): Value {
        const argument = this.evaluateExpression(expression.argument);

        switch (expression.operator) {
            case '+':
                return numberValue(this.engine.toNumber(argument));
            case '-':
                return numberValue(-this.engine.toNumber(argument));
            case '!':
                return booleanValue(!this.engine.toBoolean(argument));
            case 'typeof':
                return stringValue(this.typeofValue(argument));
        }

        throw new NotImplementedError('unsupported operator ' + expression.operator);
    }

    typeofValue(value: Value): Value['type'] | 'function' {
        switch(value.type) {
            case 'null':
                return 'object';
            case 'object':
                if (value.prototype === this.engine.functionPrototype) {
                    return 'function';
                }
                break;
        }

        return value.type;
    }

    evaluateBinaryExpression(expression: BinaryExpression): Value {
        const left = this.evaluateExpression(expression.left);
        const right = this.evaluateExpression(expression.right);

        switch (expression.operator) {
            case '+':
                if (left.type === 'string' || right.type === 'string') {
                    return stringValue(this.engine.toString(left) + this.engine.toString(right));
                } else {
                    return numberValue(this.engine.toNumber(left) + this.engine.toNumber(right));
                }
            case '-':
                return numberValue(this.engine.toNumber(left) - this.engine.toNumber(right));
            case '*':
                return numberValue(this.engine.toNumber(left) * this.engine.toNumber(right));
            case '**':
                return numberValue(this.engine.toNumber(left) ** this.engine.toNumber(right));
            case '/':
                return numberValue(this.engine.toNumber(left) / this.engine.toNumber(right));
            case '===':
                return booleanValue(this.strictEqual(left, right));
            case '!==':
                return booleanValue(!this.strictEqual(left, right));
            case 'instanceof':
                return booleanValue(this.isInstanceOf(left, right));
        }

        throw new NotImplementedError('unsupported operator ' + expression.operator);
    }

    isInstanceOf(left: Value, right: Value): boolean {
        if (right.type !== 'object' || right.prototype !== this.engine.functionPrototype) {
            throw new NotImplementedError(`Right-hand side of 'instanceof' is not an object`);
        }

        if(left.type !== 'object') {
            return false;
        }
        
        return left.prototype === right.ownFields.prototype;
    }

    strictEqual(left: Value, right: Value): boolean {
        const type = left.type;

        if (type !== right.type) {
            return false;
        }

        if (type === 'undefined' || type === 'null') {
            return true;
        }

        if (type === 'number' || type === 'boolean' || type === 'string') {
            return (left as any).value === (right as any).value;
        }
        
        return left === right;
    }

    evaluateObjectExpression(expression: ObjectExpression): ObjectValue {
        const fields: ObjectFields = {};

        for(const property of expression.properties) {
            switch(property.type) {
                case 'ObjectProperty':
                    const key: Identifier = property.key;
                    fields[key.name] = this.evaluateExpression(property.value);
                    break;
                case 'ObjectMethod':
                    const methodKey: Identifier = property.key;
                    if (property.kind !== 'method') {
                        throw new NotImplementedError('getters/setters are unsupported ' + property.kind);
                    }

                    fields[methodKey.name] = this.functionValue(property);
                    break;
                default:
                    throw new NotImplementedError('unsupported property type ' + property.type);
            }
        }

        return objectValue(this.engine.rootPrototype, fields);
    }

    evaluateFunctionExpression(expression: FunctionExpression): Value {
        return this.functionValue(expression);
    }

    evaluateMemberExpression(expression: MemberExpression): Value {
        const object = this.evaluateExpression(expression.object);
        const key: Identifier = expression.property;

        if (object.type !== 'object') {
            throw new NotImplementedError('member access is unsupported for ' + object.type);
        }

        return getObjectField(object, key.name);
    }

    evaluateAssignmentExpression(expression: AssignmentExpression): Value {
        const value = this.evaluateExpression(expression.right);
        this.assignValue(value, expression.left);
        return value;
    }
    
    evaluateIdentifier(expression: Identifier): Value {
        if (this.variables.hasOwnProperty(expression.name)) {
            return this.variables[expression.name];
        }

        if (this.parent !== null) {
            return this.parent.evaluateIdentifier(expression);
        }

        return undefinedValue;
    }

    assignIdentifier(value: Value, to: Identifier): void {
        if (this.variables.hasOwnProperty(to.name)) {
            this.variables[to.name] = value;
        } else {
            if (this.parent === null) {
                throw new NotImplementedError('cannot assign variable as it is not defined ' + to.name);
            }

            this.parent.assignIdentifier(value, to);
        }
    }

    assignMember(value: Value, to: MemberExpression): void {
        const object = this.evaluateExpression(to.object);
        const key: Identifier = to.property;

        if (object.type !== 'object') {
            throw new NotImplementedError('member assignment is unsupported for ' + object.type);
        }

        object.ownFields[key.name] = value;
    }

    assignValue(value: Value, to: LVal): void {
        switch(to.type) {
            case 'Identifier':
                return this.assignIdentifier(value, to);
            case 'MemberExpression':
                return this.assignMember(value, to);
        }

        throw new NotImplementedError('unsupported left value type ' + to.type);
    }

    functionValue(statement: FunctionExpression | FunctionDeclaration | ObjectMethod) {
        return this.engine.functionValue((thisArg, argValues) => {
            let index = 0;
            
            const childScope = this.createChildScope(thisArg);
            for(const parameter of statement.params) {
                switch(parameter.type) {
                    case 'Identifier':
                        const argumentValue = index < argValues.length ?
                            argValues[index] :
                            undefinedValue;
                        childScope.variables[parameter.name] = argumentValue;
                    break;
                    default:
                        throw new NotImplementedError('parameter type ' + parameter.type + ' is not supported');
                }

                index++;
            }

            return childScope.evaluateStatements(statement.body);
        });
    }
}
