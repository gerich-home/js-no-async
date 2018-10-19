import { Scope } from './scope';
import { ObjectValue, Value, FunctionInternalFields } from './types';
import { objectValue, nullValue, undefinedValue, stringValue } from './factories';
import { NotImplementedError } from './notImplementedError';
import { getObjectField } from './globals';

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
        this.rootPrototype.ownFields.toString = this.functionValue(() => {
            return stringValue('[object Object]');
        }) as any;

        this.rootPrototype.ownFields.valueOf = this.functionValue(thisArg => thisArg) as any;

        this.globalScope.variables.log = this.functionValue((thisArg, values) => {
            console.log(...values.map(value => this.toString(value)));
            return undefinedValue;
        });
    }

    functionValue(invoke: FunctionInternalFields['invoke']): ObjectValue {
        const internalFields: FunctionInternalFields = {
            invoke
        };

        return objectValue(this.functionPrototype, {}, internalFields);
    }
    
    toString(value: Value): string {
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
                return this.toString(this.executeMethod(value, 'toString', []));
            case 'undefined':
                return 'undefined';
        }
    }
    
    toNumber(value: Value): number {
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
                return this.toNumber(this.executeMethod(value, 'valueOf', []));
            case 'undefined':
                return NaN;
        }
    }
    
    executeFunction(callee: Value, thisArg: Value, args: Value[]): Value {
        if (callee.type !== 'object') {
            throw new NotImplementedError('call is unsupported for ' + callee.type);
        }
    
        if (callee.prototype !== this.functionPrototype) {
            throw new NotImplementedError('cannot call non-function');
        }
    
        return (callee.internalFields as FunctionInternalFields).invoke(thisArg, args);
    }

    executeMethod(value: ObjectValue, methodName: string, args: Value[]): Value {
        return this.executeFunction(getObjectField(value, methodName), value, args);
    }
}