import { ArrayExpression, ArrowFunctionExpression, AssignmentExpression, BinaryExpression, Block, BlockStatement, BooleanLiteral, CallExpression, ConditionalExpression, Expression, ExpressionStatement, ForStatement, FunctionDeclaration, FunctionExpression, Identifier, IfStatement, JSXNamespacedName, LogicalExpression, LVal, MemberExpression, NewExpression, Node, NumericLiteral, ObjectExpression, PatternLike, ReturnStatement, SpreadElement, Statement, StringLiteral, ThisExpression, ThrowStatement, traverse, TryStatement, UnaryExpression, VariableDeclaration } from '@babel/types';
import { Engine } from './engine';
import { booleanValue, nullValue, numberValue, objectValue, ParsedScript, stringValue, undefinedValue } from './factories';
import { getObjectField } from './globals';
import { NotImplementedError } from './notImplementedError';
import { RuntimeError } from './runtimeError';
import { BooleanValue, Context, FunctionContext, FunctionNode, NumberValue, ObjectProperties, ObjectValue, StringValue, Value, Variables } from './types';

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
        readonly variables: Variables
    ) {}
    
    createChildScope(script: ParsedScript | null, callStackEntry: CallStackEntry | null, thisValue: Value, parameters: Variables): Scope {
        return new Scope(this.engine, callStackEntry, this, script, thisValue, parameters);
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
                    switch(node.type) {
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

    evaluateStatements(block: Block): Value | null {
        for (const statement of block.body) {
            const result = this.evaluateStatement(statement);

            if (result !== null) {
                return result;
            }
        }

        return null;
    }

    evaluateStatement(statement: Statement): Value | null {
        switch(statement.type) {
            case 'VariableDeclaration':
                return this.evaluateVariableDeclaration(statement);
            case 'FunctionDeclaration':
                return null;
            case 'ExpressionStatement':
                return this.evaluateExpressionStatement(statement);
            case 'BlockStatement':
                return this.evaluateBlockStatement(statement, this.thisValue, new Map());
            case 'IfStatement':
                return this.evaluateIfStatement(statement);
            case 'ForStatement':
                return this.evaluateForStatement(statement);
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
            case 'Identifier':
                return this.evaluateIdentifier(expression);
            case 'ThisExpression':
                return this.evaluateThisExpression(expression);
        }

        throw new NotImplementedError('unsupported expression ' + expression.type, this.createContext(expression));
    }

    evaluateVariableDeclaration(statement: VariableDeclaration): null {
        for(const declaration of statement.declarations) {
            switch(declaration.id.type) {
                case 'Identifier':
                    if (declaration.init !== null){
                        this.variables.set(declaration.id.name, this.evaluateExpression(declaration.init));
                    }

                    break;
                default:
                    throw new NotImplementedError('unsupported variable declaration type: ' + declaration.id.type, this.createContext(statement));
            }
        }

        return null;
    }

    hoistVariableDeclaration(statement: VariableDeclaration): null {
        for(const declaration of statement.declarations) {
            switch(declaration.id.type) {
                case 'Identifier':
                    this.variables.set(declaration.id.name, undefinedValue);
                    break;
                default:
                    throw new NotImplementedError('unsupported variable declaration type: ' + declaration.id.type, this.createContext(statement));
            }
        }

        return null;
    }

    hoistFunctionDeclaration(statement: FunctionDeclaration): null {
        if(statement.id === null) {
            throw new NotImplementedError('wrong function declaration', this.createContext(statement));
        } else {
            this.variables.set(statement.id.name, this.functionValue(statement, statement.id.name));
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

    evaluateTryStatement(statement: TryStatement): Value | null {
        let trueError = false;
        
        try {
            return this.evaluateBlockStatement(statement.block, this.thisValue, new Map());
        } catch(err) {
            if(err instanceof RuntimeError && statement.handler !== null) {
                return this.evaluateBlockStatement(statement.handler.body, this.thisValue, statement.handler.param === null ? new Map() : new Map([
                    [statement.handler.param.name, err.thrownValue]
                ]));
            } else {
                trueError = true;
                throw err;
            }
        } finally {
            if (!trueError && statement.finalizer !== null) {
                return this.evaluateBlockStatement(statement.finalizer, this.thisValue, new Map());
            }
        }
    }

    evaluateBlockStatement(statement: BlockStatement, thisArg: Value, parameters: Variables): Value | null {
        const childScope = this.createChildScope(this.script, this.callStackEntry, thisArg, parameters);
        
        return childScope.evaluateStatements(statement);
    }

    evaluateIfStatement(statement: IfStatement): Value | null {
        const test = this.evaluateExpression(statement.test);

        if (this.engine.toBoolean(test)) {
            return this.evaluateStatement(statement.consequent);
        } else if(statement.alternate !== null) {
            return this.evaluateStatement(statement.alternate);
        }

        return null;
    }
    
    evaluateForStatement(statement: ForStatement): Value | null {
        const childScope = this.createChildScope(this.script, this.callStackEntry, this.thisValue, new Map());

        if (statement.init !== null) {
            if (statement.init.type === 'VariableDeclaration') {
                childScope.evaluateVariableDeclaration(statement.init);
            } else {
                childScope.evaluateExpression(statement.init);
            }
        }

        while(statement.test === null ? true : this.engine.toBoolean(childScope.evaluateExpression(statement.test))) {
            const result = childScope.evaluateStatement(statement.body);
            
            if (result !== null) {
                return result;
            }

            if (statement.update !== null) {
                childScope.evaluateExpression(statement.update);
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
                return numberValue(this.engine.toNumber(argument, this.createContext(expression)));
            case '-':
                return numberValue(-this.engine.toNumber(argument, this.createContext(expression)));
            case '!':
                return booleanValue(!this.engine.toBoolean(argument));
            case 'typeof':
                return stringValue(this.typeofValue(argument));
        }

        throw new NotImplementedError('unsupported operator ' + expression.operator, this.createContext(expression));
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

        if(left.type !== 'object') {
            return false;
        }
        
        const prototype = right.ownProperties.get('prototype');

        return left.prototype === (prototype && prototype.value);
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
        const fields: ObjectProperties = new Map();

        for(const property of expression.properties) {
            switch(property.type) {
                case 'ObjectProperty':
                    const key: Identifier = property.key;
                    fields.set(key.name, {
                        value: this.evaluateExpression(property.value)
                    });
                    break;
                case 'ObjectMethod':
                    const methodKey: Identifier = property.key;
                    if (property.kind !== 'method') {
                        throw new NotImplementedError('getters/setters are unsupported ' + property.kind, this.createContext(expression));
                    }

                    fields.set(methodKey.name, {
                        value: this.functionValue(property, methodKey.name)
                    });
                    break;
                default:
                    throw new NotImplementedError('unsupported property type ' + property.type, this.createContext(expression));
            }
        }

        return objectValue(this.engine.rootPrototype, fields);
    }

    evaluateArrayExpression(expression: ArrayExpression): Value {
        const array = objectValue(this.engine.globals.Array.prototype);
        array.ownProperties.set('length', {
            value: numberValue(expression.elements.length)
        });
        
        expression.elements.forEach((value, index) => {
            array.ownProperties.set(index.toString(), {
                value:  value === null ? undefinedValue : this.evaluateExpression(value)
            });
        });

        return array;
    }

    evaluateFunctionExpression(expression: FunctionExpression): Value {
        return this.functionValue(expression, expression.id && expression.id.name);
    }

    evaluateArrowFunctionExpression(expression: ArrowFunctionExpression): Value {
        return this.functionValue(expression);
    }

    evaluateMemberExpression(expression: MemberExpression): Value {
        const object = this.evaluateExpression(expression.object);
        const key: Identifier = expression.property;

        if (object.type !== 'object') {
            throw new NotImplementedError('member access is unsupported for ' + object.type, this.createContext(expression));
        }

        return getObjectField(object, key.name);
    }

    evaluateAssignmentExpression(expression: AssignmentExpression): Value {
        const value = this.evaluateExpression(expression.right);
        this.assignValue(value, expression.left);
        return value;
    }
    
    evaluateIdentifier(expression: Identifier): Value {
        const variable = this.variables.get(expression.name);

        if (variable !== undefined) {
            return variable;
        }

        if (this.parent !== null) {
            return this.parent.evaluateIdentifier(expression);
        }

        return undefinedValue;
    }

    assignIdentifier(value: Value, to: Identifier): void {
        if (this.variables.has(to.name)) {
            this.variables.set(to.name, value);
        } else {
            if (this.parent === null) {
                throw new NotImplementedError('cannot assign variable as it is not defined ' + to.name, this.createContext(to));
            }

            this.parent.assignIdentifier(value, to);
        }
    }

    assignMember(value: Value, to: MemberExpression): void {
        const object = this.evaluateExpression(to.object);
        const key: Identifier = to.property;

        if (object.type !== 'object') {
            throw new NotImplementedError('member assignment is unsupported for ' + object.type, this.createContext(to));
        }

        object.ownProperties.set(key.name, {
            value
        });
    }

    assignValue(value: Value, to: LVal): void {
        switch(to.type) {
            case 'Identifier':
                return this.assignIdentifier(value, to);
            case 'MemberExpression':
                return this.assignMember(value, to);
        }

        throw new NotImplementedError('unsupported left value type ' + to.type, this.createContext(to));
    }

    functionValue(statement: FunctionNode, name: string | null = null) {
        const scope = this;

        return this.engine.functionValue((thisArg, argValues, caller) => {
            let index = 0;
            
            const args = scope.engine.newObject(caller);
            args.ownProperties.set('length', {
                value: numberValue(argValues.length)
            });

            const variables: Variables = new Map([
                ['arguments', args]
            ]);

            for(const parameter of statement.params) {
                switch(parameter.type) {
                    case 'Identifier':
                        const argumentValue = index < argValues.length ?
                            argValues[index] :
                            undefinedValue;
                        variables.set(parameter.name, argumentValue);
                    break;
                    default:
                        throw new NotImplementedError('parameter type ' + parameter.type + ' is not supported', scope.createContext(parameter));
                }

                index++;
            }

            if (statement.type === 'ArrowFunctionExpression' && statement.body.type !== 'BlockStatement') {
                return scope.evaluateExpression(statement.body);
            }

            const thisValue = statement.type === 'ArrowFunctionExpression' ? scope.thisValue : thisArg;
            const childScope = scope.createChildScope(scope.script, {
                caller,
                callee: {
                    node: statement,
                    scope
                }
            }, thisValue, variables);
    
            const body = statement.body as BlockStatement;

            childScope.hoistVars(body);
        
            return childScope.evaluateStatements(body) || undefinedValue;
        }, name);
    }

    createContext(node: Node): Context {
        return {
            node,
            scope: this
        };
    }
}
