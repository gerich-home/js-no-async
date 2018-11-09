import { ArrayExpression, ArrowFunctionExpression, AssignmentExpression, BinaryExpression, Block, BlockStatement, BooleanLiteral, CallExpression, ConditionalExpression, Expression, ExpressionStatement, ForInStatement, ForStatement, FunctionDeclaration, FunctionExpression, Identifier, IfStatement, JSXNamespacedName, LogicalExpression, LVal, MemberExpression, NewExpression, Node, NumericLiteral, ObjectExpression, ObjectMethod, ObjectProperty, PatternLike, ReturnStatement, SpreadElement, Statement, StringLiteral, ThisExpression, ThrowStatement, traverse, TryStatement, UnaryExpression, UpdateExpression, VariableDeclaration, WhileStatement } from '@babel/types';
import { Engine } from './engine';
import { booleanValue, nullValue, numberValue, ParsedScript, stringValue, undefinedValue } from './factories';
import { NotImplementedError } from './notImplementedError';
import { RuntimeError } from './runtimeError';
import { BooleanValue, Context, FunctionContext, FunctionNode, NumberValue, ObjectValue, StringValue, Value } from './types';

type CallStackEntry = {
    caller: Context;
    callee: FunctionContext;
};

function isFunctionNode(node: Node): boolean {
    const type = node.type;

    return type === 'FunctionDeclaration' ||
        type === 'FunctionExpression' ||
        type === 'ObjectMethod' ||
        type === 'ArrowFunctionExpression';
}

export class Scope {
    constructor(
        readonly engine: Engine,
        readonly callStackEntry: CallStackEntry | null,
        readonly parent: Scope | null,
        readonly script: ParsedScript | null,
        readonly thisValue: Value,
        readonly variables: ObjectValue
    ) { }

    createChildScope(script: ParsedScript | null, callStackEntry: CallStackEntry | null, thisValue: Value, variables: ObjectValue): Scope {
        return new Scope(this.engine, callStackEntry, this, script, thisValue, variables);
    }

    evaluateScript(script: ParsedScript): void {
        const programScope = this.createChildScope(script, this.callStackEntry, this.thisValue, this.variables);
        programScope.hoistVars(script.file.program);
        programScope.evaluateStatements(script.file.program);
    }

