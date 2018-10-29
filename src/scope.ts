import { File, ArrayExpression, AssignmentExpression, BinaryExpression, Block, BlockStatement, BooleanLiteral, CallExpression, Expression, ExpressionStatement, FunctionDeclaration, FunctionExpression, Identifier, IfStatement, JSXNamespacedName, LogicalExpression, LVal, MemberExpression, NewExpression, Node, NumericLiteral, ObjectExpression, ObjectMethod, PatternLike, Program, ReturnStatement, SpreadElement, Statement, StringLiteral, ThisExpression, ThrowStatement, traverse, TryStatement, UnaryExpression, VariableDeclaration, ArrowFunctionExpression, ForStatement } from '@babel/types';
import { Engine } from './engine';
import { booleanValue, nullValue, numberValue, objectValue, stringValue, undefinedValue, ParsedScript } from './factories';
import { getObjectField } from './globals';
import { NotImplementedError } from './notImplementedError';
import { RuntimeError } from './runtimeError';
import { BooleanValue, NumberValue, ObjectFields, ObjectValue, StringValue, Value, Variables } from './types';

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
        readonly parent: Scope | null,
        readonly script: ParsedScript | null,
        readonly thisValue: Value,
        readonly variables: Variables
    ) {}
    
    createChildScope(script: ParsedScript | null, thisValue: Value, parameters: Variables): Scope {
        return new Scope(this.engine, this, script, thisValue, parameters);
    }

    evaluateProgram(script: ParsedScript): void {
        this.hoistVars(script.file.program);
        const programScope = this.createChildScope(script, this.thisValue, {});
        programScope.evaluateStatements(script.file.program);
    }

    getHoistedVars(block: Block): string[] {
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

        return state.vars;
    }

    hoistVars(block: Block) {
        const hoistedVars = this.getHoistedVars(block);

        for (const varName of hoistedVars) {
            this.variables[varName] = undefinedValue;
        }
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
                return this.evaluateFunctionDeclaration(statement);
            case 'ExpressionStatement':
                return this.evaluateExpressionStatement(statement);
            case 'BlockStatement':
                return this.evaluateBlockStatement(statement, this.thisValue, {});
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
                throw new NotImplementedError('not supported statement type ' + statement.type, statement, this);
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

        throw new NotImplementedError('unsupported expression ' + expression.type, expression, this);
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
            throw new NotImplementedError('wrong function declaration', statement, this);
        } else {
            this.assignValue(this.functionValue(statement), statement.id);
        }

        return null;
    }

    evaluateExpressionStatement(statement: ExpressionStatement): null {
        this.evaluateExpression(statement.expression);

        return null;
    }

    evaluateThrowStatement(statement: ThrowStatement): null {
        throw new RuntimeError(statement, this.evaluateExpression(statement.argument), this);
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
            return this.evaluateBlockStatement(statement.block, this.thisValue, {});
        } catch(err) {
            if(err instanceof RuntimeError && statement.handler !== null) {
                return this.evaluateBlockStatement(statement.handler.body, this.thisValue, statement.handler.param === null ? {} : {
                    [statement.handler.param.name]: err.thrownValue
                });
            } else {
                trueError = true;
                throw err;
            }
        } finally {
            if (!trueError && statement.finalizer !== null) {
                return this.evaluateBlockStatement(statement.finalizer, this.thisValue, {});
            }
        }
    }

    evaluateBlockStatement(statement: BlockStatement, thisArg: Value, parameters: Variables): Value | null {
        const childScope = this.createChildScope(this.script, thisArg, parameters);
        
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
        const childScope = this.createChildScope(this.script, this.thisValue, {});

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

        return this.engine.executeFunction(callee, thisArg, args, expression, this);
    }

    evaluateNewExpression(expression: NewExpression): Value {
        const callee = this.evaluateExpression(expression.callee);
        
        if (callee.type !== 'object') {
            throw new NotImplementedError('new is unsupported for ' + callee.type, expression, this);
        }
    
        if (callee.prototype !== this.engine.functionPrototype) {
            throw new NotImplementedError('cannot use new for non-function', expression, this);
        }

        const prototype = getObjectField(callee, 'prototype');
        
        if (prototype.type !== 'object') {
            throw new NotImplementedError('prototype cannot be ' + callee.type, expression, this);
        }

        const thisArg = objectValue(prototype);
        const args = expression.arguments.map(arg => this.evaluateExpression(arg));
        
        const result = this.engine.executeFunction(callee, thisArg, args, expression, this);
        
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

        throw new NotImplementedError('unsupported operator ' + expression.operator, expression, this);
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
            case '>':
                return booleanValue(this.engine.toNumber(left) > this.engine.toNumber(right));
            case '<':
                return booleanValue(this.engine.toNumber(left) < this.engine.toNumber(right));
            case 'instanceof':
                return booleanValue(this.isInstanceOf(left, right, expression));
        }

        throw new NotImplementedError('unsupported operator ' + expression.operator, expression, this);
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

        throw new NotImplementedError('unsupported operator ' + expression.operator, expression, this);
    }

    isInstanceOf(left: Value, right: Value, expression: Expression): boolean {
        if (right.type !== 'object' || right.prototype !== this.engine.functionPrototype) {
            throw new NotImplementedError(`Right-hand side of 'instanceof' is not an object`, expression, this);
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
                        throw new NotImplementedError('getters/setters are unsupported ' + property.kind, expression, this);
                    }

                    fields[methodKey.name] = this.functionValue(property);
                    break;
                default:
                    throw new NotImplementedError('unsupported property type ' + property.type, expression, this);
            }
        }

        return objectValue(this.engine.rootPrototype, fields);
    }

    evaluateArrayExpression(expression: ArrayExpression): Value {
        const array = objectValue(this.engine.globals.Array.prototype);
        array.ownFields.length = numberValue(expression.elements.length);
        
        expression.elements.forEach((value, index) => {
            array.ownFields[index] = value === null ? undefinedValue : this.evaluateExpression(value);
        });

        array.ownFields.length = numberValue(expression.elements.length);
        return array;
    }

    evaluateFunctionExpression(expression: FunctionExpression): Value {
        return this.functionValue(expression);
    }

    evaluateArrowFunctionExpression(expression: ArrowFunctionExpression): Value {
        return this.functionValue(expression);
    }

    evaluateMemberExpression(expression: MemberExpression): Value {
        const object = this.evaluateExpression(expression.object);
        const key: Identifier = expression.property;

        if (object.type !== 'object') {
            throw new NotImplementedError('member access is unsupported for ' + object.type, expression, this);
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
                throw new NotImplementedError('cannot assign variable as it is not defined ' + to.name, to, this);
            }

            this.parent.assignIdentifier(value, to);
        }
    }

    assignMember(value: Value, to: MemberExpression): void {
        const object = this.evaluateExpression(to.object);
        const key: Identifier = to.property;

        if (object.type !== 'object') {
            throw new NotImplementedError('member assignment is unsupported for ' + object.type, to, this);
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

        throw new NotImplementedError('unsupported left value type ' + to.type, to, this);
    }

    functionValue(statement: FunctionExpression | FunctionDeclaration | ObjectMethod | ArrowFunctionExpression) {
        const outerThisValue = this.thisValue;

        return this.engine.functionValue((thisArg, argValues) => {
            let index = 0;
            
            const variables: Variables = {};
            
            const args = this.engine.objectConstructor();
            args.ownFields.length = numberValue(argValues.length);

            variables.arguments = args;

            for(const parameter of statement.params) {
                switch(parameter.type) {
                    case 'Identifier':
                        const argumentValue = index < argValues.length ?
                            argValues[index] :
                            undefinedValue;
                        variables[parameter.name] = argumentValue;
                    break;
                    default:
                        throw new NotImplementedError('parameter type ' + parameter.type + ' is not supported', parameter, this);
                }

                index++;
            }

            if (statement.type === 'ArrowFunctionExpression' && statement.body.type !== 'BlockStatement') {
                return this.evaluateExpression(statement.body);
            }

            const thisValue = statement.type === 'ArrowFunctionExpression' ? outerThisValue : thisArg;
            const childScope = this.createChildScope(this.script, thisValue, variables);
    
            const body = statement.body as BlockStatement;

            childScope.hoistVars(body);
        
            return childScope.evaluateStatements(body) || undefinedValue;
        });
    }
}
