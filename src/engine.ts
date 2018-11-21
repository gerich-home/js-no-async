import { parseExpression } from '@babel/parser';
import { FunctionExpression } from '@babel/types';
import { booleanValue, nullValue, numberValue, objectValue, ParsedScript, stringValue, undefinedValue } from './factories';
import { NotImplementedError } from './notImplementedError';
import { RuntimeError } from './runtimeError';
import { Scope } from './scope';
import { AccessorObjectPropertyDescriptor, Context, FunctionInternalFields, GeneralFunctionInvoke, HasGetPropertyDescriptor, MandatoryObjectPropertyDescriptorFields, ObjectMethodInvoke, ObjectPropertyDescriptor, ObjectValue, StringValue, UndefinedValue, Value, ValueObjectPropertyDescriptor } from './types';

type FunctionOptions = {
    name?: string | null;
    functionPrototype?: ObjectValue;
    prototype?: ObjectValue;
    isConstructor?: boolean;
};

export class Engine {
    readonly rootPrototype = objectValue(nullValue);
    readonly functionPrototype = objectValue(this.rootPrototype);
    readonly errorPrototype = objectValue(this.rootPrototype);
    readonly typedArrayPrototype = this.functionValue((thisArg, vals, context) => {throw new NotImplementedError("Do not call TypedArray", context)});
    
    readonly Object = this.functionValue(this.objectConstructor.bind(this), { name: 'Object', prototype: this.rootPrototype});
    readonly Function = this.functionValue(this.functionConstructor.bind(this), { name: 'Function', prototype: this.functionPrototype });
    readonly Array = this.functionValue(this.arrayConstructor.bind(this), { name: 'Array' });
    readonly String = this.functionValue(this.stringConstructor.bind(this), { name: 'String' });
    readonly Date = this.functionValue(this.dateConstructor.bind(this), { name: 'Date' });
    readonly Promise = this.functionValue(this.promiseConstructor.bind(this), { name: 'Promise' });
    readonly Error = this.functionValue(this.errorConstructor.bind(this), { name: 'Error', prototype: this.errorPrototype });
    readonly TypeError = this.functionValue(this.errorConstructor.bind(this), { name: 'TypeError', prototype: objectValue(this.errorPrototype) });
    readonly EvalError = this.functionValue(this.errorConstructor.bind(this), { name: 'EvalError', prototype: objectValue(this.errorPrototype) });
    readonly RangeError = this.functionValue(this.errorConstructor.bind(this), { name: 'RangeError', prototype: objectValue(this.errorPrototype) });
    readonly ReferenceError = this.functionValue(this.errorConstructor.bind(this), { name: 'ReferenceError', prototype: objectValue(this.errorPrototype) });
    readonly SyntaxError = this.functionValue(this.errorConstructor.bind(this), { name: 'SyntaxError', prototype: objectValue(this.errorPrototype) });
    readonly URIError = this.functionValue(this.errorConstructor.bind(this), { name: 'URIError', prototype: objectValue(this.errorPrototype) });
    readonly ArrayBuffer = this.functionValue(this.arrayBufferConstructor.bind(this), { name: 'ArrayBuffer' });
    readonly Float64Array = this.functionValue(this.float64ArrayConstructor.bind(this), { name: 'Float64Array', functionPrototype: this.typedArrayPrototype });
    readonly Float32Array = this.functionValue(this.float32ArrayConstructor.bind(this), { name: 'Float32Array', functionPrototype: this.typedArrayPrototype });
    readonly Int32Array = this.functionValue(this.int32ArrayConstructor.bind(this), { name: 'Int32Array', functionPrototype: this.typedArrayPrototype });
    readonly Int16Array = this.functionValue(this.int16ArrayConstructor.bind(this), { name: 'Int16Array', functionPrototype: this.typedArrayPrototype });
    readonly Int8Array = this.functionValue(this.int8ArrayConstructor.bind(this), { name: 'Int8Array', functionPrototype: this.typedArrayPrototype });
    readonly Uint32Array = this.functionValue(this.uint32ArrayConstructor.bind(this), { name: 'Uint32Array', functionPrototype: this.typedArrayPrototype });
    readonly Uint16Array = this.functionValue(this.uint16ArrayConstructor.bind(this), { name: 'Uint16Array', functionPrototype: this.typedArrayPrototype });
    readonly Uint8Array = this.functionValue(this.uint8ArrayConstructor.bind(this), { name: 'Uint8Array', functionPrototype: this.typedArrayPrototype });
    readonly Uint8ClampedArray = this.functionValue(this.uint8ClampedArrayConstructor.bind(this), { name: 'Uint8ClampedArray', functionPrototype: this.typedArrayPrototype });
    readonly Number = this.functionValue(this.numberConstructor.bind(this), { name: 'Number' });
    readonly Boolean = this.functionValue(this.booleanConstructor.bind(this), { name: 'Boolean' });
    readonly Symbol = this.functionValue(this.symbolConstructor.bind(this), { name: 'Symbol' });
    readonly Reflect = this.newObject();
    readonly Math = this.newObject();
    readonly log = this.functionValue((thisArg, values, context) => {
        console.log(...values.map(value => this.toString(value, context)));
        return undefinedValue;
    });

