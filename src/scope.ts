import { ArrayExpression, ArrowFunctionExpression, AssignmentExpression, BinaryExpression, Block, BlockStatement, BooleanLiteral, CallExpression, ConditionalExpression, Expression, ExpressionStatement, ForInStatement, ForStatement, FunctionDeclaration, FunctionExpression, Identifier, IfStatement, JSXNamespacedName, LogicalExpression, LVal, MemberExpression, NewExpression, Node, NumericLiteral, ObjectExpression, ObjectMethod, ObjectProperty, PatternLike, RegExpLiteral, ReturnStatement, SequenceExpression, SpreadElement, Statement, StringLiteral, ThisExpression, ThrowStatement, traverse, TryStatement, UnaryExpression, UpdateExpression, VariableDeclaration, WhileStatement } from '@babel/types';
import { Engine } from './engine';
import { booleanValue, nullValue, numberValue, ParsedScript, stringValue, undefinedValue } from './factories';
import { isFunctionNode } from './globals';
import { NotImplementedError } from './notImplementedError';
import { RuntimeError } from './runtimeError';
import { BooleanValue, CallStackEntry, Context, FunctionNode, NumberValue, ObjectPropertyDescriptor, ObjectValue, StringValue, Value } from './types';

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
            case 'EmptyStatement':
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
                throw new NotImplementedError(this.createContext(statement), 'not supported statement type ' + statement.type);
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
            case 'SequenceExpression':
                return this.evaluateSequenceExpression(expression);
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
            case 'RegExpLiteral':
                return this.evaluateRegExpLiteral(expression);
            case 'ThisExpression':
                return this.evaluateThisExpression(expression);
        }

        throw new NotImplementedError(this.createContext(expression), 'unsupported expression ' + expression.type);
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
                    throw new NotImplementedError(this.createContext(statement), 'unsupported variable declaration type: ' + declaration.id.type);
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
                    throw new NotImplementedError(this.createContext(statement), 'unsupported variable declaration type: ' + declaration.id.type);
            }
        }

        return null;
    }

    hoistFunctionDeclaration(statement: FunctionDeclaration): null {
        if (statement.id === null) {
            throw new NotImplementedError(this.createContext(statement), 'wrong function declaration');
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
        throw new RuntimeError(this.createContext(statement), this.evaluateExpression(statement.argument));
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
            throw new NotImplementedError(this.createContext(statement), 'unsupported type of variable declaration in for of: ' + statement.left.type);
        }

        const iterated = this.evaluateExpression(statement.right);

        if (iterated.type !== 'object') {
            throw new NotImplementedError(this.createContext(statement), 'unsupported type of iterated object in for of: ' + iterated.type);
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
        
        if (!this.engine.isFunction(callee)) {
            const start = expression.callee.start;
            const end = expression.callee.end;

            if (this.script && start !== null && end !== null) {
                throw this.engine.newReferenceError(this.createContext(expression), this.script.sourceCode.slice(start, end) + ' is not a function');
            } else {
                throw this.engine.newReferenceError(this.createContext(expression), 'cannot call non-function ' + callee.type);
            }
        }

        return this.engine.executeFunction(this.createContext(expression), callee, thisArg, args);
    }

    evaluateNewExpression(expression: NewExpression): Value {
        const callee = this.evaluateExpression(expression.callee);
        const args = expression.arguments.map(arg => this.evaluateExpression(arg));

        return this.engine.constructObject(this.createContext(expression), callee, args);
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
                return numberValue(this.engine.toNumber(this.createContext(expression), argument));
            case '-':
                return numberValue(-this.engine.toNumber(this.createContext(expression), argument));
            case '~':
                return numberValue(~this.engine.toNumber(this.createContext(expression), argument));
            case '!':
                return booleanValue(!this.engine.toBoolean(argument));
            case 'typeof':
                return stringValue(this.typeofValue(argument));
            case 'delete':
                return this.evaluateDeleteUnaryExpression(expression);
        }

        throw new NotImplementedError(this.createContext(expression), 'unsupported operator ' + expression.operator);
    }

    evaluateDeleteUnaryExpression(expression: UnaryExpression): Value {
        if(expression.argument.type !== 'MemberExpression') {
            throw new NotImplementedError(this.createContext(expression), 'argument of delete should be MemberExpression ' + expression.operator);
        }

        const member = expression.argument;

        const object = this.evaluateExpression(member.object);
        
        if (object.type !== 'object') {
            throw new NotImplementedError(this.createContext(expression), 'member access is unsupported for ' + object.type);
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
                if (this.engine.isFunction(value)) {
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
                    return stringValue(this.engine.toString(this.createContext(expression), left) + this.engine.toString(this.createContext(expression), right));
                } else {
                    return numberValue(this.engine.toNumber(this.createContext(expression), left) + this.engine.toNumber(this.createContext(expression), right));
                }
            case '-':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) - this.engine.toNumber(this.createContext(expression), right));
            case '*':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) * this.engine.toNumber(this.createContext(expression), right));
            case '**':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) ** this.engine.toNumber(this.createContext(expression), right));
            case '/':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) / this.engine.toNumber(this.createContext(expression), right));
            case '%':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) % this.engine.toNumber(this.createContext(expression), right));
            case '&':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) & this.engine.toNumber(this.createContext(expression), right));
            case '|':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) | this.engine.toNumber(this.createContext(expression), right));
            case '^':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) ^ this.engine.toNumber(this.createContext(expression), right));
            case '<<':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) << this.engine.toNumber(this.createContext(expression), right));
            case '>>':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) >> this.engine.toNumber(this.createContext(expression), right));
            case '>>>':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) >>> this.engine.toNumber(this.createContext(expression), right));
            case '===':
                return booleanValue(this.strictEqual(left, right));
            case '!==':
                return booleanValue(!this.strictEqual(left, right));
            case '>':
                return booleanValue(this.engine.toNumber(this.createContext(expression), left) > this.engine.toNumber(this.createContext(expression), right));
            case '<':
                return booleanValue(this.engine.toNumber(this.createContext(expression), left) < this.engine.toNumber(this.createContext(expression), right));
            case 'instanceof':
                return booleanValue(this.engine.isInstanceOf(this.createContext(expression), left, right));
            case 'in':
                return booleanValue(this.isIn(this.createContext(expression), left, right));
        }

        throw new NotImplementedError(this.createContext(expression), 'unsupported operator ' + expression.operator);
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

        throw new NotImplementedError(this.createContext(expression), 'unsupported operator ' + expression.operator);
    }

    isIn(context: Context, left: Value, right: Value): boolean {
        if (left.type !== 'string') {
            throw new NotImplementedError(context, 'unsupported left operand of in operator ' + left.type);
        }

        if (right.type !== 'object') {
            throw new NotImplementedError(context, 'unsupported right operand of in operator ' + right.type);
        }

        return this.engine.getPropertyDescriptor(context, right, left.value) !== null;
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

    evaluateSequenceExpression(expression: SequenceExpression): Value {
        const values = expression.expressions.map(expression => this.evaluateExpression(expression));

        return values[values.length - 1];
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
                    throw new NotImplementedError(this.createContext(expression), 'unsupported property type ' + property.type);
            }
        }

        return result;
    }

    evaluatePropertyName(property: ObjectProperty | ObjectMethod | MemberExpression): string {
        const key: Expression = property.type === 'MemberExpression' ? property.property : property.key;
            
        if (!property.computed) {
            if (key.type !== 'Identifier') {
                throw new NotImplementedError(this.createContext(key), 'getters/setters are unsupported ' + key.type);
            }

            return key.name;
        }
        
        return this.engine.toString(this.createContext(property), this.evaluateExpression(key));
    }

    evaluateArrayExpression(expression: ArrayExpression): Value {
        const elements = expression.elements.map(value => value === null ? undefinedValue : this.evaluateExpression(value));
        
        return this.engine.constructArray(this.createContext(expression), elements);
    }

    evaluateFunctionExpression(expression: FunctionExpression): Value {
        return this.functionValue(expression, expression.id && expression.id.name);
    }

    evaluateArrowFunctionExpression(expression: ArrowFunctionExpression): Value {
        return this.functionValue(expression);
    }

    evaluateMemberExpression(expression: MemberExpression): Value {
        const object = this.evaluateExpression(expression.object);
        const propertyName = this.evaluatePropertyName(expression);

        if (object.type === 'null' || object.type === 'undefined') {
            throw this.engine.newTypeError(this.createContext(expression), `Cannot read property '${propertyName}' of ${object.type}`);
        }
        
        const convertedObject = this.engine.toObject(this.createContext(expression), object);
        
        return this.engine.readProperty(this.createContext(expression), convertedObject, propertyName);
    }

    evaluateAssignmentExpression(expression: AssignmentExpression): Value {
        const value = this.getNewValue(expression);
        this.assignValue(value, expression.left);
        return value;
    }

    getNewValue(expression: AssignmentExpression): Value {
        const right = this.evaluateExpression(expression.right);
        
        if (expression.operator === '=') {
            return right;
        }

        if (expression.left.type !== 'Identifier' && expression.left.type !== 'MemberExpression') {
            throw new NotImplementedError(this.createContext(expression), 'left part of assignment operator is invalid');
        }

        const left = this.evaluateExpression(expression.left);

        switch(expression.operator) {
            case '+=':
                if (left.type === 'string' || right.type === 'string') {
                    return stringValue(this.engine.toString(this.createContext(expression), left) + this.engine.toString(this.createContext(expression), right));
                } else {
                    return numberValue(this.engine.toNumber(this.createContext(expression), left) + this.engine.toNumber(this.createContext(expression), right));
                }
            case '-=':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) - this.engine.toNumber(this.createContext(expression), right));
            case '*=':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) * this.engine.toNumber(this.createContext(expression), right));
            case '**=':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) ** this.engine.toNumber(this.createContext(expression), right));
            case '/=':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) / this.engine.toNumber(this.createContext(expression), right));
            case '%=':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) % this.engine.toNumber(this.createContext(expression), right));
            case '&=':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) & this.engine.toNumber(this.createContext(expression), right));
            case '|=':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) | this.engine.toNumber(this.createContext(expression), right));
            case '^=':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) ^ this.engine.toNumber(this.createContext(expression), right));
            case '<<=':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) << this.engine.toNumber(this.createContext(expression), right));
            case '>>=':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) >> this.engine.toNumber(this.createContext(expression), right));
            case '>>>=':
                return numberValue(this.engine.toNumber(this.createContext(expression), left) >>> this.engine.toNumber(this.createContext(expression), right));
        }
        
        throw new NotImplementedError(this.createContext(expression), 'unsupported operator ' + expression.operator);
    }

    evaluateUpdateExpression(expression: UpdateExpression): Value {
        const value = this.engine.toNumber(this.createContext(expression), this.evaluateExpression(expression.argument));
        const newValue = numberValue((expression.operator === '++' ? 1 : (-1)) + value);
        this.assignValue(newValue, expression.argument as any);
        return expression.prefix ? newValue : numberValue(value);
    }

    evaluateIdentifier(expression: Identifier): Value {
        const context = this.createContext(expression);
        
        const result = this.getIdentifier(context, expression.name);

        if (result === null) {
            return undefinedValue;
        }

        const [containingScope, identifier] = result;

        return this.engine.readPropertyDescriptorValue(context, containingScope.variables, identifier);
    }

    getIdentifier(context: Context, identifierName: string): [Scope, ObjectPropertyDescriptor] | null {
        if (this.parent !== null) {
            const variable = this.engine.getOwnPropertyDescriptor(context, this.variables, identifierName);
            
            if (variable !== null) {
                return [this, variable];
            }

            return this.parent.getIdentifier(context, identifierName);
        }
        
        const variable = this.engine.getPropertyDescriptor(context, this.variables, identifierName);
            
        if (variable !== null) {
            return [this, variable];
        }

        return null;
    }

    evaluateRegExpLiteral(expression: RegExpLiteral): Value {
        return this.engine.constructObject(this.createContext(expression), this.engine.RegExp.constructor, [
            stringValue(expression.pattern),
            stringValue(expression.flags)
        ]);
    }

    assignIdentifier(value: Value, to: Identifier): void {
        if (this.variables.ownProperties.has(to.name)) {
            this.engine.assignProperty(this.createContext(to), this.variables, to.name, value);
        } else {
            if (this.parent === null) {
                throw new NotImplementedError(this.createContext(to), 'cannot assign variable as it is not defined ' + to.name);
            }

            this.parent.assignIdentifier(value, to);
        }
    }

    assignMember(value: Value, to: MemberExpression): void {
        const object = this.evaluateExpression(to.object);
        
        if (object.type !== 'object') {
            throw new NotImplementedError(this.createContext(to), 'member assignment is unsupported for ' + object.type);
        }

        const propertyName = this.evaluatePropertyName(to);
        this.engine.assignProperty(this.createContext(to), object, propertyName, value);
    }

    assignValue(value: Value, to: LVal): void {
        switch (to.type) {
            case 'Identifier':
                return this.assignIdentifier(value, to);
            case 'MemberExpression':
                return this.assignMember(value, to);
        }

        throw new NotImplementedError(this.createContext(to), 'unsupported left value type ' + to.type);
    }

    functionValue(statement: FunctionNode, name: string | null = null) {
        const isConstructor = (statement.type !== 'ArrowFunctionExpression') && !statement.generator;

        return this.engine.functionValue((callerContext, thisArg, argValues) => {
            if (statement.type === 'ArrowFunctionExpression' && statement.body.type !== 'BlockStatement') {
                return this.evaluateExpression(statement.body);
            }

            const thisValue = statement.type === 'ArrowFunctionExpression' ? this.thisValue : thisArg;
            const childScope = this.createChildScope(this.script, {
                caller: callerContext,
                callee: {
                    node: statement,
                    scope: this
                }
            }, thisValue, this.localVariables(statement, argValues));

            const body = statement.body as BlockStatement;

            childScope.hoistVars(body);

            const result = childScope.evaluateStatements(body);
            
            if (result === 'break') {
                throw new NotImplementedError(this.createContext(statement), 'return should not be break');
            }
            
            return result || undefinedValue;
        }, { name, isConstructor });
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
                    throw new NotImplementedError(this.createContext(parameter), 'parameter type ' + parameter.type + ' is not supported');
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
