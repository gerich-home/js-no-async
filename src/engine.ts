import { parseExpression } from '@babel/parser';
import { FunctionExpression } from '@babel/types';
import { booleanValue, nullValue, numberValue, objectValue, ParsedScript, stringValue, undefinedValue } from './factories';
import { NotImplementedError } from './notImplementedError';
import { RuntimeError } from './runtimeError';
import { Scope } from './scope';
import { Context, FunctionInternalFields, GeneralFunctionInvoke, ObjectMethodInvoke, ObjectProperties, ObjectValue, StringValue, UndefinedValue, Value, ObjectPropertyDescriptor, MandatoryObjectPropertyDescriptorFields, ValueObjectPropertyDescriptor, AccessorObjectPropertyDescriptor } from './types';

export class Engine {
    readonly rootPrototype = objectValue(nullValue);
    readonly functionPrototype = this.objectConstructor();
    readonly object = this.functionValue(this.objectConstructor.bind(this), 'Object', this.rootPrototype);

    readonly globals = {
        Object: this.object,
        Function: this.functionValue(this.functionConstructor.bind(this), 'Function', this.functionPrototype),
        Array: this.functionValue(this.arrayConstructor.bind(this), 'Array'),
        String: this.functionValue(this.stringConstructor.bind(this), 'String'),
        Date: this.functionValue(this.dateConstructor.bind(this), 'Date'),
        Promise: this.functionValue(this.promiseConstructor.bind(this), 'Promise'),
        Error: this.functionValue(this.errorConstructor.bind(this), 'Error'),
        TypeError: this.functionValue(this.errorConstructor.bind(this), 'TypeError'),
        EvalError: this.functionValue(this.errorConstructor.bind(this), 'EvalError'),
        RangeError: this.functionValue(this.errorConstructor.bind(this), 'RangeError'),
        ReferenceError: this.functionValue(this.errorConstructor.bind(this), 'ReferenceError'),
        SyntaxError: this.functionValue(this.errorConstructor.bind(this), 'SyntaxError'),
        URIError: this.functionValue(this.errorConstructor.bind(this), 'URIError'),
        Number: this.functionValue(this.numberConstructor.bind(this), 'Number'),
        Boolean: this.functionValue(this.booleanConstructor.bind(this), 'Boolean'),
        Symbol: this.functionValue(this.symbolConstructor.bind(this), 'Symbol'),
        Reflect: this.newObject(null),
        log: this.functionValue((thisArg, values, context) => {
            console.log(...values.map(value => this.toString(value, context)));
            return undefinedValue;
        })
    };

    readonly globalVars = this.newObject(null);
    readonly globalScope = new Scope(this, null, null, null, this.globalVars, this.globalVars);