    readonly globalVars = this.newObject();
    readonly globalScope = new Scope(this, null, null, null, this.globalVars, this.globalVars);

    constructor() {
        this.defineProperty(this.rootPrototype, 'toString', this.functionValue(() => stringValue('[object Object]')));
        this.defineProperty(this.rootPrototype, 'valueOf', this.functionValue(thisArg => thisArg));
        this.defineProperty(this.rootPrototype, 'constructor', this.Object);
        this.defineProperty(this.rootPrototype, 'hasOwnProperty', this.objectMethod((thisArg, args, context) => booleanValue(thisArg.ownProperties.has(this.toString(args[0], context)))));
        
        this.defineProperty(this.rootPrototype, 'propertyIsEnumerable', this.objectMethod((thisArg, args, context) => {
            const name = this.toString(args[0], context);

            const property = thisArg.ownProperties.get(name);

            return booleanValue(property !== undefined && property.enumerable);
        }));

        this.defineProperty(this.functionPrototype, 'call', this.objectMethod((thisArg, args, context) => this.executeFunction(thisArg, args[0] as ObjectValue, args.slice(1), context)));

        this.defineProperty(this.Object, 'getOwnPropertyDescriptor', this.functionValue((thisArg, args, context) => {
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

        this.defineProperty(this.Object, 'defineProperty', this.functionValue((thisArg, args, context) => {
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

        this.defineProperty(this.Object, 'getPrototypeOf', this.functionValue((thisArg, args, context) => {
            const object = args[0];
            
            if (object.type !== 'object') {
                throw this.newTypeError('getOwnPropertyDescriptor should be called for object value', context);
            }

            return object.prototype;
        }));
        
        this.defineProperty(this.Reflect, 'construct', this.functionValue((thisArg, args, context) => {
            const constructorArgs = this.toArray(args[1] as ObjectValue, context);
            
            return this.constructObject(args[0], constructorArgs, context, args.length < 3 ? args[0] : args[2]);
        }));
        
        this.defineProperty(this.Math, 'pow', this.functionValue((thisArg, args, context) => {
            const a = this.toNumber(args[0], context);
            const b = this.toNumber(args[1], context);
            
            return numberValue(Math.pow(a, b));
        }));
        
        this.defineProperty(this.Number, 'isNaN', this.functionValue((thisArg, args, context) => {
            const a = this.toNumber(args[0], context);
            
            return booleanValue(Number.isNaN(a));
        }));
        
        const datePrototype = this.readProperty(this.Date, 'prototype', null) as ObjectValue;
        
        this.defineProperty(datePrototype, 'getTimezoneOffset', this.objectMethod((thisArg, args, context) => {
            return numberValue(thisArg.internalFields['date'].getTimezoneOffset());
        }));
        
        this.defineProperty(datePrototype, 'valueOf', this.objectMethod((thisArg, args, context) => {
            return numberValue(thisArg.internalFields['date'].valueOf());
        }));
        
        const arrayPrototype = this.readProperty(this.Array, 'prototype', null) as ObjectValue;

        this.defineProperty(arrayPrototype, 'push', this.objectMethod((thisArg, values, context) => {
            const lengthValue = this.readProperty(thisArg, 'length', context);

            const length = this.toNumber(lengthValue, context);
            const newLength = numberValue(length + values.length);
            
            this.defineProperty(thisArg, 'length', newLength);

            values.forEach((value, index) => this.defineProperty(thisArg, (length + index).toString(), value));

            return newLength;
        }));

        this.defineProperty(arrayPrototype, 'join', this.objectMethod((thisArg, values, context) => {
            const array = this.toArray(thisArg, context);

            const separator = values.length === 0 ? ',' : this.toString(values[0], context);

            return stringValue(array.map(item => this.toString(item, context)).join(separator));
        }));

        this.defineProperty(arrayPrototype, 'slice', this.objectMethod((thisArg, values, context) => {
            const array = this.toArray(thisArg, context);

            const start = values.length >= 1 ? this.toNumber(values[0], context) : undefined;
            const end = values.length >= 2 ? this.toNumber(values[0], context) : undefined;

            return this.constructArray(array.slice(start, end), context);
        }));

        this.defineProperty(arrayPrototype, 'forEach', this.objectMethod((thisArg, values, context) => {
            const array = this.toArray(thisArg, context);

            array.forEach((value, index) => this.executeFunction(values[0], undefinedValue, [value, numberValue(index)], context));

            return undefinedValue;
        }));

        this.defineProperty(this.errorPrototype, 'toString', this.objectMethod((thisArg, args, context) => this.readProperty(thisArg, 'message', context)));
        
        const numberPrototype = (this.readProperty(this.Number, 'prototype', null) as ObjectValue);

        this.defineProperty(numberPrototype, 'valueOf', this.objectMethod((thisArg, args, context) => {
            if (thisArg.internalFields.hasOwnProperty('wrappedValue')) {
                const wrappedValue: Value = thisArg.internalFields['wrappedValue'];
                if (wrappedValue.type === 'number') {
                    return wrappedValue;
                }
            }

            throw this.newTypeError('Number.valueOf failed', context);
        }));

        const stringPrototype = (this.readProperty(this.String, 'prototype', null) as ObjectValue);

        this.defineProperty(stringPrototype, 'valueOf', this.objectMethod((thisArg, args, context) => {
            if (thisArg.internalFields.hasOwnProperty('wrappedValue')) {
                const wrappedValue: Value = thisArg.internalFields['wrappedValue'];
                if (wrappedValue.type === 'string') {
                    return wrappedValue;
                }
            }

            throw this.newTypeError('String.valueOf failed', context);
        }));
        
        this.defineProperty(stringPrototype, 'length', {
            descriptorType: 'accessor',
            getter: this.objectMethod((thisArg, args, context) => {
                if (thisArg.internalFields.hasOwnProperty('wrappedValue')) {
                    const wrappedValue: Value = thisArg.internalFields['wrappedValue'];
                    if (wrappedValue.type === 'string') {
                        return numberValue(wrappedValue.value.length);
                    }
                }

                throw this.newTypeError('String.length failed', context);
            })
        });

        this.defineProperty(stringPrototype, 'slice', {
            descriptorType: 'accessor',
            getter: this.objectMethod((thisArg, args, context) => {
                if (thisArg.internalFields.hasOwnProperty('wrappedValue')) {
                    const wrappedValue: Value = thisArg.internalFields['wrappedValue'];
                    if (wrappedValue.type === 'string') {
                        const start = args.length >= 1 ? this.toNumber(args[0], context) : undefined;
                        const end = args.length >= 2 ? this.toNumber(args[0], context) : undefined;

                        return stringValue(wrappedValue.value.slice(start, end));
                    }
                }

                throw this.newTypeError('String.slice failed', context);
            })
        });
        
        (stringPrototype.internalFields as HasGetPropertyDescriptor).getPropertyDescriptor = (object, propertyName, context) => {
            const index = Number(propertyName);

            if (isNaN(Number(propertyName)) || index < 0) {
                return this.getDefinedPropertyDescriptor(object, propertyName, context);
            }

            return {
                descriptorType: 'accessor',
                getter: this.objectMethod((thisArg, args, context) => {
                    if (thisArg.internalFields.hasOwnProperty('wrappedValue')) {
                        const wrappedValue: Value = thisArg.internalFields['wrappedValue'];
                        if (wrappedValue.type === 'string') {
                            return stringValue(wrappedValue.value[index]);
                        }
                    }
    
                    throw this.newTypeError('String[index] failed', context);
                })
            } as ObjectPropertyDescriptor;
        };
        
        const globals = {
            Object: this.Object,
            Function: this.Function,
            Array: this.Array,
            String: this.String,
            Date: this.Date,
            Promise: this.Promise,
            Error: this.Error,
            TypeError: this.TypeError,
            EvalError: this.EvalError,
            RangeError: this.RangeError,
            ReferenceError: this.ReferenceError,
            SyntaxError: this.SyntaxError,
            URIError: this.URIError,
            ArrayBuffer: this.ArrayBuffer,
            Float64Array: this.Float64Array,
            Float32Array: this.Float32Array,
            Int32Array: this.Int32Array,
            Int16Array: this.Int16Array,
            Int8Array: this.Int8Array,
            Uint32Array: this.Uint32Array,
            Uint16Array: this.Uint16Array,
            Uint8Array: this.Uint8Array,
            Uint8ClampedArray: this.Uint8ClampedArray,
            Number: this.Number,
            Boolean: this.Boolean,
            Symbol: this.Symbol,
            Reflect: this.Reflect,
            Math: this.Math,
            log: this.log,
        };

        Object.keys(globals)
            .forEach(name => this.defineProperty(this.globalScope.variables, name, (globals as any)[name]));
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

    getPropertyDescriptor(object: ObjectValue, propertyName: string, context: Context): ObjectPropertyDescriptor | null {
        if('getPropertyDescriptor' in object.internalFields) {
            return (object.internalFields as HasGetPropertyDescriptor).getPropertyDescriptor(object, propertyName, context);
        }

        return this.getDefinedPropertyDescriptor(object, propertyName, context);
    }

    getDefinedPropertyDescriptor(object: ObjectValue, propertyName: string, context: Context): ObjectPropertyDescriptor | null {
        const property = object.ownProperties.get(propertyName);
        
        if (property !== undefined) {
            return property;
        }

        if (object.prototype.type === 'null') {
            return null;
        }

        return this.getPropertyDescriptor(object.prototype, propertyName, context);
    }

    readProperty(object: ObjectValue, propertyName: string, context: Context): Value {
        const property = this.getPropertyDescriptor(object, propertyName, context);
        
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
        return new RuntimeError(this.constructObject(this.TypeError, [
            stringValue(message)
        ], context), context);
    }

    newReferenceError(message: string, context: Context): RuntimeError {
        return new RuntimeError(this.constructObject(this.ReferenceError, [
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

        return this.toObject(args[0], context);
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
        thisArg.internalFields['date'] = new (Date as any)(...args.slice(0, 7).map(arg => this.toNumber(arg, context)));
        return undefinedValue;
    }

    promiseConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return undefinedValue;
    }

    arrayBufferConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return undefinedValue;
    }

    typedArrayConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return undefinedValue;
    }

    float64ArrayConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return undefinedValue;
    }

    float32ArrayConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return undefinedValue;
    }

    int32ArrayConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return undefinedValue;
    }

    int16ArrayConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return undefinedValue;
    }

    int8ArrayConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return undefinedValue;
    }

    uint32ArrayConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return undefinedValue;
    }

    uint16ArrayConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return undefinedValue;
    }

