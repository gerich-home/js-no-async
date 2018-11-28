import { Node } from '@babel/types';
import { Engine } from './engine';
import { objectValue, stringValue, undefinedValue } from './factories';
import { NotImplementedError } from './notImplementedError';
import { RuntimeError } from './runtimeError';
import { Scope } from './scope';
import { FunctionInternalFields, HasGetPropertyDescriptor, NullValue, ObjectPropertyDescriptor, ObjectValue, UndefinedValue, Value } from './types';

export class Context {
    private readonly engine: Engine;

    constructor(
        public node: Node,
        public scope: Scope
        ) {
        this.engine = scope.engine;
    }

    toArray(arrayValue: ObjectValue): Value[] {
        const lengthProperty = this.readProperty(arrayValue, 'length');
        const length = this.toNumber(lengthProperty);

        const result: Value[] = [];

        for(let i = 0; i < length; i++) {
            result.push(this.readProperty(arrayValue, i.toString()));
        }

        return result;
    }

    assignProperty(object: ObjectValue, propertyName: string, value: Value): void {
        const property = object.ownProperties.get(propertyName);

        if (property === undefined) {
            this.engine.defineProperty(object, propertyName, value);
        } else {
            switch (property.descriptorType) {
                case 'value':
                    if (property.writable) {
                        property.value = value;
                    }

                    break;
                case 'accessor':
                    if (property.setter.type !== 'undefined') {
                        this.executeFunction(property.setter, object, [value]);
                    }
            }
        }
    }

    getOwnPropertyDescriptor(object: ObjectValue, propertyName: string): ObjectPropertyDescriptor | null {
        if ('getOwnPropertyDescriptor' in object.internalFields) {
            const calculatedProperty = (object.internalFields as HasGetPropertyDescriptor).getOwnPropertyDescriptor(this, object, propertyName);

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

    getPropertyDescriptor(object: ObjectValue, propertyName: string): ObjectPropertyDescriptor | null {
        const property = this.getOwnPropertyDescriptor(object, propertyName);
        
        if (property !== null) {
            return property;
        }

        if (object.proto.type === 'null') {
            return null;
        }

        return this.getPropertyDescriptor(object.proto, propertyName);
    }

    readProperty(object: ObjectValue, propertyName: string): Value {
        const property = this.getPropertyDescriptor(object, propertyName);
        
        if (property === null) {
            return undefinedValue;
        }

        return this.readPropertyDescriptorValue(object, property);
    }
    
    readPropertyDescriptorValue(object: ObjectValue, property: ObjectPropertyDescriptor): Value {
        switch (property.descriptorType) {
            case 'value':
                return property.value;
            case 'accessor':
                if (property.getter.type === 'undefined') {
                    return undefinedValue;
                }

                return this.executeFunction(property.getter, object, []);
        }
    }

    newNotImplementedError(message: string): NotImplementedError {
        return new NotImplementedError(this, message);
    }

    newRuntimeError(thrownValue: Value): RuntimeError {
        return new RuntimeError(this, thrownValue);
    }

    newTypeError(message: string): RuntimeError {
        return this.newRuntimeError(this.constructObject(this.engine.TypeError.constructor, [
            stringValue(message)
        ]));
    }

    newReferenceError(message: string): RuntimeError {
        return this.newRuntimeError(this.constructObject(this.engine.ReferenceError.constructor, [
            stringValue(message)
        ]));
    }

    typedArrayConstructor(constructor: new (items: Iterable<number>) => any, thisArg: ObjectValue, args: Value[], newTarget: Value): Value {
        thisArg.internalFields['typedArray'] = new constructor(this.toArray(args[0] as ObjectValue).map(value => this.toNumber(value)));
        return undefinedValue;
    }

    valueOf(value: Value): Exclude<Value, ObjectValue> {
        if (value.type !== 'object') {
            return value;
        }
        
        const internalValue = this.executeMethod(value, 'valueOf', []);
        
        if (internalValue.type !== 'object') {
            return internalValue;
        }

        const stringResult = this.executeMethod(value, 'toString', []);
        
        if (stringResult.type === 'object') {
            throw this.newTypeError('Cannot convert object to primitive value');
        }

        return stringResult;
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
                return this.toNumber(this.valueOf(value));
            case 'undefined':
                return NaN;
        }
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
                const internalValue = this.valueOf(value);
                
                return this.toString(internalValue);
            case 'undefined':
                return 'undefined';
        }
    }

