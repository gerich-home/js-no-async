import { ArrowFunctionExpression, FunctionDeclaration, FunctionExpression, Node, ObjectMethod, Statement } from '@babel/types';
import { Scope } from './scope';

export type Value = NumberValue | StringValue | BooleanValue | NullValue | UndefinedValue | ObjectValue;

export type NumberValue = {
    readonly type: 'number';
    readonly value: number;
};

export type StringValue = {
    readonly type: 'string';
    readonly value: string;
};

export type BooleanValue = {
    readonly type: 'boolean';
    readonly value: boolean;
};

export type NullValue = {
    readonly type: 'null';
};

export type UndefinedValue = {
    readonly type: 'undefined';
};

export type ObjectValue = {
    readonly type: 'object';
    readonly ownProperties: ObjectProperties;
    readonly internalFields: InternalObjectFields;
    readonly proto: ObjectValue | NullValue;
};

export type ObjectPrototypeValue = ObjectValue | NullValue;

export type ObjectPropertyDescriptor = ValueObjectPropertyDescriptor | AccessorObjectPropertyDescriptor;

export type MandatoryObjectPropertyDescriptorFields = {
    configurable: boolean;
    enumerable: boolean;
};

export type ValueObjectPropertyDescriptor = MandatoryObjectPropertyDescriptorFields & {
    descriptorType: 'value';
    value: Value;
    writable: boolean;
};

export type AccessorObjectPropertyDescriptor = MandatoryObjectPropertyDescriptorFields & {
    descriptorType: 'accessor';
    getter: ObjectValue | UndefinedValue;
    setter: ObjectValue | UndefinedValue;
};

export type ObjectProperties = Map<string, ObjectPropertyDescriptor>;

export type InternalObjectFields = {
    [variableName: string]: any;
};

export type GeneralFunctionInvoke = (context: Context, thisArg: Value, argValues: Value[], newTarget: Value) => Value;
export type ObjectMethodInvoke = (context: Context, thisArg: ObjectValue, argValues: Value[], newTarget: Value) => Value;

export type FunctionInternalFields = {
    invoke: GeneralFunctionInvoke;
    isConstructor: boolean;
};

export type GetOwnPropertyDescriptorMethod = (context: Context, object: ObjectValue, propertyName: string) => ObjectPropertyDescriptor | null;

export type HasGetPropertyDescriptor = {
    getOwnPropertyDescriptor: GetOwnPropertyDescriptorMethod;
};

export type Block = {
    body: Statement[];
};

export type Context = null | {
    node: Node;
    scope: Scope;
};

export type FunctionNode = FunctionExpression | FunctionDeclaration | ObjectMethod | ArrowFunctionExpression;

export type FunctionContext = {
    node: FunctionNode;
    scope: Scope;
};

export type CallStackEntry = {
    caller: Context;
    callee: FunctionContext;
};

export type FunctionOptions = {
    name?: string | null;
    functionProto?: ObjectValue;
    proto?: ObjectValue;
    isConstructor?: boolean;
};

export type MethodDefinition = ObjectMethodInvoke |
    { isMethod: true; body: ObjectMethodInvoke; } |
    { isMethod: false; body: GeneralFunctionInvoke; };

export type ObjectDefinition = {
    methods?: {
        [key: string]: MethodDefinition;
    };
    properties?: {
        [key: string]: ObjectPropertyDescriptor;
    };
    fields?: {
        [key: string]: ObjectValue;
    };
    proto?: ObjectValue;
    getOwnPropertyDescriptor?: GetOwnPropertyDescriptorMethod;
};

export type ClassDefinition = ObjectDefinition & {
    name?: string;
    ctor?: ObjectMethodInvoke;
    ctorProto?: ObjectValue;
    baseClass?: Class;
    staticMethods?: {
        [key: string]: MethodDefinition;
    };
    staticProperties?: {
        [key: string]: ObjectPropertyDescriptor;
    };
};

export type Class = {
    constructor: ObjectValue;
    proto: ObjectValue;
};