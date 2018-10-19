import { Scope } from './scope';
import { ObjectValue } from './types';
import { objectValue, nullValue, undefinedValue } from './factories';
import { FunctionDeclaration, FunctionExpression, CallExpression } from '@babel/types';
import { NotImplementedError } from './notImplementedError';

export class Engine {
    readonly rootPrototype: ObjectValue = {
        type: 'object',
        ownFields: {},
        internalFields: {},
        prototype: nullValue
    };

    readonly functionPrototype = objectValue(this.rootPrototype);

    readonly globalScope: Scope = new Scope(this);
    
    functionValue(scope: Scope, functionNode: FunctionDeclaration | FunctionExpression): ObjectValue {
        return objectValue(this.functionPrototype, {}, {
            invoke(expression: CallExpression) {
                const newScope = scope.createChildScope();

                const argValues = expression.arguments
                    .map(arg => scope.evaluateExpression(arg));

                let index = 0;
                
                for(const parameter of functionNode.params) {
                    switch(parameter.type) {
                        case 'Identifier':
                            const argumentValue = index < argValues.length ?
                                argValues[index] :
                                undefinedValue;
                            newScope.assignIdentifier(argumentValue, parameter);
                        break;
                        default:
                            throw new NotImplementedError('parameter type ' + parameter.type + ' is not supported');
                    }

                    index++;
                }

                return newScope.evaluateStatements(functionNode.body.body);
            }
        });
    }
}