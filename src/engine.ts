import { parseExpression } from '@babel/parser';
import { FunctionExpression } from '@babel/types';
import { Context } from './context';
import { booleanValue, nullValue, numberValue, objectValue, ParsedScript, stringValue, undefinedValue } from './factories';
import { Scope } from './scope';
import { AccessorObjectPropertyDescriptor, Class, ClassDefinition, FunctionInternalFields, FunctionOptions, GeneralFunctionInvoke, HasGetPropertyDescriptor, MandatoryObjectPropertyDescriptorFields, ObjectDefinition, ObjectMethodInvoke, ObjectPropertyDescriptor, ObjectValue, StringValue, Value, ValueObjectPropertyDescriptor } from './types';

export class Engine {
    readonly rootProto = objectValue(nullValue);
    readonly functionProto = objectValue(this.rootProto);
    
    readonly Object = this.createClass({
        name: 'Object',
        proto: this.rootProto,
        ctor: (context: Context, thisArg: Value, args: Value[]) => {
            if (args.length === 0) {
                return objectValue(this.rootProto);
            }
    
            const value = args[0];
    
            switch(value.type) {
                case 'null':
                case 'undefined':
                    return objectValue(this.rootProto);
                default:
                    return context.toObject(value);
            }
        },
        methods: {
            ['toString' as string]: {
                isMethod: false,
                body: (context, thisArg) => {
                    switch(thisArg.type) {
                        case 'null':
                            return stringValue('[object Null]');
                        case 'undefined':
                            return stringValue('[object Undefined]');
                        case 'boolean':
                            return stringValue('[object Boolean]');
                        case 'number':
                            return stringValue('[object Number]');
                        case 'string':
                            return stringValue('[object String]');
                        case 'object':
                            if (this.isFunction(thisArg)) {
                                return stringValue('[object Function]');
                            } else {
                                return stringValue('[object Object]');
                            }
                    }
                }
            },
            ['valueOf' as string]: (context, thisArg) => thisArg,
            ['hasOwnProperty' as string]: (context, thisArg, args) => booleanValue(thisArg.ownProperties.has(context.toString(args[0]))),
            ['propertyIsEnumerable' as string]: (context, thisArg, args) => {
                const name = context.toString(args[0]);
    
                const property = thisArg.ownProperties.get(name);
    
                return booleanValue(property !== undefined && property.enumerable);
            }
        },
        staticMethods: {
            getOwnPropertyDescriptor: (context, thisArg, args) => {
                const object = args[0];
                
                if (object.type !== 'object') {
                    throw context.newTypeError('getOwnPropertyDescriptor should be called for object value');
                }

                const descriptor = object.ownProperties.get(context.toString(args[1]));

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
            },
            defineProperty: (context, thisArg, args) => {
                const object = args[0];
                if (object.type !== 'object') {
                    throw context.newTypeError('defineProperty should be called for object value');
                }

                const descriptor = args[2];
                if (descriptor.type !== 'object') {
                    throw context.newNotImplementedError('defineProperty descriptor arg should be object value');
                }

                const propertyName = context.toString(args[1]);
                const existingDescriptor = object.ownProperties.get(propertyName);

                if (existingDescriptor !== undefined && existingDescriptor.configurable === false) {
                    throw context.newTypeError('cannot change non configurable property');
                }

                const value = context.readProperty(descriptor, 'value');
                const writable = context.readProperty(descriptor, 'writable');
                const enumerable = context.readProperty(descriptor, 'enumerable');
                const configurable = context.readProperty(descriptor, 'configurable');
                const getter = context.readProperty(descriptor, 'get');
                const setter = context.readProperty(descriptor, 'set');

                const isAccessor = getter !== undefinedValue || setter !== undefinedValue;
                const isValue = value !== undefinedValue || writable !== undefinedValue;

                if (isAccessor && isValue) {
                    throw context.newTypeError('property descriptor should be either a value of an accessor');
                }

                const mandatoryDefaults: MandatoryObjectPropertyDescriptorFields = (existingDescriptor === undefined) ? {
                    configurable: false,
                    enumerable: false
                } : existingDescriptor;

                const mandatoryFields: MandatoryObjectPropertyDescriptorFields = {
                    configurable: configurable === undefinedValue ? mandatoryDefaults.configurable : context.toBoolean(configurable),
                    enumerable: enumerable === undefinedValue ? mandatoryDefaults.configurable : context.toBoolean(enumerable)
                };

                if (isAccessor) {
                    if (getter.type !== 'undefined' && getter.type !== 'object') {
                        throw context.newTypeError('getter should be a function ' + getter.type);
                    }

                    if (setter.type !== 'undefined' && setter.type !== 'object') {
                        throw context.newTypeError('setter should be a function ' + setter.type);
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
                        writable: writable === undefinedValue ? defaults.writable : context.toBoolean(writable)
                    });
                }

                return object;
            },
            getPrototypeOf:(context, thisArg, args) => {
                const object = args[0];
                
                if (object.type !== 'object') {
                    throw context.newTypeError('getOwnPropertyDescriptor should be called for object value');
                }

                return object.proto;
            }
        }
    });

    readonly Function = this.createClass({
        name: 'Function',
        proto: this.functionProto,
        ctor: (context: Context, thisArg: ObjectValue, values: Value[]) => {
            if (!values.every(x => x.type === 'string')) {
                throw context.newNotImplementedError('function constructor arguments must be strings');
            }
    
            if (values.length > 0) {                
                const argNames = values.slice(0, -1) as StringValue[];
                const code = values.slice(-1)[0] as StringValue;
    
                const functionExpression = parseExpression(`function(${ argNames.map(a => a.value).join(',') }) { ${code.value} }`);
                
                return this.globalScope.functionValue(functionExpression as FunctionExpression);
            } else {
                return this.functionValue(() => undefinedValue);
            }
        },
        methods: {
            call: (context, thisArg, args) => context.executeFunction(thisArg, args[0] as ObjectValue, args.slice(1))
        }
    });
    
    readonly Array = this.createClass({
        name: 'Array',
        ctor: (context: Context, thisArg: ObjectValue, args: Value[]) => {
            this.defineProperty(thisArg, 'length', numberValue(args.length));

            args.forEach((value, index) => this.defineProperty(thisArg, index.toString(), value));

            return undefinedValue;
        },
        methods: {
            push: (context, thisArg, values) => {
                const lengthValue = context.readProperty(thisArg, 'length');

                const length = context.toNumber(lengthValue);
                const newLength = numberValue(length + values.length);
                
                this.defineProperty(thisArg, 'length', newLength);

                values.forEach((value, index) => this.defineProperty(thisArg, (length + index).toString(), value));

                return newLength;
            },
            join: (context, thisArg, values) => {
                const array = context.toArray(thisArg);

                const separator = values.length === 0 ? ',' : context.toString(values[0]);

                return stringValue(array.map(item => context.toString(item)).join(separator));
            },
            slice: (context, thisArg, values) => {
                const array = context.toArray(thisArg);

                const start = values.length >= 1 ? context.toNumber(values[0]) : undefined;
                const end = values.length >= 2 ? context.toNumber(values[1]) : undefined;

                return context.constructArray(array.slice(start, end));
            },
            forEach: (context, thisArg, values) => {
                const array = context.toArray(thisArg);

                array.forEach((value, index) => context.executeFunction(values[0], undefinedValue, [value, numberValue(index)]));

                return undefinedValue;
            }
        }
    });

    readonly String = this.createClass({
        name: 'String',
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            const value = stringValue(args.length === 0 ? '' : context.toString(args[0]));
    
            if (newTarget === undefinedValue) {
                return value;
            } else {
                thisArg.internalFields['wrappedValue'] = value;
                return undefinedValue;
            }
        },
        methods: {
            ['valueOf' as string]: (context, thisArg, args) => {
                if (thisArg.internalFields.hasOwnProperty('wrappedValue')) {
                    const wrappedValue: Value = thisArg.internalFields['wrappedValue'];
                    if (wrappedValue.type === 'string') {
                        return wrappedValue;
                    }
                }

                throw context.newTypeError('String.valueOf failed');
            },
            slice:(context, thisArg, args) => {
                if (thisArg.internalFields.hasOwnProperty('wrappedValue')) {
                    const wrappedValue: Value = thisArg.internalFields['wrappedValue'];
                    if (wrappedValue.type === 'string') {
                        const start = args.length >= 1 ? context.toNumber(args[0]) : undefined;
                        const end = args.length >= 2 ? context.toNumber(args[1]) : undefined;

                        return stringValue(wrappedValue.value.slice(start, end));
                    }
                }

                throw context.newTypeError('String.slice failed');
            }
        },
        properties: {
            length: {
                descriptorType: 'accessor',
                getter: this.objectMethod((context, thisArg, args) => {
                    if (thisArg.internalFields.hasOwnProperty('wrappedValue')) {
                        const wrappedValue: Value = thisArg.internalFields['wrappedValue'];
                        if (wrappedValue.type === 'string') {
                            return numberValue(wrappedValue.value.length);
                        }
                    }

                    throw context.newTypeError('String.length failed');
                }),
                setter: undefinedValue
            } as ObjectPropertyDescriptor
        },
        getOwnPropertyDescriptor: (context, thisArg, propertyName) => {
            const index = Number(propertyName);

            if (isNaN(Number(propertyName)) || index < 0) {
                return null;
            }

            return {
                descriptorType: 'accessor',
                getter: this.objectMethod((context, thisArg) => {
                    if (thisArg.internalFields.hasOwnProperty('wrappedValue')) {
                        const wrappedValue: Value = thisArg.internalFields['wrappedValue'];
                        if (wrappedValue.type === 'string') {
                            return stringValue(wrappedValue.value[index]);
                        }
                    }
    
                    throw context.newTypeError('String[index] failed');
                })
            } as ObjectPropertyDescriptor;
        }
    });

    readonly Number = this.createClass({
        name: 'Number',
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            const value = numberValue(args.length === 0 ? 0 : context.toNumber(args[0]));
    
            if (newTarget === undefinedValue) {
                return value;
            } else {
                thisArg.internalFields['wrappedValue'] = value;
                return undefinedValue;
            }
        },
        methods: {
            ['valueOf' as string]: (context, thisArg) => {
                if (thisArg.internalFields.hasOwnProperty('wrappedValue')) {
                    const wrappedValue: Value = thisArg.internalFields['wrappedValue'];
                    if (wrappedValue.type === 'number') {
                        return wrappedValue;
                    }
                }
    
                throw context.newTypeError('Number.valueOf failed');
            }
        },
        staticMethods: {
            isNaN: (context, thisArg, args) => {
                const number = context.toNumber(args[0]);
                
                return booleanValue(Number.isNaN(number));
            }
        }
    });

    readonly Boolean = this.createClass({
        name: 'Boolean',
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            const value = booleanValue(args.length === 0 ? false : context.toBoolean(args[0]));
    
            if (newTarget) {
                return value;
            } else {
                thisArg.internalFields['wrappedValue'] = value;
                return undefinedValue;
            }
        }
    });

    readonly Date = this.createClass({
        name: 'Date',
        ctor: (context: Context, thisArg: ObjectValue, args: Value[]) => {
            thisArg.internalFields['date'] = new (Date as any)(...args.slice(0, 7).map(arg => context.toNumber(arg)));
            return undefinedValue;
        },
        methods: {
            getTimezoneOffset: (context, thisArg) => {
                return numberValue(thisArg.internalFields['date'].getTimezoneOffset());
            },
            ['valueOf' as string]: (context, thisArg) => {
                return numberValue(thisArg.internalFields['date'].valueOf());
            }
        }
    });

    readonly RegExp = this.createClass({
        name: 'RegExp',
        ctor: (context: Context, thisArg: ObjectValue, args: Value[]) => {
            thisArg.internalFields['regex'] = new RegExp(context.toString(args[0]), context.toString(args[1]));
            return undefinedValue;
        },
        methods: {
            test: (context, thisArg, args) => {
                return booleanValue(thisArg.internalFields['regex'].test(context.toString(args[0])));
            }
        }
    });

    readonly Promise = this.createClass({
        name: 'Promise',
        ctor: () => {
            return undefinedValue;
        }
    });

    readonly Symbol = this.createClass({
        name: 'Symbol',
        ctor: () => {
            return undefinedValue;
        }
    });

    readonly ArrayBuffer = this.createClass({
        name: 'ArrayBuffer',
        ctor: () => {
            return undefinedValue;
        }
    });
    
    readonly Error = this.createClass({
        name: 'Error',
        ctor: (context: Context, thisArg: ObjectValue, args: Value[]) => {
            this.defineProperty(thisArg, 'message', args.length === 0 ? undefinedValue: args[0]);
            return undefinedValue;
        },
        methods: {
            ['toString' as string]: (context, thisArg) => context.readProperty(thisArg, 'message')
        }
    });

    readonly TypeError = this.createClass({
        name: 'TypeError',
        baseClass: this.Error
    });

    readonly EvalError = this.createClass({
        name: 'EvalError',
        baseClass: this.Error
    });
    
    readonly RangeError = this.createClass({
        name: 'RangeError',
        baseClass: this.Error
    });

    readonly ReferenceError = this.createClass({
        name: 'ReferenceError',
        baseClass: this.Error
    });

    readonly SyntaxError = this.createClass({
        name: 'SyntaxError',
        baseClass: this.Error
    });

    readonly URIError = this.createClass({
        name: 'URIError',
        baseClass: this.Error
    });

    readonly TypedArray = this.createClass({
        name: 'TypedArray',
        ctor: context => {
            throw context.newNotImplementedError('Do not call TypedArray');
        },
        methods: {
            fill: (context, thisArg, args) => {
                if (thisArg.internalFields.hasOwnProperty('typedArray')) {
                    const wrappedValue = thisArg.internalFields['typedArray'];
                    return numberValue(wrappedValue.fill(context.toNumber(args[0])));
                }

                throw context.newTypeError('TypedArray[index] failed');
            }
        },
        getOwnPropertyDescriptor: (context, thisArg, propertyName) => {
            const index = Number(propertyName);

            if (isNaN(Number(propertyName)) || index < 0) {
                return null;
            }

            return {
                descriptorType: 'accessor',
                getter: this.objectMethod((context, thisArg) => {
                    if (thisArg.internalFields.hasOwnProperty('typedArray')) {
                        const wrappedValue = thisArg.internalFields['typedArray'];
                        return numberValue(wrappedValue[index]);
                    }
    
                    throw context.newTypeError('TypedArray[index] failed');
                })
            } as ObjectPropertyDescriptor;
        }
    });

    readonly Float64Array = this.createClass({
        name: 'Float64Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return context.typedArrayConstructor(Float64Array, thisArg, args, newTarget);
        }
    });

    readonly Float32Array = this.createClass({
        name: 'Float32Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return context.typedArrayConstructor(Float32Array, thisArg, args, newTarget);
        }
    });

    readonly Int32Array = this.createClass({
        name: 'Int32Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return context.typedArrayConstructor(Int32Array, thisArg, args, newTarget);
        }
    });

    readonly Int16Array = this.createClass({
        name: 'Int16Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return context.typedArrayConstructor(Int16Array, thisArg, args, newTarget);
        }
    });
    
    readonly Int8Array = this.createClass({
        name: 'Int8Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return context.typedArrayConstructor(Int8Array, thisArg, args, newTarget);
        }
    });

    readonly Uint32Array = this.createClass({
        name: 'Uint32Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return context.typedArrayConstructor(Uint32Array, thisArg, args, newTarget);
        }
    });

    readonly Uint16Array = this.createClass({
        name: 'Uint16Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return context.typedArrayConstructor(Uint16Array, thisArg, args, newTarget);
        }
    });
    
    readonly Uint8Array = this.createClass({
        name: 'Uint8Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return context.typedArrayConstructor(Uint8Array, thisArg, args, newTarget);
        }
    });
    
    readonly Uint8ClampedArray = this.createClass({
        name: 'Uint8ClampedArray',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return context.typedArrayConstructor(Uint8ClampedArray, thisArg, args, newTarget);
        }
    });

    readonly Reflect = this.newObject({
        methods: {
            construct: (context, thisArg, args) => {
                const constructorArgs = context.toArray(args[1] as ObjectValue);
                
                return context.constructObject(args[0], constructorArgs, args.length < 3 ? args[0] : args[2]);
            }
        }
    });

    readonly Math = this.newObject({
        methods: {
            pow: {
                isMethod: false,
                body: (context, thisArg, args) => {
                    const a = context.toNumber(args[0]);
                    const b = context.toNumber(args[1]);
                    
                    return numberValue(Math.pow(a, b));
                }
            }
        }
    });

    readonly log = this.functionValue((context, thisArg, values) => {
        console.log(...values.map(value => context.toString(value)));
        return undefinedValue;
    });

    readonly isNaN = this.functionValue((context, thisArg, args) => {
        const number = context.toNumber(args[0]);
        
        return booleanValue(Number.isNaN(number));
    });

    readonly eval = this.functionValue((context, thisArg, args) => {
        const code = args[0] as StringValue;

        const functionExpression = parseExpression(`function() { ${ code.value } }`);
        
        if (context === null || context.scope === null) {
           throw context.newNotImplementedError('cannot eval');
        }
        
        return context.executeFunction(context.scope.functionValue(functionExpression as FunctionExpression), thisArg, []);
    });

    readonly globalVars = this.newObject({
        fields: {
            Object: this.Object.constructor,
            Function: this.Function.constructor,
            Array: this.Array.constructor,
            String: this.String.constructor,
            Date: this.Date.constructor,
            RegExp: this.RegExp.constructor,
            Promise: this.Promise.constructor,
            Error: this.Error.constructor,
            TypeError: this.TypeError.constructor,
            EvalError: this.EvalError.constructor,
            RangeError: this.RangeError.constructor,
            ReferenceError: this.ReferenceError.constructor,
            SyntaxError: this.SyntaxError.constructor,
            URIError: this.URIError.constructor,
            ArrayBuffer: this.ArrayBuffer.constructor,
            Float64Array: this.Float64Array.constructor,
            Float32Array: this.Float32Array.constructor,
            Int32Array: this.Int32Array.constructor,
            Int16Array: this.Int16Array.constructor,
            Int8Array: this.Int8Array.constructor,
            Uint32Array: this.Uint32Array.constructor,
            Uint16Array: this.Uint16Array.constructor,
            Uint8Array: this.Uint8Array.constructor,
            Uint8ClampedArray: this.Uint8ClampedArray.constructor,
            Number: this.Number.constructor,
            Boolean: this.Boolean.constructor,
            Symbol: this.Symbol.constructor,
            Reflect: this.Reflect,
            Math: this.Math,
            log: this.log,
            isNaN: this.isNaN,
            eval: this.eval
        }
    });

    readonly globalScope = new Scope(this, null, null, null, this.globalVars, this.globalVars);

    runGlobalCode(script: ParsedScript): void {
        this.globalScope.evaluateScript(script);
    }

    createClassProto(classDefinition: ClassDefinition): ObjectValue {
        const classProtoDefinition = classDefinition.baseClass ? {
            ...classDefinition,
            proto: classDefinition.baseClass && classDefinition.baseClass.proto
        }: classDefinition;

        const proto = classDefinition.proto || this.newObject(classProtoDefinition);
        this.fillObject(proto, classProtoDefinition);

        return proto;
    }

    createClass(classDefinition: ClassDefinition): Class {
        const proto = this.createClassProto(classDefinition);

        const constructorFunction = classDefinition.ctor ?
            this.objectMethodFunction(classDefinition.ctor) :
            classDefinition.baseClass ?
                (classDefinition.baseClass.constructor.internalFields as FunctionInternalFields).invoke :
                this.objectMethodFunction(() => undefinedValue);

        const constructor = this.functionValue(constructorFunction, {
            name: classDefinition.name,
            proto,
            functionProto: classDefinition.ctorProto
        });

        const staticMethods = classDefinition.staticMethods;

        if (staticMethods) {
            Object.keys(staticMethods)
                .forEach(methodName => {
                    const m = staticMethods[methodName];
                    
                    const methodBody = m instanceof Function ?
                        this.objectMethodFunction(m) :
                        m.isMethod ?
                            this.objectMethodFunction(m.body) :
                            m.body;

                    this.defineProperty(constructor, methodName, this.functionValue(methodBody, {
                        name: methodName
                    }));
                });
        }

        const staticProperties = classDefinition.staticProperties;
        if (staticProperties) {
            Object.keys(staticProperties)
                .forEach(propertyName => {
                    this.defineProperty(constructor, propertyName, staticProperties[propertyName]);
                });
        }

        return {
            constructor,
            proto
        };
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
    
    objectMethod(invoke: ObjectMethodInvoke, options?: FunctionOptions): ObjectValue {
        return this.functionValue(this.objectMethodFunction(invoke), options);
    }

    objectMethodFunction(invoke: ObjectMethodInvoke): GeneralFunctionInvoke {
        return (context, thisArg, argValues, newTarget) => {
            if (thisArg.type === 'null' || thisArg.type === 'undefined') {
                throw context.newNotImplementedError('cannot call object method with null or undefined');
            }

            const thisAsObject = context.toObject(thisArg);

            return invoke(context, thisAsObject, argValues, newTarget);
        }
    }

    functionValue(invoke: GeneralFunctionInvoke, options?: FunctionOptions): ObjectValue {
        const internalFields: FunctionInternalFields = {
            invoke,
            isConstructor: (options && typeof options.isConstructor === 'boolean') ? options.isConstructor : true
        };

        const functionProto = (options && options.functionProto) || this.functionProto;
        const result = objectValue(functionProto, internalFields);
        
        const proto = (options && options.proto) || this.newObject();
        const name = options && options.name;

        this.defineProperty(result, 'prototype', proto);
        this.defineProperty(result, 'name', name ? stringValue(name) : undefinedValue);

        this.defineProperty(proto, 'constructor', result);

        return result;
    }
    
    isFunction(value: Value): value is ObjectValue {
        return value.type === 'object' && this.isPrototypeOf(this.functionProto, value);
    }
    
    isPrototypeOf(proto: ObjectValue, value: ObjectValue): boolean {
        if (value.proto.type === 'null') {
            return false;
        }

        if (proto === value.proto) {
            return true;
        }

        return this.isPrototypeOf(proto, value.proto);
    }

    newObject(objectDefinition?: ObjectDefinition): ObjectValue {
        const result = objectValue(objectDefinition && objectDefinition.proto || this.rootProto);
        
        if (objectDefinition) {
            this.fillObject(result, objectDefinition);
        }
        
        return result;
    }

    fillObject(object: ObjectValue, objectDefinition: ObjectDefinition): void {
        const methods = objectDefinition.methods;
        if (methods) {
            Object.keys(methods)
                .forEach(methodName => {
                    const m = methods[methodName];
                    
                    const methodBody = m instanceof Function ?
                        this.objectMethodFunction(m) :
                        m.isMethod ?
                            this.objectMethodFunction(m.body) :
                            m.body;

                    this.defineProperty(object, methodName, this.functionValue(methodBody, {
                        name: methodName
                    }));
                });
        }

        const properties = objectDefinition.properties;
        if (properties) {
            Object.keys(properties)
                .forEach(propertyName => {
                    this.defineProperty(object, propertyName, properties[propertyName]);
                });
        }

        const fields = objectDefinition.fields;
        if (fields) {
            Object.keys(fields)
                .forEach(fieldName => {
                    this.defineProperty(object, fieldName, {
                        value: fields[fieldName]
                    });
                });
        }

        const getOwnPropertyDescriptor = objectDefinition.getOwnPropertyDescriptor;
        if (getOwnPropertyDescriptor) {
            (object.internalFields as HasGetPropertyDescriptor).getOwnPropertyDescriptor = getOwnPropertyDescriptor;
        }
    }
}