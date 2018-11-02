import { parseExpression } from '@babel/parser';
import { FunctionExpression, Node } from '@babel/types';
import { booleanValue, nullValue, numberValue, objectValue, ParsedScript, stringValue, undefinedValue } from './factories';
import { getObjectField } from './globals';
import { NotImplementedError } from './notImplementedError';
import { RuntimeError } from './runtimeError';
import { Scope } from './scope';
import { FunctionInternalFields, GeneralFunctionInvoke, ObjectMethodInvoke, ObjectProperties, ObjectPropertyDescriptor, ObjectValue, StringValue, UndefinedValue, Value } from './types';

export class Engine {
    readonly rootPrototype = objectValue(nullValue);
    readonly functionPrototype = this.objectConstructor();

    readonly globals = {
        Object: this.functionValue(this.objectConstructor.bind(this), 'Object', this.rootPrototype),
        Function: this.functionValue(this.functionConstructor.bind(this), 'Function', this.functionPrototype),
        Array: this.functionValue(this.arrayConstructor.bind(this), 'Array'),
        String: this.functionValue(this.stringConstructor.bind(this), 'String'),
        TypeError: this.functionValue(this.typeErrorConstructor.bind(this), 'TypeError'),
        Number: this.functionValue(this.numberConstructor.bind(this), 'Number'),
        Boolean: this.functionValue(this.booleanConstructor.bind(this), 'Boolean'),
        Symbol: this.functionValue(this.symbolConstructor.bind(this), 'Symbol'),
        log: this.functionValue((thisArg, values, node, scope) => {
            console.log(...values.map(value => this.toString(value, node, scope)));
            return undefinedValue;
        })
    };

    readonly globalScope = new Scope(this, null, null, null, undefinedValue, new Map());

    constructor() {
        this.rootPrototype.ownProperties.set('toString', {
            value: this.functionValue(() => stringValue('[object Object]'))
        });
        
        this.rootPrototype.ownProperties.set('valueOf', {
            value: this.functionValue(thisArg => thisArg)
        });

        this.rootPrototype.ownProperties.set('constructor', {
            value: this.globals.Object
        });
        
        this.rootPrototype.ownProperties.set('hasOwnProperty', {
            value: this.objectMethod((thisArg, args, node, scope) => {
                return booleanValue(thisArg.ownProperties.has(this.toString(args[0], node, scope)));
            })
        });

        this.functionPrototype.ownProperties.set('call', {
            value: this.functionValue((thisArg, args, node, scope) => this.executeFunction(thisArg, args[0] as ObjectValue, args.slice(1), node, scope))
        });

        this.globals.Object.ownProperties.set('getOwnPropertyDescriptor', {
            value: this.functionValue((thisArg, args, node, scope) => {
                const obj = args[0];
                if (obj.type !== 'object') {
                    throw new RuntimeError(this.constructObject(this.globals.TypeError, [
                        stringValue('defineProperty should be called for object value')
                    ], node, scope), node, scope);
                }
    
                const descriptor = obj.ownProperties.get(this.toString(args[1], node, scope));
    
                if (descriptor === undefined) {
                    return undefinedValue;
                }

                const value = descriptor.value;

                const resultDescriptor = this.newObject(node, scope);

                resultDescriptor.ownProperties.set('value', {
                    value
                });

                return resultDescriptor;
            })
        });

        this.globals.Object.ownProperties.set('defineProperty', {
            value: this.functionValue((thisArg, args, node, scope) => {
                const object = args[0];
                if (object.type !== 'object') {
                    throw new RuntimeError(stringValue('defineProperty should be called for object value'), node, scope);
                }
    
                const descriptor = args[2];
                if (descriptor.type !== 'object') {
                    throw new NotImplementedError('defineProperty descriptor arg should be object value', node, scope);
                }
    
                const value = descriptor.ownProperties.get('value');

                object.ownProperties.set(this.toString(args[1], node, scope), {
                    value: value === undefined ? undefinedValue : value.value
                });
    
                return object;
            })
        });

        const arrayPrototype = this.globals.Array.prototype as ObjectValue;

        arrayPrototype.ownProperties.set('push', {
            value: this.objectMethod((thisArg, values, node, scope) => {
                const length = this.toNumber(getObjectField(thisArg, 'length'), node, scope);
                const newLength = numberValue(length + values.length);
                
                thisArg.ownProperties.set('length', {
                    value: newLength
                });

                values.forEach((value, index) => {
                    thisArg.ownProperties.set((length + index).toString(), {
                        value
                    });
                });

                return newLength;
            })
        });
        arrayPrototype.ownProperties.set('join', {
            value: this.objectMethod((thisArg, values, node, scope) => {
                const length = this.toNumber(getObjectField(thisArg, 'length'), node, scope);

                const separator = values.length === 0 ? ',' : this.toString(values[0], node, scope);

                const arr = new Array(length);
                for (let i = 0; i < length; i++) {
                    arr[i] = this.toString(getObjectField(thisArg, i.toString()), node, scope);
                }

                return stringValue(arr.join(separator));
            })
        });

        (this.globals.TypeError.prototype as ObjectValue).ownProperties.set('toString', {
            value: this.objectMethod((thisArg) => ((thisArg).ownProperties.get('message') as ObjectPropertyDescriptor).value)
        });
        
        Object.keys(this.globals)
            .forEach((name) => {
                this.globalScope.variables.set(name, (this.globals as any)[name]);
            });
    }