    hoistVars(block: Block) {
        const self = this;
        const state = {
            functionDepth: 0
        };

        traverse(block, {
            enter(node, ancestors, state) {
                if (state.functionDepth === 0) {
                    switch (node.type) {
                        case 'FunctionDeclaration':
                            self.hoistFunctionDeclaration(node);
                            break;
                        case 'VariableDeclaration':
                            self.hoistVariableDeclaration(node);
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
    }

    evaluateStatements(block: Block): Value | null | 'break' {
        for (const statement of block.body) {
            const result = this.evaluateStatement(statement);

            if (result !== null) {
                return result;
            }
        }

        return null;
    }

    evaluateStatement(statement: Statement): Value | null | 'break' {
        switch (statement.type) {
            case 'VariableDeclaration':
                return this.evaluateVariableDeclaration(statement);
            case 'FunctionDeclaration':
                return null;
            case 'BreakStatement':
                return 'break';
            case 'ExpressionStatement':
                return this.evaluateExpressionStatement(statement);
            case 'BlockStatement':
                return this.evaluateBlockStatement(statement, this.thisValue, this.engine.newObject());
            case 'IfStatement':
                return this.evaluateIfStatement(statement);
            case 'ForStatement':
                return this.evaluateForStatement(statement);
            case 'ForInStatement':
                return this.evaluateForInStatement(statement);
            case 'WhileStatement':
                return this.evaluateWhileStatement(statement);
            case 'ReturnStatement':
                return this.evaluateReturnStatement(statement);
            case 'ThrowStatement':
                return this.evaluateThrowStatement(statement);
            case 'TryStatement':
                return this.evaluateTryStatement(statement);
            default:
                throw new NotImplementedError('not supported statement type ' + statement.type, this.createContext(statement));
        }
    }

    evaluateExpression(expression: Expression | PatternLike | SpreadElement | JSXNamespacedName): Value {
        switch (expression.type) {
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
            case 'ConditionalExpression':
                return this.evaluateConditionalExpression(expression);
            case 'ArrayExpression':
                return this.evaluateArrayExpression(expression);
            case 'FunctionExpression':
                return this.evaluateFunctionExpression(expression);
            case 'ArrowFunctionExpression':
                return this.evaluateArrowFunctionExpression(expression);
            case 'CallExpression':
                return this.evaluateCallExpression(expression);
            case 'NewExpression':
                return this.evaluateNewExpression(expression);
            case 'BinaryExpression':
                return this.evaluateBinaryExpression(expression);
            case 'LogicalExpression':
                return this.evaluateLogicalExpression(expression);
            case 'UnaryExpression':
                return this.evaluateUnaryExpression(expression);
            case 'MemberExpression':
                return this.evaluateMemberExpression(expression);
            case 'AssignmentExpression':
                return this.evaluateAssignmentExpression(expression);
            case 'UpdateExpression':
                return this.evaluateUpdateExpression(expression);
            case 'Identifier':
                return this.evaluateIdentifier(expression);
            case 'ThisExpression':
                return this.evaluateThisExpression(expression);
        }

        throw new NotImplementedError('unsupported expression ' + expression.type, this.createContext(expression));
    }

    evaluateVariableDeclaration(statement: VariableDeclaration): null {
        for (const declaration of statement.declarations) {
            switch (declaration.id.type) {
                case 'Identifier':
                    if (declaration.init !== null) {
                        this.engine.defineProperty(this.variables, declaration.id.name, this.evaluateExpression(declaration.init));
                    }

                    break;
                default:
                    throw new NotImplementedError('unsupported variable declaration type: ' + declaration.id.type, this.createContext(statement));
            }
        }

        return null;
    }

    hoistVariableDeclaration(statement: VariableDeclaration): null {
        for (const declaration of statement.declarations) {
            switch (declaration.id.type) {
                case 'Identifier':
                    this.engine.defineProperty(this.variables, declaration.id.name, undefinedValue);
                    break;
                default:
                    throw new NotImplementedError('unsupported variable declaration type: ' + declaration.id.type, this.createContext(statement));
            }
        }

        return null;
    }

    hoistFunctionDeclaration(statement: FunctionDeclaration): null {
        if (statement.id === null) {
            throw new NotImplementedError('wrong function declaration', this.createContext(statement));
        } else {
            this.engine.defineProperty(this.variables, statement.id.name, this.functionValue(statement, statement.id.name));
        }

        return null;
    }

    evaluateExpressionStatement(statement: ExpressionStatement): null {
        this.evaluateExpression(statement.expression);

        return null;
    }

    evaluateThrowStatement(statement: ThrowStatement): null {
        throw new RuntimeError(this.evaluateExpression(statement.argument), this.createContext(statement));
    }

    evaluateReturnStatement(statement: ReturnStatement): Value {
        if (statement.argument === null) {
            return undefinedValue;
        } else {
            return this.evaluateExpression(statement.argument);
        }
    }

    evaluateTryStatement(statement: TryStatement): Value | 'break' | null {
        let trueError = false;

        try {
            return this.evaluateBlockStatement(statement.block, this.thisValue, this.engine.newObject());
        } catch (err) {
            if (err instanceof RuntimeError && statement.handler !== null) {
                const catchVars = this.engine.newObject();

                if(statement.handler.param !== null) {
                    this.engine.defineProperty(catchVars, statement.handler.param.name, err.thrownValue);
                }

                return this.evaluateBlockStatement(statement.handler.body, this.thisValue, catchVars);
            } else {
                trueError = true;
                throw err;
            }
        } finally {
            if (!trueError && statement.finalizer !== null) {
                return this.evaluateBlockStatement(statement.finalizer, this.thisValue, this.engine.newObject());
            }
        }
    }

    evaluateBlockStatement(statement: BlockStatement, thisArg: Value, variables: ObjectValue): Value | 'break' | null {
        const childScope = this.createChildScope(this.script, this.callStackEntry, thisArg, variables);

        return childScope.evaluateStatements(statement);
    }

    evaluateIfStatement(statement: IfStatement): Value | 'break' | null {
        const test = this.evaluateExpression(statement.test);

        if (this.engine.toBoolean(test)) {
            return this.evaluateStatement(statement.consequent);
        } else if (statement.alternate !== null) {
            return this.evaluateStatement(statement.alternate);
        }

        return null;
    }

    evaluateForStatement(statement: ForStatement): Value | 'break' | null {
        const childScope = this.createChildScope(this.script, this.callStackEntry, this.thisValue, this.engine.newObject());

        if (statement.init !== null) {
            if (statement.init.type === 'VariableDeclaration') {
                childScope.evaluateVariableDeclaration(statement.init);
            } else {
                childScope.evaluateExpression(statement.init);
            }
        }

        while (statement.test === null ? true : this.engine.toBoolean(childScope.evaluateExpression(statement.test))) {
            const result = childScope.evaluateStatement(statement.body);

            if (result !== null) {
                return (result === 'break') ? null : result;
            }

            if (statement.update !== null) {
                childScope.evaluateExpression(statement.update);
            }
        }

        return null;
    }

    evaluateForInStatement(statement: ForInStatement): Value | 'break' | null {
        const childScope = this.createChildScope(this.script, this.callStackEntry, this.thisValue, this.engine.newObject());

        if (statement.left.type !== 'VariableDeclaration') {
            throw new NotImplementedError('unsupported type of variable declaration in for of: ' + statement.left.type, this.createContext(statement));
        }

        const iterated = this.evaluateExpression(statement.right);

        if (iterated.type !== 'object') {
            throw new NotImplementedError('unsupported type of iterated object in for of: ' + iterated.type, this.createContext(statement));
        }

        for (const p of iterated.ownProperties.entries()) {
            if (p[1].enumerable === false) {
                continue;
            }

            this.assignValue(stringValue(p[0]), statement.left.declarations[0].id);
            const result = childScope.evaluateStatement(statement.body);

            if (result !== null) {
                return (result === 'break') ? null : result;
            }
        }

        return null;
    }

    evaluateWhileStatement(statement: WhileStatement): Value | 'break' | null {
        const childScope = this.createChildScope(this.script, this.callStackEntry, this.thisValue, this.engine.newObject());

        while (this.engine.toBoolean(childScope.evaluateExpression(statement.test))) {
            const result = childScope.evaluateStatement(statement.body);

            if (result !== null) {
                return (result === 'break') ? null : result;
            }
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

        return this.engine.executeFunction(callee, thisArg, args, this.createContext(expression));
    }

    evaluateNewExpression(expression: NewExpression): Value {
        const callee = this.evaluateExpression(expression.callee);
        const args = expression.arguments.map(arg => this.evaluateExpression(arg));

        return this.engine.constructObject(callee, args, this.createContext(expression));
    }

    getThisArg(callee: Expression): Value {
        switch (callee.type) {
            case 'MemberExpression':
                return this.evaluateExpression(callee.object);
            default:
                return this.engine.globalVars;
        }
    }

    evaluateThisExpression(expression: ThisExpression): Value {
        return this.thisValue;
    }

    evaluateUnaryExpression(expression: UnaryExpression): Value {
        const argument = this.evaluateExpression(expression.argument);

        switch (expression.operator) {
            case '+':
                return numberValue(this.engine.toNumber(argument, this.createContext(expression)));
            case '-':
                return numberValue(-this.engine.toNumber(argument, this.createContext(expression)));
            case '!':
                return booleanValue(!this.engine.toBoolean(argument));
            case 'typeof':
                return stringValue(this.typeofValue(argument));
            case 'delete':
                return this.evaluateDeleteUnaryExpression(expression);
        }

        throw new NotImplementedError('unsupported operator ' + expression.operator, this.createContext(expression));
    }

    evaluateDeleteUnaryExpression(expression: UnaryExpression): Value {
        if(expression.argument.type !== 'MemberExpression') {
            throw new NotImplementedError('arhument of delete should be MemberExpression ' + expression.operator, this.createContext(expression));
        }

        const member = expression.argument;

        const object = this.evaluateExpression(member.object);
        
        if (object.type !== 'object') {
            throw new NotImplementedError('member access is unsupported for ' + object.type, this.createContext(expression));
        }

        const propertyName = this.evaluatePropertyName(member);
        
        const existingProperty = object.ownProperties.get(propertyName);
        if (existingProperty !== undefined && existingProperty.configurable === false) {
            return booleanValue(false);
        }

        return booleanValue(object.ownProperties.delete(propertyName));
    }

    typeofValue(value: Value): Value['type'] | 'function' {
        switch (value.type) {
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
                    return stringValue(this.engine.toString(left, this.createContext(expression)) + this.engine.toString(right, this.createContext(expression)));
                } else {
                    return numberValue(this.engine.toNumber(left, this.createContext(expression)) + this.engine.toNumber(right, this.createContext(expression)));
                }
            case '-':
                return numberValue(this.engine.toNumber(left, this.createContext(expression)) - this.engine.toNumber(right, this.createContext(expression)));
            case '*':
                return numberValue(this.engine.toNumber(left, this.createContext(expression)) * this.engine.toNumber(right, this.createContext(expression)));
            case '**':
                return numberValue(this.engine.toNumber(left, this.createContext(expression)) ** this.engine.toNumber(right, this.createContext(expression)));
            case '/':
                return numberValue(this.engine.toNumber(left, this.createContext(expression)) / this.engine.toNumber(right, this.createContext(expression)));
            case '===':
                return booleanValue(this.strictEqual(left, right));
            case '!==':
                return booleanValue(!this.strictEqual(left, right));
            case '>':
                return booleanValue(this.engine.toNumber(left, this.createContext(expression)) > this.engine.toNumber(right, this.createContext(expression)));
            case '<':
                return booleanValue(this.engine.toNumber(left, this.createContext(expression)) < this.engine.toNumber(right, this.createContext(expression)));
            case 'instanceof':
                return booleanValue(this.isInstanceOf(left, right, expression));
        }

        throw new NotImplementedError('unsupported operator ' + expression.operator, this.createContext(expression));
    }

    evaluateLogicalExpression(expression: LogicalExpression): Value {
        const left = this.evaluateExpression(expression.left);
        const right = () => this.evaluateExpression(expression.right);

        switch (expression.operator) {
            case '||':
                return this.engine.toBoolean(left) ? left : right();
            case '&&':
                return this.engine.toBoolean(left) ? right() : left;
        }

        throw new NotImplementedError('unsupported operator ' + expression.operator, this.createContext(expression));
    }

    isInstanceOf(left: Value, right: Value, expression: Expression): boolean {
        if (right.type !== 'object' || right.prototype !== this.engine.functionPrototype) {
            throw new NotImplementedError(`Right-hand side of 'instanceof' is not an object`, this.createContext(expression));
        }

        if (left.type !== 'object') {
            return false;
        }

        const prototype = this.engine.readProperty(right, 'prototype', this.createContext(expression));

        return left.prototype === prototype;
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

    evaluateConditionalExpression(expression: ConditionalExpression): Value {
        const selectedExpression = this.engine.toBoolean(this.evaluateExpression(expression.test)) ?
            expression.consequent :
            expression.alternate;

        return this.evaluateExpression(selectedExpression);
    }

    evaluateObjectExpression(expression: ObjectExpression): ObjectValue {
        const result = this.engine.newObject();

        for (const property of expression.properties) {
            switch (property.type) {
                case 'ObjectProperty':
                    const propertyName = this.evaluatePropertyName(property);
                    this.engine.defineProperty(result, propertyName, this.evaluateExpression(property.value));
                    break;
                case 'ObjectMethod':
                    const methodName = this.evaluatePropertyName(property);
                    const method = this.functionValue(property, methodName)

                    switch(property.kind) {
                        case 'method':
                            this.engine.defineProperty(result, methodName, method);
                            break;
                        case 'get':
                            this.engine.defineProperty(result, methodName, {
                                descriptorType: 'accessor',
                                getter: method
                            });
                            break;
                        case 'set':
                            this.engine.defineProperty(result, methodName, {
                                descriptorType: 'accessor',
                                setter: method
                            });
                            break;
                    }
                    break;
                default:
                    throw new NotImplementedError('unsupported property type ' + property.type, this.createContext(expression));
            }
        }

        return result;
    }

    evaluatePropertyName(property: ObjectProperty | ObjectMethod | MemberExpression): string {
        const key: Expression = property.type === 'MemberExpression' ? property.property : property.key;
            
        if (!property.computed) {
            if (key.type !== 'Identifier') {
                throw new NotImplementedError('getters/setters are unsupported ' + key.type, this.createContext(key));
            }

            return key.name;
        }
        
        return this.engine.toString(this.evaluateExpression(key), this.createContext(property));
    }

    evaluateArrayExpression(expression: ArrayExpression): Value {
        const elements = expression.elements.map(value => value === null ? undefinedValue : this.evaluateExpression(value));
        
        return this.engine.constructObject(this.engine.globals.Array, elements, this.createContext(expression));
    }

    evaluateFunctionExpression(expression: FunctionExpression): Value {
        return this.functionValue(expression, expression.id && expression.id.name);
    }

    evaluateArrowFunctionExpression(expression: ArrowFunctionExpression): Value {
        return this.functionValue(expression);
    }

    evaluateMemberExpression(expression: MemberExpression): Value {
        const object = this.evaluateExpression(expression.object);
        
        if (object.type !== 'object') {
            throw new NotImplementedError('member access is unsupported for ' + object.type, this.createContext(expression));
        }

        const propertyName = this.evaluatePropertyName(expression);
        
        const result = this.engine.readProperty(object, propertyName, this.createContext(expression));
        
        return result;
    }

    evaluateAssignmentExpression(expression: AssignmentExpression): Value {
        const value = this.evaluateExpression(expression.right);
        this.assignValue(value, expression.left);
        return value;
    }

    evaluateUpdateExpression(expression: UpdateExpression): Value {
        const value = this.engine.toNumber(this.evaluateExpression(expression.argument), this.createContext(expression));
        const newValue = numberValue((expression.operator === '++' ? 1 : (-1)) + value);
        this.assignValue(newValue, expression.argument as any);
        return expression.prefix ? newValue : numberValue(value);
    }

    evaluateIdentifier(expression: Identifier): Value {
        const variable = this.engine.getPropertyDescriptor(this.variables, expression.name);
        
        if (variable !== null) {
            return this.engine.readPropertyDescriptorValue(this.variables, variable, this.createContext(expression));
        }

        if (this.parent !== null) {
            return this.parent.evaluateIdentifier(expression);
        }

        return undefinedValue;
    }

    assignIdentifier(value: Value, to: Identifier): void {
        if (this.variables.ownProperties.has(to.name)) {
            this.engine.assignProperty(this.variables, to.name, value, this.createContext(to));
        } else {
            if (this.parent === null) {
                throw new NotImplementedError('cannot assign variable as it is not defined ' + to.name, this.createContext(to));
            }

            this.parent.assignIdentifier(value, to);
        }
    }

    assignMember(value: Value, to: MemberExpression): void {
        const object = this.evaluateExpression(to.object);
        
        if (object.type !== 'object') {
            throw new NotImplementedError('member assignment is unsupported for ' + object.type, this.createContext(to));
        }

        const propertyName = this.evaluatePropertyName(to);
        this.engine.assignProperty(object, propertyName, value, this.createContext(to));
    }

    assignValue(value: Value, to: LVal): void {
        switch (to.type) {
            case 'Identifier':
                return this.assignIdentifier(value, to);
            case 'MemberExpression':
                return this.assignMember(value, to);
        }

        throw new NotImplementedError('unsupported left value type ' + to.type, this.createContext(to));
    }

    functionValue(statement: FunctionNode, name: string | null = null) {
        return this.engine.functionValue((thisArg, argValues, caller) => {
            if (statement.type === 'ArrowFunctionExpression' && statement.body.type !== 'BlockStatement') {
                return this.evaluateExpression(statement.body);
            }

            const thisValue = statement.type === 'ArrowFunctionExpression' ? this.thisValue : thisArg;
            const childScope = this.createChildScope(this.script, {
                caller,
                callee: {
                    node: statement,
                    scope: this
                }
            }, thisValue, this.localVariables(statement, argValues));

            const body = statement.body as BlockStatement;

            childScope.hoistVars(body);

            const result = childScope.evaluateStatements(body);
            
            if (result === 'break') {
                throw new NotImplementedError('return should not be break', this.createContext(statement));
            }
            
            return result || undefinedValue;
        }, name);
    }

    localVariables(statement: FunctionNode, argValues: Value[]): ObjectValue {
        let index = 0;

        const args = this.engine.newObject();
        this.engine.defineProperty(args, 'length', numberValue(argValues.length));

        const variables = this.engine.newObject();

        this.engine.defineProperty(variables, 'arguments', args);

        for (const parameter of statement.params) {
            switch (parameter.type) {
                case 'Identifier':
                    const argumentValue = index < argValues.length ?
                        argValues[index] :
                        undefinedValue;
                        
                    this.engine.defineProperty(args, index.toString(), argumentValue);
                    this.engine.defineProperty(variables, parameter.name, argumentValue);
                    break;
                default:
                    throw new NotImplementedError('parameter type ' + parameter.type + ' is not supported', this.createContext(parameter));
            }

            index++;
        }

        return variables;
    }

    createContext(node: Node): Context {
        return {
            node,
            scope: this
        };
    }
}