    constructor() {
        this.defineProperty(this.rootPrototype, 'toString', this.functionValue(() => stringValue('[object Object]')));
        this.defineProperty(this.rootPrototype, 'valueOf', this.functionValue(thisArg => thisArg));
        this.defineProperty(this.rootPrototype, 'constructor', this.globals.Object);
        this.defineProperty(this.rootPrototype, 'hasOwnProperty', this.objectMethod((thisArg, args, context) => booleanValue(thisArg.ownProperties.has(this.toString(args[0], context)))));
        
        this.defineProperty(this.rootPrototype, 'propertyIsEnumerable', this.objectMethod((thisArg, args, context) => {
            const name = this.toString(args[0], context);

            const property = thisArg.ownProperties.get(name);

            return booleanValue(property !== undefined && property.enumerable);
        }));

        this.defineProperty(this.functionPrototype, 'call', this.objectMethod((thisArg, args, context) => this.executeFunction(thisArg, args[0] as ObjectValue, args.slice(1), context)));

        this.defineProperty(this.globals.Object, 'getOwnPropertyDescriptor', this.functionValue((thisArg, args, context) => {
            const object = args[0];
            
            if (object.type !== 'object') {
                throw this.newTypeError('getOwnPropertyDescriptor should be called for object value', context);
            }

            const descriptor = object.ownProperties.get(this.toString(args[1], context));

            if (descriptor === undefined) {
                return undefinedValue;
            }

            const resultDescriptor = this.newObject(context);

            this.defineProperty(resultDescriptor, 'configurable', booleanValue(descriptor.configurable));
            this.defineProperty(resultDescriptor, 'enumerable', booleanValue(descriptor.enumerable));
            
            if (descriptor.descriptorType === 'value') {
                this.defineProperty(resultDescriptor, 'value', descriptor.value);
                this.defineProperty(resultDescriptor, 'writable', booleanValue(descriptor.writable));
            } else {
                this.defineProperty(resultDescriptor, 'get', descriptor.getter);
                this.defineProperty(resultDescriptor, 'set', descriptor.setter);
            }

            return resultDescriptor;
        }));

        this.defineProperty(this.globals.Object, 'defineProperty', this.functionValue((thisArg, args, context) => {
            const object = args[0];
            if (object.type !== 'object') {
                throw this.newTypeError('defineProperty should be called for object value', context);
            }

            const descriptor = args[2];
            if (descriptor.type !== 'object') {
                throw new NotImplementedError('defineProperty descriptor arg should be object value', context);
            }

            const propertyName = this.toString(args[1], context);
            const existingDescriptor = object.ownProperties.get(propertyName);

            if (existingDescriptor !== undefined && existingDescriptor.configurable === false) {
                throw this.newTypeError('cannot change non configurable property', context);
            }

            const value = this.readProperty(descriptor, 'value', context);
            const writable = this.readProperty(descriptor, 'writable', context);
            const enumerable = this.readProperty(descriptor, 'enumerable', context);
            const configurable = this.readProperty(descriptor, 'configurable', context);
            const getter = this.readProperty(descriptor, 'get', context);
            const setter = this.readProperty(descriptor, 'set', context);

            const isAccessor = getter !== undefinedValue || setter !== undefinedValue;
            const isValue = value !== undefinedValue || writable !== undefinedValue;

            if (isAccessor && isValue) {
                throw this.newTypeError('property descriptor should be either a value of an accessor', context);
            }

            const mandatoryDefaults: MandatoryObjectPropertyDescriptorFields = (existingDescriptor === undefined) ? {
                configurable: false,
                enumerable: false
            } : existingDescriptor;

            const mandatoryFields: MandatoryObjectPropertyDescriptorFields = {
                configurable: configurable === undefinedValue ? mandatoryDefaults.configurable : this.toBoolean(configurable),
                enumerable: enumerable === undefinedValue ? mandatoryDefaults.configurable : this.toBoolean(enumerable)
            };

            if (isAccessor) {
                if (getter.type !== 'undefined' && getter.type !== 'object') {
                    throw this.newTypeError('getter should be a function ' + getter.type, context);
                }

                if (setter.type !== 'undefined' && setter.type !== 'object') {
                    throw this.newTypeError('setter should be a function ' + setter.type, context);
                }

                const defaults = (existingDescriptor === undefined || existingDescriptor.descriptorType !== 'accessor') ? {
                    getter: undefinedValue,
                    setter: undefinedValue
                } : existingDescriptor;
    
                this.defineProperty(object, propertyName, {
                    descriptorType: 'accessor',
                    ...mandatoryFields,
                    getter: getter === undefinedValue ? defaults.getter : getter,
                    setter: setter === undefinedValue ? defaults.setter : setter
                });  
            } else {
                const defaults = (existingDescriptor === undefined || existingDescriptor.descriptorType !== 'value') ? {
                    value: undefinedValue,
                    writable: false
                } : existingDescriptor;

                this.defineProperty(object, propertyName, {
                    descriptorType: 'value',
                    ...mandatoryFields,
                    value: value === undefinedValue ? defaults.value : value,
                    writable: writable === undefinedValue ? defaults.writable : this.toBoolean(writable)
                });
            }

            return object;
        }));

        const arrayPrototype = this.readProperty(this.globals.Array, 'prototype', null) as ObjectValue;

        this.defineProperty(arrayPrototype, 'push', this.objectMethod((thisArg, values, context) => {
            const lengthValue = this.readProperty(thisArg, 'length', context);

            const length = this.toNumber(lengthValue, context);
            const newLength = numberValue(length + values.length);
            
            this.defineProperty(thisArg, 'length', newLength);

            values.forEach((value, index) => this.defineProperty(thisArg, (length + index).toString(), value));

            return newLength;
        }));

        this.defineProperty(arrayPrototype, 'join', this.objectMethod((thisArg, values, context) => {
            const length = this.toNumber(this.readProperty(thisArg, 'length', context), context);

            const separator = values.length === 0 ? ',' : this.toString(values[0], context);

            const arr = new Array(length);
            for (let i = 0; i < length; i++) {
                arr[i] = this.toString(this.readProperty(thisArg, i.toString(), context), context);
            }

            return stringValue(arr.join(separator));
        }));

        this.defineProperty(this.globals.TypeError.prototype as ObjectValue, 'toString', this.objectMethod((thisArg, args, context) => this.readProperty(thisArg, 'message', context)));
        
        Object.keys(this.globals)
            .forEach((name) => {
                this.defineProperty(this.globalScope.variables, name, (this.globals as any)[name]);
            });
    }