    toObject(value: Exclude<Value, NullValue | UndefinedValue>): ObjectValue {
        switch(value.type) {
            case 'number':
                return this.constructObject(this.engine.Number.constructor, [value]);
            case 'boolean':
                return this.constructObject(this.engine.Boolean.constructor, [value]);
            case 'string':
                return this.constructObject(this.engine.String.constructor, [value]);
            case 'object':
                return value;
        }
    }

    isInstanceOf(left: Value, right: Value): boolean {
        if (!this.engine.isFunction(right)) {
            throw this.newNotImplementedError(`Right-hand side of 'instanceof' is not a function`);
        }

        if (left.type !== 'object') {
            return false;
        }

        const proto = this.readProperty(right, 'prototype');

        return left.proto === proto;
    }

    isIn(left: Value, right: Value): boolean {
        if (left.type !== 'string') {
            throw this.newNotImplementedError('unsupported left operand of in operator ' + left.type);
        }

        if (right.type !== 'object') {
            throw this.newNotImplementedError('unsupported right operand of in operator ' + right.type);
        }

        return this.getPropertyDescriptor(right, left.value) !== null;
    }

    executeFunction(callee: Value, thisArg: Value, args: Value[], newTarget: Value = undefinedValue): Value {
        if (!this.engine.isFunction(callee)) {
            throw this.newReferenceError('cannot call non-function ' + callee.type);
        }
    
        const internalFields = callee.internalFields as FunctionInternalFields;

        if (newTarget !== undefinedValue && !internalFields.isConstructor) {
            throw this.newTypeError('function is not a constructor');
        }

        return internalFields.invoke(this, thisArg, args, newTarget);
    }

    executeMethod(value: ObjectValue, methodName: string, args: Value[]): Value {
        const method = this.readProperty(value, methodName);

        return this.executeFunction(method, value, args);
    }

    constructArray(elements: Value[]): ObjectValue {
        return this.constructObject(this.engine.Array.constructor, elements);
    }

    constructObject(constructor: Value, args: Value[], newTargetConstructor: Value = constructor): ObjectValue {
        if (constructor.type !== 'object') {
            throw this.newNotImplementedError('new is unsupported for ' + constructor.type);
        }
    
        if (!this.engine.isFunction(constructor)) {
            throw this.newTypeError('cannot use new for non-function');
        }

        if (newTargetConstructor.type !== 'object') {
            throw this.newTypeError('new is unsupported for target ' + newTargetConstructor.type);
        }
    
        if (!this.engine.isFunction(newTargetConstructor)) {
            throw this.newTypeError('cannot use new for non-function target');
        }
    
        const internalFields = constructor.internalFields as FunctionInternalFields;

        if (!internalFields.isConstructor) {
            throw this.newTypeError('function is not a constructor');
        }

        const newTargetConstructorInternalFields = newTargetConstructor.internalFields as FunctionInternalFields;

        if (!newTargetConstructorInternalFields.isConstructor) {
            throw this.newTypeError('function is not a constructor');
        }
        
        const proto = this.readProperty(newTargetConstructor, 'prototype');

        if (proto.type !== 'object') {
            throw this.newTypeError('prototype cannot be ' + proto.type);
        }

        const thisArg = objectValue(proto);
        
        const result = this.executeFunction(constructor, thisArg, args, thisArg);
        
        if (result.type !== 'object' && result.type !== 'undefined') {
            throw this.newNotImplementedError('constructor result should be object or undefined ' + constructor.type);
        }

        return result.type === 'undefined' ? thisArg : result;
    }
}