    uint8ArrayConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
        return undefinedValue;
    }

    uint8ClampedArrayConstructor(thisArg: ObjectValue, args: Value[], context: Context): Value {
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

    objectMethod(invoke: ObjectMethodInvoke, options?: FunctionOptions): ObjectValue {
        return this.functionValue((thisArg, argValues, context, newTarget) => {
            if (thisArg.type !== 'object') {
                throw new NotImplementedError('calling object method with incorrect thisArg ' + thisArg.type, context);
            }

            return invoke(thisArg, argValues, context, newTarget);
        }, options);
    }

    functionValue(invoke: GeneralFunctionInvoke, options?: FunctionOptions): ObjectValue {
        const internalFields: FunctionInternalFields = {
            invoke,
            isConstructor: (options && typeof options.isConstructor === 'boolean') ? options.isConstructor : true
        };

        const functionPrototype = (options && options.functionPrototype) || this.functionPrototype;
        const result = objectValue(functionPrototype, internalFields);
        
        const prototype = (options && options.prototype) || this.newObject();
        const name = options && options.name;

        this.defineProperty(result, 'prototype', prototype);
        this.defineProperty(result, 'name', name ? stringValue(name) : undefinedValue);

        this.defineProperty(prototype, 'constructor', result);

        return result;
    }

    valueOf(value: Value, context: Context): Exclude<Value, ObjectValue> {
        if (value.type !== 'object') {
            return value;
        }
        
        const internalValue = this.executeMethod(value, 'valueOf', [], context);
        
        if (internalValue.type !== 'object') {
            return internalValue;
        }

        const stringResult = this.executeMethod(value, 'toString', [], context);
        
        if (stringResult.type === 'object') {
            throw this.newTypeError('Cannot convert object to primitive value', context);
        }

        return stringResult;
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
                const internalValue = this.valueOf(value, context);
                
                return this.toString(internalValue, context);
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
                return this.toNumber(this.valueOf(value, context), context);
            case 'undefined':
                return NaN;
        }
    }

    toObject(value: Value, context: Context): ObjectValue {
        switch(value.type) {
            case 'null':
            case 'undefined':
                return objectValue(this.rootPrototype);
            case 'number':
                return this.constructObject(this.Number, [value], context);
            case 'boolean':
                return this.constructObject(this.Boolean, [value], context);
            case 'string':
                return this.constructObject(this.String, [value], context);
            case 'object':
                return value;
        }
    }
    
    isFunction(value: Value): value is ObjectValue & false {
        return value.type === 'object' && this.isPrototypeOf(this.functionPrototype, value);
    }

    isInstanceOf(left: Value, right: Value, context: Context): boolean {
        if (!this.isFunction(right)) {
            throw new NotImplementedError(`Right-hand side of 'instanceof' is not a function`, context);
        }

        if (left.type !== 'object') {
            return false;
        }

        const prototype = this.readProperty(right, 'prototype', context);

        return left.prototype === prototype;
    }
    
    isPrototypeOf(prototype: ObjectValue, value: ObjectValue): boolean {
        if (value.prototype.type === 'null') {
            return false;
        }

        if (prototype === value.prototype) {
            return true;
        }

        return this.isPrototypeOf(prototype, value.prototype);
    }

    executeFunction(callee: Value, thisArg: Value, args: Value[], context: Context, newTarget: Value = undefinedValue): Value {
        if (callee.type !== 'object') {
            throw this.newReferenceError('call is unsupported for ' + callee.type, context);
        }
    
        if (callee.prototype !== this.Function.prototype) {
            throw new NotImplementedError('cannot call non-function', context);
        }
    
        const internalFields = callee.internalFields as FunctionInternalFields;

        if (newTarget !== undefinedValue && !internalFields.isConstructor) {
            throw this.newTypeError('function is not a constructor', context);
        }

        return internalFields.invoke(thisArg, args, context, newTarget);
    }

    executeMethod(value: ObjectValue, methodName: string, args: Value[], context: Context): Value {
        const method = this.readProperty(value, methodName, context);

        return this.executeFunction(method, value, args, context);
    }

    newObject(): ObjectValue {
        return objectValue(this.rootPrototype);
    }

    constructArray(elements: Value[], context: Context): ObjectValue {
        return this.constructObject(this.Array, elements, context);
    }

    constructObject(constructor: Value, args: Value[], context: Context, newTargetConstructor: Value = constructor): ObjectValue {
        if (constructor.type !== 'object') {
            throw new NotImplementedError('new is unsupported for ' + constructor.type, context);
        }
    
        if (constructor.prototype !== this.Function.prototype) {
            throw this.newTypeError('cannot use new for non-function', context);
        }

        if (newTargetConstructor.type !== 'object') {
            throw this.newTypeError('new is unsupported for target ' + newTargetConstructor.type, context);
        }
    
        if (newTargetConstructor.prototype !== this.Function.prototype) {
            throw this.newTypeError('cannot use new for non-function target', context);
        }
    
        const internalFields = constructor.internalFields as FunctionInternalFields;

        if (!internalFields.isConstructor) {
            throw this.newTypeError('function is not a constructor', context);
        }

        const newTargetConstructorInternalFields = newTargetConstructor.internalFields as FunctionInternalFields;

        if (!newTargetConstructorInternalFields.isConstructor) {
            throw this.newTypeError('function is not a constructor', context);
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