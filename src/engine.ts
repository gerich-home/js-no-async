import { parse, parseExpression } from '@babel/parser';
import { Expression, File, FunctionExpression } from '@babel/types';
import { booleanValue, nullValue, objectValue, stringValue, undefinedValue } from './factories';
import { getObjectField } from './globals';
import { NotImplementedError } from './notImplementedError';
import { Scope } from './scope';
import { FunctionInternalFields, ObjectValue, StringValue, UndefinedValue, Value } from './types';

type ParsedScript = {
    file: File;
    sourceCode: string;
};

export class Engine {
    readonly rootPrototype = objectValue(nullValue);
    readonly functionPrototype = this.objectConstructor();

    readonly globals = {
        Object: this.functionValue(this.objectConstructor.bind(this), this.rootPrototype),
        Function: this.functionValue(this.functionConstructor.bind(this), this.functionPrototype),
        Array: this.functionValue(this.arrayConstructor.bind(this)),
        String: this.functionValue(this.stringConstructor.bind(this)),
        Symbol: this.functionValue(this.symbolConstructor.bind(this)),
        log: this.functionValue((thisArg, values) => {
            console.log(...values.map(value => this.toString(value)));
            return undefinedValue;
        })
    };

    readonly globalScope = new Scope(this, null, null, undefinedValue, {});

    constructor() {
        Object.keys(this.globals)
            .forEach((name) => {
                this.globalScope.variables[name] = (this.globals as any)[name];
            });
        
        this.rootPrototype.ownFields.toString = this.functionValue(() => stringValue('[object Object]')) as any;
        this.rootPrototype.ownFields.valueOf = this.functionValue(thisArg => thisArg) as any;
        this.rootPrototype.ownFields.constructor = this.globals.Object as any;
        this.rootPrototype.ownFields.hasOwnProperty = this.functionValue((thisArg, args) => booleanValue(Object.prototype.hasOwnProperty.call((thisArg as ObjectValue).ownFields, this.toString(args[0])))) as any;
        this.functionPrototype.ownFields.call = this.functionValue((thisArg, args) => this.executeFunction(thisArg, args[0], args.slice(1), null as any, null as any)); // TODO nulls
        this.globals.Object.ownFields.getOwnPropertyDescriptor = this.functionValue((thisArg, args) => undefinedValue);
        this.globals.Object.ownFields.defineProperty = this.functionValue((thisArg, args) => {
            const obj = args[0];
            if (obj.type !== 'object') {
                throw new NotImplementedError('defineProperty should be called for object value', null as any, null as any); // TODO nulls
            }

            const descriptor = args[2];
            if (descriptor.type !== 'object') {
                throw new NotImplementedError('defineProperty descriptor arg should be object value', null as any, null as any); // TODO nulls
            }

            obj.ownFields[this.toString(args[1])] = descriptor.ownFields.value;

            return undefinedValue;
        });
    }

    runGlobalCode(sourceCode: string): void {
        const file = parse(sourceCode);
        
        this.runGlobalCodeAst({
            file,
            sourceCode
        });
    }

    runGlobalCodeAst(script: ParsedScript): void {
        this.globalScope.evaluateProgram(script.file, script.sourceCode);
    }

    objectConstructor(): ObjectValue {
        return objectValue(this.rootPrototype);
    }

    arrayConstructor(): UndefinedValue {
        return undefinedValue;
    }

    stringConstructor(thisArg: Value, args: Value[]): Value {
        return stringValue(args.length === 0 ? '' : this.toString(args[0]));
    }

    symbolConstructor(): UndefinedValue {
        return undefinedValue;
    }

    functionConstructor(thisArg: Value, values: Value[]): Value {
        if (!values.every(x => x.type === 'string')) {
            throw new NotImplementedError('function constructor arguments must be strings', null as any, null as any); // TODO nulls
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

        const result = objectValue(this.functionPrototype, {
            prototype
        }, internalFields);

        ((result.ownFields.prototype as ObjectValue).ownFields.constructor as any) = result;
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
                return this.toString(this.executeMethod(value, 'toString', [], null as any, null as any)); // TODO nulls
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
    
    executeFunction(callee: Value, thisArg: Value, args: Value[], expression: Expression, scope: Scope): Value {
        if (callee.type !== 'object') {
            throw new NotImplementedError('call is unsupported for ' + callee.type, expression, scope);
        }
    
        if (callee.prototype !== this.functionPrototype) {
            throw new NotImplementedError('cannot call non-function', expression, scope);
        }
    
        return (callee.internalFields as FunctionInternalFields).invoke(thisArg, args);
    }

    executeMethod(value: ObjectValue, methodName: string, args: Value[], expression: Expression, scope: Scope): Value {
        return this.executeFunction(getObjectField(value, methodName), value, args, expression, scope);
    }
}