    runGlobalCode(script: ParsedScript): void {
        this.globalScope.evaluateScript(script);
    }

    objectConstructor(): ObjectValue {
        return objectValue(this.rootPrototype);
    }

    arrayConstructor(): UndefinedValue {
        return undefinedValue;
    }

    stringConstructor(thisArg: ObjectValue, args: Value[], node: Node, scope: Scope): Value {
        return stringValue(args.length === 0 ? '' : this.toString(args[0], node, scope));
    }

    typeErrorConstructor(thisArg: ObjectValue, args: Value[], node: Node, scope: Scope): Value {
        (thisArg).ownProperties.set('message', {
            value: args.length === 0 ? undefinedValue: args[0]
        });
        return undefinedValue;
    }

    numberConstructor(thisArg: ObjectValue, args: Value[], node: Node, scope: Scope): Value {
        return numberValue(args.length === 0 ? 0 : this.toNumber(args[0], node, scope));
    }

    booleanConstructor(thisArg: ObjectValue, args: Value[], node: Node, scope: Scope): Value {
        return booleanValue(args.length === 0 ? false : this.toBoolean(args[0]));
    }

    symbolConstructor(): UndefinedValue {
        return undefinedValue;
    }

    functionConstructor(thisArg: ObjectValue, values: Value[], node: Node, scope: Scope): Value {
        if (!values.every(x => x.type === 'string')) {
            throw new NotImplementedError('function constructor arguments must be strings', node, scope);
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
        return this.functionValue((thisArg, argValues, node, scope) => {
            if (thisArg.type !== 'object') {
                throw new NotImplementedError('calling object method with incorrect thisArg ' + thisArg.type, node, scope);
            }

            return invoke(thisArg, argValues, node, scope);
        }, name, prototype);
    }

    functionValue(invoke: GeneralFunctionInvoke, name: string | null = null, prototype: ObjectValue = this.objectConstructor()): ObjectValue {
        const internalFields: FunctionInternalFields = {
            invoke
        };

        const properties: ObjectProperties = new Map([
            ['prototype', {
                value: prototype
            }],
            ['name', {
                value: name === null ? undefinedValue : stringValue(name)
            }]
        ]);

        const result = objectValue(this.functionPrototype, properties, internalFields);

        prototype.ownProperties.set('constructor', {
            value: result
        });
        return result;
    }
    
    toString(value: Value, node: Node, scope: Scope): string {
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
                return this.toString(this.executeMethod(value, 'toString', [], node, scope), node, scope);
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

    toNumber(value: Value, node: Node, scope: Scope): number {
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
                return this.toNumber(this.executeMethod(value, 'valueOf', [], node, scope), node, scope);
            case 'undefined':
                return NaN;
        }
    }
    
    executeFunction(callee: Value, thisArg: Value, args: Value[], node: Node, scope: Scope): Value {
        if (callee.type !== 'object') {
            throw new NotImplementedError('call is unsupported for ' + callee.type, node, scope);
        }
    
        if (callee.prototype !== this.functionPrototype) {
            throw new NotImplementedError('cannot call non-function', node, scope);
        }
    
        return (callee.internalFields as FunctionInternalFields).invoke(thisArg, args, node, scope);
    }

    executeMethod(value: ObjectValue, methodName: string, args: Value[], node: Node, scope: Scope): Value {
        return this.executeFunction(getObjectField(value, methodName), value, args, node, scope);
    }

    newObject(node: Node, scope: Scope): ObjectValue {
        return this.constructObject(this.globals.Object, [], node, scope);
    }

    constructObject(constructor: Value, args: Value[], node: Node, scope: Scope): ObjectValue {
        if (constructor.type !== 'object') {
            throw new NotImplementedError('new is unsupported for ' + constructor.type, node, scope);
        }
    
        if (constructor.prototype !== this.functionPrototype) {
            throw new NotImplementedError('cannot use new for non-function', node, scope);
        }

        const prototype = getObjectField(constructor, 'prototype');
        
        if (prototype.type !== 'object') {
            throw new NotImplementedError('prototype cannot be ' + constructor.type, node, scope);
        }

        const thisArg = objectValue(prototype);
        
        const result = this.executeFunction(constructor, thisArg, args, node, scope);
        
        if (result.type !== 'object' && result.type !== 'undefined') {
            throw new NotImplementedError('constructor result should be object or undefined ' + constructor.type, node, scope);
        }

        return result.type === 'undefined' ? thisArg : result;
    }
}