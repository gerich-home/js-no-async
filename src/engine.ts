import { parseExpression } from '@babel/parser';
import { FunctionExpression } from '@babel/types';
import { booleanValue, nullValue, numberValue, objectValue, ParsedScript, stringValue, undefinedValue } from './factories';
import { NotImplementedError } from './notImplementedError';
import { RuntimeError } from './runtimeError';
import { Scope } from './scope';
import { AccessorObjectPropertyDescriptor, Class, ClassDefinition, Context, FunctionInternalFields, FunctionOptions, GeneralFunctionInvoke, HasGetPropertyDescriptor, MandatoryObjectPropertyDescriptorFields, NullValue, ObjectDefinition, ObjectMethodInvoke, ObjectPropertyDescriptor, ObjectValue, StringValue, UndefinedValue, Value, ValueObjectPropertyDescriptor } from './types';

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
                    return this.toObject(context, value);
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
            ['hasOwnProperty' as string]: (context, thisArg, args) => booleanValue(thisArg.ownProperties.has(this.toString(context, args[0]))),
            ['propertyIsEnumerable' as string]: (context, thisArg, args) => {
                const name = this.toString(context, args[0]);
    
                const property = thisArg.ownProperties.get(name);
    
                return booleanValue(property !== undefined && property.enumerable);
            }
        },
        staticMethods: {
            getOwnPropertyDescriptor: (context, thisArg, args) => {
                const object = args[0];
                
                if (object.type !== 'object') {
                    throw this.newTypeError(context, 'getOwnPropertyDescriptor should be called for object value');
                }

                const descriptor = object.ownProperties.get(this.toString(context, args[1]));

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
                    throw this.newTypeError(context, 'defineProperty should be called for object value');
                }

                const descriptor = args[2];
                if (descriptor.type !== 'object') {
                    throw new NotImplementedError(context, 'defineProperty descriptor arg should be object value');
                }

                const propertyName = this.toString(context, args[1]);
                const existingDescriptor = object.ownProperties.get(propertyName);

                if (existingDescriptor !== undefined && existingDescriptor.configurable === false) {
                    throw this.newTypeError(context, 'cannot change non configurable property');
                }

                const value = this.readProperty(context, descriptor, 'value');
                const writable = this.readProperty(context, descriptor, 'writable');
                const enumerable = this.readProperty(context, descriptor, 'enumerable');
                const configurable = this.readProperty(context, descriptor, 'configurable');
                const getter = this.readProperty(context, descriptor, 'get');
                const setter = this.readProperty(context, descriptor, 'set');

                const isAccessor = getter !== undefinedValue || setter !== undefinedValue;
                const isValue = value !== undefinedValue || writable !== undefinedValue;

                if (isAccessor && isValue) {
                    throw this.newTypeError(context, 'property descriptor should be either a value of an accessor');
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
                        throw this.newTypeError(context, 'getter should be a function ' + getter.type);
                    }

                    if (setter.type !== 'undefined' && setter.type !== 'object') {
                        throw this.newTypeError(context, 'setter should be a function ' + setter.type);
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
            },
            getPrototypeOf:(context, thisArg, args) => {
                const object = args[0];
                
                if (object.type !== 'object') {
                    throw this.newTypeError(context, 'getOwnPropertyDescriptor should be called for object value');
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
                throw new NotImplementedError(context, 'function constructor arguments must be strings');
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
            call: (context, thisArg, args) => this.executeFunction(context, thisArg, args[0] as ObjectValue, args.slice(1))
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
                const lengthValue = this.readProperty(context, thisArg, 'length');

                const length = this.toNumber(context, lengthValue);
                const newLength = numberValue(length + values.length);
                
                this.defineProperty(thisArg, 'length', newLength);

                values.forEach((value, index) => this.defineProperty(thisArg, (length + index).toString(), value));

                return newLength;
            },
            join: (context, thisArg, values) => {
                const array = this.toArray(context, thisArg);

                const separator = values.length === 0 ? ',' : this.toString(context, values[0]);

                return stringValue(array.map(item => this.toString(context, item)).join(separator));
            },
            slice: (context, thisArg, values) => {
                const array = this.toArray(context, thisArg);

                const start = values.length >= 1 ? this.toNumber(context, values[0]) : undefined;
                const end = values.length >= 2 ? this.toNumber(context, values[1]) : undefined;

                return this.constructArray(context, array.slice(start, end));
            },
            forEach: (context, thisArg, values) => {
                const array = this.toArray(context, thisArg);

                array.forEach((value, index) => this.executeFunction(context, values[0], undefinedValue, [value, numberValue(index)]));

                return undefinedValue;
            }
        }
    });

    readonly String = this.createClass({
        name: 'String',
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            const value = stringValue(args.length === 0 ? '' : this.toString(context, args[0]));
    
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

                throw this.newTypeError(context, 'String.valueOf failed');
            },
            slice:(context, thisArg, args) => {
                if (thisArg.internalFields.hasOwnProperty('wrappedValue')) {
                    const wrappedValue: Value = thisArg.internalFields['wrappedValue'];
                    if (wrappedValue.type === 'string') {
                        const start = args.length >= 1 ? this.toNumber(context, args[0]) : undefined;
                        const end = args.length >= 2 ? this.toNumber(context, args[1]) : undefined;

                        return stringValue(wrappedValue.value.slice(start, end));
                    }
                }

                throw this.newTypeError(context, 'String.slice failed');
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

                    throw this.newTypeError(context, 'String.length failed');
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
    
                    throw this.newTypeError(context, 'String[index] failed');
                })
            } as ObjectPropertyDescriptor;
        }
    });

    readonly Number = this.createClass({
        name: 'Number',
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            const value = numberValue(args.length === 0 ? 0 : this.toNumber(context, args[0]));
    
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
    
                throw this.newTypeError(context, 'Number.valueOf failed');
            }
        },
        staticMethods: {
            isNaN: (context, thisArg, args) => {
                const number = this.toNumber(context, args[0]);
                
                return booleanValue(Number.isNaN(number));
            }
        }
    });

    readonly Boolean = this.createClass({
        name: 'Boolean',
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            const value = booleanValue(args.length === 0 ? false : this.toBoolean(args[0]));
    
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
            thisArg.internalFields['date'] = new (Date as any)(...args.slice(0, 7).map(arg => this.toNumber(context, arg)));
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
            thisArg.internalFields['regex'] = new RegExp(this.toString(context, args[0]), this.toString(context, args[1]));
            return undefinedValue;
        },
        methods: {
            test: (context, thisArg, args) => {
                return booleanValue(thisArg.internalFields['regex'].test(this.toString(context, args[0])));
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
            ['toString' as string]: (context, thisArg) => this.readProperty(context, thisArg, 'message')
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
            throw new NotImplementedError(context, 'Do not call TypedArray');
        },
        methods: {
            fill: (context, thisArg, args) => {
                if (thisArg.internalFields.hasOwnProperty('typedArray')) {
                    const wrappedValue = thisArg.internalFields['typedArray'];
                    return numberValue(wrappedValue.fill(this.toNumber(context, args[0])));
                }

                throw this.newTypeError(context, 'TypedArray[index] failed');
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
    
                    throw this.newTypeError(context, 'TypedArray[index] failed');
                })
            } as ObjectPropertyDescriptor;
        }
    });

    readonly Float64Array = this.createClass({
        name: 'Float64Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return this.typedArrayConstructor(context, Float64Array, thisArg, args, newTarget);
        }
    });

    readonly Float32Array = this.createClass({
        name: 'Float32Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return this.typedArrayConstructor(context, Float32Array, thisArg, args, newTarget);
        }
    });

    readonly Int32Array = this.createClass({
        name: 'Int32Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return this.typedArrayConstructor(context, Int32Array, thisArg, args, newTarget);
        }
    });

    readonly Int16Array = this.createClass({
        name: 'Int16Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return this.typedArrayConstructor(context, Int16Array, thisArg, args, newTarget);
        }
    });
    
    readonly Int8Array = this.createClass({
        name: 'Int8Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return this.typedArrayConstructor(context, Int8Array, thisArg, args, newTarget);
        }
    });

    readonly Uint32Array = this.createClass({
        name: 'Uint32Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return this.typedArrayConstructor(context, Uint32Array, thisArg, args, newTarget);
        }
    });

    readonly Uint16Array = this.createClass({
        name: 'Uint16Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return this.typedArrayConstructor(context, Uint16Array, thisArg, args, newTarget);
        }
    });
    
    readonly Uint8Array = this.createClass({
        name: 'Uint8Array',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return this.typedArrayConstructor(context, Uint8Array, thisArg, args, newTarget);
        }
    });
    
    readonly Uint8ClampedArray = this.createClass({
        name: 'Uint8ClampedArray',
        baseClass: this.TypedArray,
        ctorProto: this.TypedArray.constructor,
        ctor: (context: Context, thisArg: ObjectValue, args: Value[], newTarget: Value) => {
            return this.typedArrayConstructor(context, Uint8ClampedArray, thisArg, args, newTarget);
        }
    });

    readonly Reflect = this.newObject({
        methods: {
            construct: (context, thisArg, args) => {
                const constructorArgs = this.toArray(context, args[1] as ObjectValue);
                
                return this.constructObject(context, args[0], constructorArgs, args.length < 3 ? args[0] : args[2]);
            }
        }
    });

    readonly Math = this.newObject({
        methods: {
            pow: {
                isMethod: false,
                body: (context, thisArg, args) => {
                    const a = this.toNumber(context, args[0]);
                    const b = this.toNumber(context, args[1]);
                    
                    return numberValue(Math.pow(a, b));
                }
            }
        }
    });

    readonly log = this.functionValue((context, thisArg, values) => {
        console.log(...values.map(value => this.toString(context, value)));
        return undefinedValue;
    });

    readonly isNaN = this.functionValue((context, thisArg, args) => {
        const number = this.toNumber(context, args[0]);
        
        return booleanValue(Number.isNaN(number));
    });

    readonly eval = this.functionValue((context, thisArg, args) => {
        const code = args[0] as StringValue;

        const functionExpression = parseExpression(`function() { ${ code.value } }`);
        
        if (context === null || context.scope === null) {
           throw new NotImplementedError(context, 'cannot eval');
        }
        
        return this.executeFunction(context, context.scope.functionValue(functionExpression as FunctionExpression), thisArg, []);
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

    toArray(context: Context, arrayValue: ObjectValue): Value[] {
        const lengthProperty = this.readProperty(context, arrayValue, 'length');
        const length = this.toNumber(context, lengthProperty);

        const result: Value[] = [];

        for(let i = 0; i < length; i++) {
            result.push(this.readProperty(context, arrayValue, i.toString()));
        }

        return result;
    }

    assignProperty(context: Context, object: ObjectValue, propertyName: string, value: Value): void {
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
                        this.executeFunction(context, property.setter, object, [value]);
                    }
            }
        }
    }

    getOwnPropertyDescriptor(context: Context, object: ObjectValue, propertyName: string): ObjectPropertyDescriptor | null {
        if ('getOwnPropertyDescriptor' in object.internalFields) {
            const calculatedProperty = (object.internalFields as HasGetPropertyDescriptor).getOwnPropertyDescriptor(context, object, propertyName);

            if(calculatedProperty !== null) {
                return calculatedProperty;
            }
        }

        const property = object.ownProperties.get(propertyName);
        
        if (property !== undefined) {
            return property;
        }

        return null;
    }

    getPropertyDescriptor(context: Context, object: ObjectValue, propertyName: string): ObjectPropertyDescriptor | null {
        const property = this.getOwnPropertyDescriptor(context, object, propertyName);
        
        if (property !== null) {
            return property;
        }

        if (object.proto.type === 'null') {
            return null;
        }

        return this.getPropertyDescriptor(context, object.proto, propertyName);
    }

    readProperty(context: Context, object: ObjectValue, propertyName: string): Value {
        const property = this.getPropertyDescriptor(context, object, propertyName);
        
        if (property === null) {
            return undefinedValue;
        }

        return this.readPropertyDescriptorValue(context, object, property);
    }
    
    readPropertyDescriptorValue(context: Context, object: ObjectValue, property: ObjectPropertyDescriptor): Value {
        switch (property.descriptorType) {
            case 'value':
                return property.value;
            case 'accessor':
                if (property.getter.type === 'undefined') {
                    return undefinedValue;
                }

                return this.executeFunction(context, property.getter, object, []);
        }
    }

    newTypeError(context: Context, message: string): RuntimeError {
        return new RuntimeError(context, this.constructObject(context, this.TypeError.constructor, [
            stringValue(message)
        ]));
    }

    newReferenceError(context: Context, message: string): RuntimeError {
        return new RuntimeError(context, this.constructObject(context, this.ReferenceError.constructor, [
            stringValue(message)
        ]));
    }

    runGlobalCode(script: ParsedScript): void {
        this.globalScope.evaluateScript(script);
    }

    typedArrayConstructor(context: Context, constructor: new (items: Iterable<number>) => any, thisArg: ObjectValue, args: Value[], newTarget: Value): Value {
        thisArg.internalFields['typedArray'] = new constructor(this.toArray(context, args[0] as ObjectValue).map(value => this.toNumber(context, value)));
        return undefinedValue;
    }

    objectMethod(invoke: ObjectMethodInvoke, options?: FunctionOptions): ObjectValue {
        return this.functionValue(this.objectMethodFunction(invoke), options);
    }

    objectMethodFunction(invoke: ObjectMethodInvoke): GeneralFunctionInvoke {
        return (context, thisArg, argValues, newTarget) => {
            if (thisArg.type === 'null' || thisArg.type === 'undefined') {
                throw new NotImplementedError(context, 'cannot call object method with null or undefined');
            }

            const thisAsObject = this.toObject(context, thisArg);

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

    valueOf(context: Context, value: Value): Exclude<Value, ObjectValue> {
        if (value.type !== 'object') {
            return value;
        }
        
        const internalValue = this.executeMethod(context, value, 'valueOf', []);
        
        if (internalValue.type !== 'object') {
            return internalValue;
        }

        const stringResult = this.executeMethod(context, value, 'toString', []);
        
        if (stringResult.type === 'object') {
            throw this.newTypeError(context, 'Cannot convert object to primitive value');
        }

        return stringResult;
    }
    
    toString(context: Context, value: Value): string {
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
                const internalValue = this.valueOf(context, value);
                
                return this.toString(context, internalValue);
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

    toNumber(context: Context, value: Value): number {
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
                return this.toNumber(context, this.valueOf(context, value));
            case 'undefined':
                return NaN;
        }
    }

    toObject(context: Context, value: Exclude<Value, NullValue | UndefinedValue>): ObjectValue {
        switch(value.type) {
            case 'number':
                return this.constructObject(context, this.Number.constructor, [value]);
            case 'boolean':
                return this.constructObject(context, this.Boolean.constructor, [value]);
            case 'string':
                return this.constructObject(context, this.String.constructor, [value]);
            case 'object':
                return value;
        }
    }
    
    isFunction(value: Value): value is ObjectValue {
        return value.type === 'object' && this.isPrototypeOf(this.functionProto, value);
    }

    isInstanceOf(context: Context, left: Value, right: Value): boolean {
        if (!this.isFunction(right)) {
            throw new NotImplementedError(context, `Right-hand side of 'instanceof' is not a function`);
        }

        if (left.type !== 'object') {
            return false;
        }

        const proto = this.readProperty(context, right, 'prototype');

        return left.proto === proto;
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

    executeFunction(context: Context, callee: Value, thisArg: Value, args: Value[], newTarget: Value = undefinedValue): Value {
        if (!this.isFunction(callee)) {
            throw this.newReferenceError(context, 'cannot call non-function ' + callee.type);
        }
    
        const internalFields = callee.internalFields as FunctionInternalFields;

        if (newTarget !== undefinedValue && !internalFields.isConstructor) {
            throw this.newTypeError(context, 'function is not a constructor');
        }

        return internalFields.invoke(context, thisArg, args, newTarget);
    }

    executeMethod(context: Context, value: ObjectValue, methodName: string, args: Value[]): Value {
        const method = this.readProperty(context, value, methodName);

        return this.executeFunction(context, method, value, args);
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

    constructArray(context: Context, elements: Value[]): ObjectValue {
        return this.constructObject(context, this.Array.constructor, elements);
    }

    constructObject(context: Context, constructor: Value, args: Value[], newTargetConstructor: Value = constructor): ObjectValue {
        if (constructor.type !== 'object') {
            throw new NotImplementedError(context, 'new is unsupported for ' + constructor.type);
        }
    
        if (!this.isFunction(constructor)) {
            throw this.newTypeError(context, 'cannot use new for non-function');
        }

        if (newTargetConstructor.type !== 'object') {
            throw this.newTypeError(context, 'new is unsupported for target ' + newTargetConstructor.type);
        }
    
        if (!this.isFunction(newTargetConstructor)) {
            throw this.newTypeError(context, 'cannot use new for non-function target');
        }
    
        const internalFields = constructor.internalFields as FunctionInternalFields;

        if (!internalFields.isConstructor) {
            throw this.newTypeError(context, 'function is not a constructor');
        }

        const newTargetConstructorInternalFields = newTargetConstructor.internalFields as FunctionInternalFields;

        if (!newTargetConstructorInternalFields.isConstructor) {
            throw this.newTypeError(context, 'function is not a constructor');
        }
        
        const proto = this.readProperty(context, newTargetConstructor, 'prototype');

        if (proto.type !== 'object') {
            throw this.newTypeError(context, 'prototype cannot be ' + proto.type);
        }

        const thisArg = objectValue(proto);
        
        const result = this.executeFunction(context, constructor, thisArg, args, thisArg);
        
        if (result.type !== 'object' && result.type !== 'undefined') {
            throw new NotImplementedError(context, 'constructor result should be object or undefined ' + constructor.type);
        }

        return result.type === 'undefined' ? thisArg : result;
    }
}