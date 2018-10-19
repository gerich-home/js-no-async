import { Scope } from './scope';
import { ObjectValue, Value } from './types';
import { objectValue, nullValue, undefinedValue } from './factories';
import { FunctionDeclaration, FunctionExpression, CallExpression } from '@babel/types';
import { NotImplementedError } from './notImplementedError';
import { toString } from './globals';

export class Engine {
    readonly rootPrototype: ObjectValue = {
        type: 'object',
        ownFields: {},
        internalFields: {},
        prototype: nullValue
    };

    readonly functionPrototype = objectValue(this.rootPrototype);

    readonly globalScope: Scope = new Scope(this);

    constructor() {
        this.globalScope.variables['log'] = this.functionValue(values => {
            console.log(...values.map(toString));
            return undefinedValue;
        });
    }

    functionValue(invoke: (argValues: Value[]) => Value): ObjectValue {
        return objectValue(this.functionPrototype, {}, {
            invoke
        });
    }
}