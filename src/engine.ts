import { parseExpression } from '@babel/parser';
import { FunctionExpression } from '@babel/types';
import { booleanValue, nullValue, numberValue, objectValue, ParsedScript, stringValue, undefinedValue } from './factories';
import { NotImplementedError } from './notImplementedError';
import { RuntimeError } from './runtimeError';
import { Scope } from './scope';
import { AccessorObjectPropertyDescriptor, Context, FunctionInternalFields, GeneralFunctionInvoke, MandatoryObjectPropertyDescriptorFields, ObjectMethodInvoke, ObjectPropertyDescriptor, ObjectValue, StringValue, UndefinedValue, Value, ValueObjectPropertyDescriptor } from './types';

export class Engine {
    readonly rootPrototype = objectValue(nullValue);
    readonly functionPrototype = this.newObject();
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
        Reflect: this.newObject(),
        log: this.functionValue((thisArg, values, context) => {
            console.log(...values.map(value => this.toString(value, context)));
            return undefinedValue;
        })
    };

    readonly globalVars = this.newObject();
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

        this.defineProperty(this.object, 'getOwnPropertyDescriptor', this.functionValue((thisArg, args, context) => {
            const object = args[0];
            
            if (object.type !== 'object') {
                throw this.newTypeError('getOwnPropertyDescriptor should be called for object value', context);
            }

            const descriptor = object.ownProperties.get(this.toString(args[1], context));

            if (descriptor === undefined) {
                return undefinedValue;
            }

            const resultDescriptor = this.newObject();

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

        this.defineProperty(this.object, 'defineProperty', this.functionValue((thisArg, args, context) => {
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

        this.defineProperty(this.object, 'getPrototypeOf', this.functionValue((thisArg, args, context) => {
            const object = args[0];
            
            if (object.type !== 'object') {
                throw this.newTypeError('getOwnPropertyDescriptor should be called for object value', context);
            }

            return object.prototype;
        }));
        
        this.defineProperty(this.globals.Reflect, 'construct', this.functionValue((thisArg, args, context) => {
            const constructorArgs = this.toArray(args[1] as ObjectValue, context);
            
            return this.constructObject(args[0], constructorArgs, context, args.length < 3 ? args[0] : args[2]);
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
        this.defineProperty(this.globals.String.prototype as ObjectValue, 'length', {
            descriptorType: 'accessor',
            getter: this.objectMethod((thisArg, args, context) => {
                if (thisArg.internalFields.hasOwnProperty('wrappedValue')) {
                    const wrappedValue = thisArg.internalFields['wrappedValue'];
                    if (wrappedValue instanceof String) {
                        return numberValue(wrappedValue.length);
                    }
                }

                throw this.newTypeError('String.length failed', context);
            })
        });
        
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

    toArray(arrayValue: ObjectValue, context: Context): Value[] {
        const lengthProperty = this.readProperty(arrayValue, 'length', context);
        const length = this.toNumber(lengthProperty, context);

        const result: Value[] = [];

        for(let i = 0; i < length; i++) {
            result.push(this.readProperty(arrayValue, i.toString(), context));
        }

        return result;
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

    objectConstructor(thisArg: Value, args: Value[], context: Context, newTarget: Value): ObjectValue {
        if (args.length === 0) {
            return objectValue(this.rootPrototype);
        }

        const arg = args[0];
        switch(arg.type) {
            case 'null':
            case 'undefined':
                return objectValue(this.rootPrototype);
            case 'number':
                return this.constructObject(this.globals.Number, args, context);
            case 'boolean':
                return this.constructObject(this.globals.Boolean, args, context);
            case 'string':
                return this.constructObject(this.globals.String, args, context);
            case 'object':
                return arg;
        }
    }

    arrayConstructor(thisArg: ObjectValue, args: Value[]): UndefinedValue {
        this.defineProperty(thisArg, 'length', numberValue(args.length));

        args.forEach((value, index) => this.defineProperty(thisArg, index.toString(), value));

        return undefinedValue;
    }

    stringConstructor(thisArg: ObjectValue, args: Value[], context: Context, newTarget: Value): Value {
        const value = stringValue(args.length === 0 ? '' : this.toString(args[0], context));

        if (newTarget === undefinedValue) {
            return value;
        } else {
            thisArg.internalFields['wrappedValue'] = value;
            return undefinedValue;
        }
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

    numberConstructor(thisArg: ObjectValue, args: Value[], context: Context, newTarget: Value): Value {
        const value = numberValue(args.length === 0 ? 0 : this.toNumber(args[0], context));

        if (newTarget === undefinedValue) {
            return value;
        } else {
            thisArg.internalFields['wrappedValue'] = value;
            return undefinedValue;
        }
    }

    booleanConstructor(thisArg: ObjectValue, args: Value[], context: Context, newTarget: Value): Value {
        const value = booleanValue(args.length === 0 ? false : this.toBoolean(args[0]));

        if (newTarget) {
            return value;
        } else {
            thisArg.internalFields['wrappedValue'] = value;
            return undefinedValue;
        }
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

    objectMethod(invoke: ObjectMethodInvoke, name: string | null = null, prototype: ObjectValue = this.newObject()): ObjectValue {
        return this.functionValue((thisArg, argValues, context, newTarget) => {
            if (thisArg.type !== 'object') {
                throw new NotImplementedError('calling object method with incorrect thisArg ' + thisArg.type, context);
            }

            return invoke(thisArg, argValues, context, newTarget);
        }, name, prototype);
    }

    functionValue(invoke: GeneralFunctionInvoke, name: string | null = null, prototype: ObjectValue = this.newObject()): ObjectValue {
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
    
    executeFunction(callee: Value, thisArg: Value, args: Value[], context: Context, newTarget: Value = undefinedValue): Value {
        if (callee.type !== 'object') {
            throw new NotImplementedError('call is unsupported for ' + callee.type, context);
        }
    
        if (callee.prototype !== this.functionPrototype) {
            throw new NotImplementedError('cannot call non-function', context);
        }
    
        return (callee.internalFields as FunctionInternalFields).invoke(thisArg, args, context, newTarget);
    }

    executeMethod(value: ObjectValue, methodName: string, args: Value[], context: Context): Value {
        const method = this.readProperty(value, methodName, context);

        return this.executeFunction(method, value, args, context);
    }

    newObject(): ObjectValue {
        return objectValue(this.rootPrototype);
    }

    constructObject(constructor: Value, args: Value[], context: Context, newTargetConstructor: Value = constructor): ObjectValue {
        if (constructor.type !== 'object') {
            throw new NotImplementedError('new is unsupported for ' + constructor.type, context);
        }
    
        if (constructor.prototype !== this.functionPrototype) {
            throw this.newTypeError('cannot use new for non-function', context);
        }

        if (newTargetConstructor.type !== 'object') {
            throw this.newTypeError('new is unsupported for target ' + newTargetConstructor.type, context);
        }
        
        const prototype = this.readProperty(newTargetConstructor, 'prototype', context);

        if (prototype.type !== 'object') {
            throw this.newTypeError('prototype cannot be ' + prototype.type, context);
        }

        const thisArg = objectValue(prototype);
        
        const result = this.executeFunction(constructor, thisArg, args, context, thisArg);
        
        if (result.type !== 'object' && result.type !== 'undefined') {
            throw new NotImplementedError('constructor result should be object or undefined ' + constructor.type, context);
        }

        return result.type === 'undefined' ? thisArg : result;
    }
}