import { parseExpression } from '@babel/parser';
import { FunctionExpression, Node } from '@babel/types';
import { booleanValue, nullValue, numberValue, objectValue, ParsedScript, stringValue, undefinedValue } from './factories';
import { getObjectField } from './globals';
import { NotImplementedError } from './notImplementedError';
import { Scope } from './scope';
import { FunctionInternalFields, ObjectProperties, ObjectValue, StringValue, UndefinedValue, Value } from './types';

export class Engine {
    readonly rootPrototype = objectValue(nullValue);
    readonly functionPrototype = this.objectConstructor();

    readonly globals = {
        Object: this.functionValue(this.objectConstructor.bind(this), this.rootPrototype),
        Function: this.functionValue(this.functionConstructor.bind(this), this.functionPrototype),
        Array: this.functionValue(this.arrayConstructor.bind(this)),
        String: this.functionValue(this.stringConstructor.bind(this)),
        Number: this.functionValue(this.numberConstructor.bind(this)),
        Boolean: this.functionValue(this.booleanConstructor.bind(this)),
        Symbol: this.functionValue(this.symbolConstructor.bind(this)),
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
            value: this.functionValue((thisArg, args, node, scope) => {
                if (thisArg.type === 'undefined') {
                    return booleanValue(false);
                } else {
                    return booleanValue((thisArg as ObjectValue).ownProperties.has(this.toString(args[0], node, scope)));
                }
            })
        });

        this.functionPrototype.ownProperties.set('call', {
            value: this.functionValue((thisArg, args, node, scope) => this.executeFunction(thisArg, args[0], args.slice(1), node, scope))
        });

        this.globals.Object.ownProperties.set('getOwnPropertyDescriptor', {
            value: this.functionValue((thisArg, args, node, scope) => {
                const obj = args[0];
                if (obj.type !== 'object') {
                    throw new NotImplementedError('defineProperty should be called for object value', node, scope);
                }
    
                const descriptor = obj.ownProperties.get(this.toString(args[1], node, scope));
    
                if (descriptor === undefined) {
                    return undefinedValue;
                }

                const value = descriptor.value;

                const resultDescriptor = this.objectConstructor();

                resultDescriptor.ownProperties.set('value', {
                    value
                });

                return resultDescriptor;
            })
        });

        this.globals.Object.ownProperties.set('defineProperty', {
            value: this.functionValue((thisArg, args, node, scope) => {
                const obj = args[0];
                if (obj.type !== 'object') {
                    throw new NotImplementedError('defineProperty should be called for object value', node, scope);
                }
    
                const descriptor = args[2];
                if (descriptor.type !== 'object') {
                    throw new NotImplementedError('defineProperty descriptor arg should be object value', node, scope);
                }
    
                const value = descriptor.ownProperties.get('value');

                obj.ownProperties.set(this.toString(args[1], node, scope), {
                    value: value === undefined ? undefinedValue : value.value
                });
    
                return undefinedValue;
            })
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

    stringConstructor(thisArg: Value, args: Value[], node: Node, scope: Scope): Value {
        return stringValue(args.length === 0 ? '' : this.toString(args[0], node, scope));
    }

    numberConstructor(thisArg: Value, args: Value[], node: Node, scope: Scope): Value {
        return numberValue(args.length === 0 ? 0 : this.toNumber(args[0]));
    }

    booleanConstructor(thisArg: Value, args: Value[], node: Node, scope: Scope): Value {
        return booleanValue(args.length === 0 ? false : this.toBoolean(args[0]));
    }

    symbolConstructor(): UndefinedValue {
        return undefinedValue;
    }

    functionConstructor(thisArg: Value, values: Value[], node: Node, scope: Scope): Value {
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

    functionValue(invoke: FunctionInternalFields['invoke'], prototype: ObjectValue = this.objectConstructor()): ObjectValue {
        const internalFields: FunctionInternalFields = {
            invoke
        };

        const properties: ObjectProperties = new Map([
            ['prototype', {
                value: prototype
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
                return this.toNumber(this.executeMethod(value, 'valueOf', [], null as any, null as any)); // TODO nulls
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
}