    defineProperty(object: ObjectValue, propertyName: string, value: Value): void;
    defineProperty(object: ObjectValue, propertyName: string, descriptor: Partial<ObjectPropertyDescriptor>): void;
    defineProperty(object: ObjectValue, propertyName: string, valueOrDescriptor: Value | Partial<ObjectPropertyDescriptor>): void {
        const descriptor: Partial<ObjectPropertyDescriptor> = ('type' in valueOrDescriptor) ? {
            descriptorType: 'value',
            value: valueOrDescriptor
        } : valueOrDescriptor;

        const descriptorType = descriptor.descriptorType || 'value';
        
        if (descriptorType === 'value') {
            object.ownProperties.set(propertyName, {
                descriptorType,
                configurable: true,
                enumerable: true,
                value: undefinedValue,
                writable: true,
                ...(descriptor as Partial<MandatoryObjectPropertyDescriptorFields & ValueObjectPropertyDescriptor>)
            });
        } else {
            object.ownProperties.set(propertyName, {
                descriptorType,
                configurable: true,
                enumerable: true,
                getter: undefinedValue,
                setter: undefinedValue,
                ...(descriptor as Partial<MandatoryObjectPropertyDescriptorFields & AccessorObjectPropertyDescriptor>)
            });
        }
    }

    assignProperty(object: ObjectValue, propertyName: string, value: Value, context: Context): void {
        const property = object.ownProperties.get(propertyName);

        if (property === undefined) {
            this.defineProperty(object, propertyName, value);
        } else {
            switch (property.descriptorType) {
                case 'value':
                    if (property.writable) {
                        property.value = value;
                    }

                    break;
                case 'accessor':
                    if (property.setter.type !== 'undefined') {
                        this.executeFunction(property.setter, object, [value], context);
                    }
            }
        }
    }

    getPropertyDescriptor(object: ObjectValue, propertyName: string): ObjectPropertyDescriptor | null {
        const property = object.ownProperties.get(propertyName);
        
        if (property !== undefined) {
            return property;
        }

        if (object.prototype.type === 'null') {
            return null;
        }

        return this.getPropertyDescriptor(object.prototype, propertyName);
    }

    readProperty(object: ObjectValue, propertyName: string, context: Context): Value {
        const property = this.getPropertyDescriptor(object, propertyName);
        
        if (property === null) {
            return undefinedValue;
        }

        return this.readPropertyDescriptorValue(object, property, context);
    }
    
    readPropertyDescriptorValue(object: ObjectValue, property: ObjectPropertyDescriptor, context: Context): Value {
        switch (property.descriptorType) {
            case 'value':
                return property.value;
            case 'accessor':
                if (property.getter.type === 'undefined') {
                    return undefinedValue;
                }

                return this.executeFunction(property.getter, object, [], context);
        }
    }

    newTypeError(message: string, context: Context): RuntimeError {
        return new RuntimeError(this.constructObject(this.globals.TypeError, [
            stringValue(message)
        ], context), context);
    }

    runGlobalCode(script: ParsedScript): void {
        this.globalScope.evaluateScript(script);
    }

    objectConstructor(): ObjectValue {
        return objectValue(this.rootPrototype);
    }

    arrayConstructor(thisArg: ObjectValue, args: Value[]): UndefinedValue {
        this.defineProperty(thisArg, 'length', numberValue(args.length));

        args.forEach((value, index) => this.defineProperty(thisArg, index.toString(), value));

        return undefinedValue;
    }

    stringConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return stringValue(args.length === 0 ? '' : this.toString(args[0], context));
    }

    dateConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return undefinedValue;
    }

    promiseConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return undefinedValue;
    }

    errorConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        this.defineProperty(thisArg, 'message', args.length === 0 ? undefinedValue: args[0]);
        return undefinedValue;
    }

    numberConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return numberValue(args.length === 0 ? 0 : this.toNumber(args[0], context));
    }

    booleanConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return booleanValue(args.length === 0 ? false : this.toBoolean(args[0]));
    }

    symbolConstructor(): UndefinedValue {
        return undefinedValue;
    }

    functionConstructor(thisArg: ObjectValue, values: Value[], context: Context): Value {
        if (!values.every(x => x.type === 'string')) {
            throw new NotImplementedError('function constructor arguments must be strings', context);
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

    objectMethod(invoke: ObjectMethodInvoke, name: string | null = null, prototype: ObjectValue = this.objectConstructor()): ObjectValue {
        return this.functionValue((thisArg, argValues, context) => {
            if (thisArg.type !== 'object') {
                throw new NotImplementedError('calling object method with incorrect thisArg ' + thisArg.type, context);
            }

            return invoke(thisArg, argValues, context);
        }, name, prototype);
    }

    functionValue(invoke: GeneralFunctionInvoke, name: string | null = null, prototype: ObjectValue = this.objectConstructor()): ObjectValue {
        const internalFields: FunctionInternalFields = {
            invoke
        };

        const result = objectValue(this.functionPrototype, internalFields);
        
        this.defineProperty(result, 'prototype', prototype);
        this.defineProperty(result, 'name', name === null ? undefinedValue : stringValue(name));

        this.defineProperty(prototype, 'constructor', result);

        return result;
    }
    
    toString(value: Value, context: Context): string {
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
                return this.toString(this.executeMethod(value, 'toString', [], context), context);
            case 'undefined':
                return 'undefined';
        }
    }
    
    toBoolean(value: Value): boolean {
        switch(value.type) {
            case 'string':
                return Boolean(value.value);
            case 'boolean':
                return value.value;
            case 'number':
                return Boolean(value.value);
            case 'null':
                return false;
            case 'object':
                return true;
            case 'undefined':
                return false;
        }
    }

    toNumber(value: Value, context: Context): number {
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
                return this.toNumber(this.executeMethod(value, 'valueOf', [], context), context);
            case 'undefined':
                return NaN;
        }
    }
    
    executeFunction(callee: Value, thisArg: Value, args: Value[], context: Context): Value {
        if (callee.type !== 'object') {
            throw new NotImplementedError('call is unsupported for ' + callee.type, context);
        }
    
        if (callee.prototype !== this.functionPrototype) {
            throw new NotImplementedError('cannot call non-function', context);
        }
    
        return (callee.internalFields as FunctionInternalFields).invoke(thisArg, args, context);
    }

    executeMethod(value: ObjectValue, methodName: string, args: Value[], context: Context): Value {
        const method = this.readProperty(value, methodName, context);

        return this.executeFunction(method, value, args, context);
    }

    newObject(context: Context): ObjectValue {
        return this.constructObject(this.object, [], context);
    }

    constructObject(constructor: Value, args: Value[], context: Context): ObjectValue {
        if (constructor.type !== 'object') {
            throw new NotImplementedError('new is unsupported for ' + constructor.type, context);
        }
    
        if (constructor.prototype !== this.functionPrototype) {
            throw new NotImplementedError('cannot use new for non-function', context);
        }

        const prototype = this.readProperty(constructor, 'prototype', context);

        if (prototype.type !== 'object') {
            throw new NotImplementedError('prototype cannot be ' + prototype.type, context);
        }

        const thisArg = objectValue(prototype);
        
        const result = this.executeFunction(constructor, thisArg, args, context);
        
        if (result.type !== 'object' && result.type !== 'undefined') {
            throw new NotImplementedError('constructor result should be object or undefined ' + constructor.type, context);
        }

        return result.type === 'undefined' ? thisArg : result;
    }
}