import { nullValue, objectValue, stringValue, undefinedValue } from './factories';
import { getObjectField } from './globals';
import { NotImplementedError } from './notImplementedError';
import { Scope } from './scope';
import { FunctionInternalFields, ObjectValue, Value, StringValue } from './types';
import { parseExpression } from '@babel/parser';
import { FunctionExpression } from '@babel/types';

export class Engine {
    readonly rootPrototype = objectValue(nullValue);
    readonly functionPrototype = objectValue(this.rootPrototype);
    
    readonly globalScope: Scope = new Scope(this);

    constructor() {
        this.globalScope.variables.Object = this.functionValue(this.objectConstructor.bind(this));
        this.globalScope.variables.Object.ownFields.prototype = this.rootPrototype;
        this.globalScope.variables.Function = this.functionValue(this.functionConstructor.bind(this));
        
        this.rootPrototype.ownFields.toString = this.functionValue(() => stringValue('[object Object]')) as any;
        this.rootPrototype.ownFields.valueOf = this.functionValue(thisArg => thisArg) as any;
        this.rootPrototype.ownFields.constructor = this.globalScope.variables.Object as any;

        this.globalScope.variables.log = this.functionValue((thisArg, values) => {
            console.log(...values.map(value => this.toString(value)));
            return undefinedValue;
        });
    }

    objectConstructor(): Value {
        return objectValue(this.rootPrototype);
    }

    functionConstructor(thisArg: Value, values: Value[]): Value {
        if (!values.every(x => x.type === 'string')) {
            throw new NotImplementedError();
        }

        if (values.length > 0) {                
            const argNames = values.slice(0, -1) as StringValue[];
            const code = values.slice(-1)[0] as StringValue;

            const functionExpression = parseExpression(`function(${ argNames.map(a => a.value).join(',') }) { ${code.value} }`);
            
            return this.globalScope.functionValue(functionExpression as FunctionExpression);
        } else {
            return this.functionValue(() => undefinedValue);
        }
    }

    functionValue(invoke: FunctionInternalFields['invoke']): ObjectValue {
        const internalFields: FunctionInternalFields = {
            invoke
        };

        const prototype = objectValue(this.rootPrototype);
        const result = objectValue(this.functionPrototype, {
            prototype
        }, internalFields);

        (prototype.ownFields.constructor as any) = result;
        return result;
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