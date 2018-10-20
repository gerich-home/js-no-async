import { Expression, Statement, LVal, PatternLike, Identifier, FunctionDeclaration, FunctionExpression, VariableDeclaration, ExpressionStatement, ReturnStatement, NumericLiteral, BooleanLiteral, StringLiteral, ObjectExpression, CallExpression, BinaryExpression, MemberExpression, AssignmentExpression, SpreadElement, JSXNamespacedName, Block, traverse } from '@babel/types';
import { Variables, Value, NumberValue, StringValue, BooleanValue, ObjectValue, ObjectFields } from './types';
import { objectValue, stringValue, numberValue, booleanValue, undefinedValue, nullValue } from './factories';
import { Engine } from './engine';
import { NotImplementedError } from './notImplementedError';
import { getObjectField } from './globals';

export class Scope {
    readonly variables: Variables = {};
    
    constructor(
        readonly engine: Engine,
        private readonly parent: Scope | null = null
    ) {}
    
    createChildScope(): Scope {
        return new Scope(this.engine, this);
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
                
                if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
                    state.functionDepth++;
                }
            },
            exit(node, ancestors, state) {
                if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
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
            case 'BinaryExpression':
                return this.evaluateBinaryExpression(expression);
            case 'MemberExpression':
                return this.evaluateMemberExpression(expression);
            case 'AssignmentExpression':
                return this.evaluateAssignmentExpression(expression);
            case 'Identifier':
                return this.evaluateIdentifier(expression);
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

    getThisArg(callee: Expression): Value {
        switch (callee.type) {
            case 'MemberExpression':
                return this.evaluateExpression(callee.object);
            default:
                return undefinedValue;
        }
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
            case '/':
                return numberValue(this.engine.toNumber(left) / this.engine.toNumber(right));
        }

        throw new NotImplementedError('unsupported operator ' + expression.operator);
    }

    evaluateObjectExpression(expression: ObjectExpression): ObjectValue {
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

    functionValue(statement: FunctionExpression | FunctionDeclaration) {
        return this.engine.functionValue((thisArg, argValues) => {
            let index = 0;
            
            const childScope = this.createChildScope();
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
