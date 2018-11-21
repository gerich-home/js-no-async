import { ArrowFunctionExpression, FunctionDeclaration, FunctionExpression, Node, ObjectMethod, Statement } from "@babel/types";
import { Scope } from "./scope";

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
    readonly prototype: ObjectValue | NullValue;
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

export type GeneralFunctionInvoke = (thisArg: Value, argValues: Value[], context: Context, newTarget: Value) => Value;
export type ObjectMethodInvoke = (thisArg: ObjectValue, argValues: Value[], context: Context, newTarget: Value) => Value;

export type FunctionInternalFields = {
    invoke: GeneralFunctionInvoke;
    isConstructor: boolean;
};

export type HasGetPropertyDescriptor = {
    getPropertyDescriptor(object: ObjectValue, propertyName: string, context: Context): ObjectPropertyDescriptor | null;
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

export type FunctionOptions = {
    name?: string | null;
    functionPrototype?: ObjectValue;
    prototype?: ObjectValue;
    isConstructor?: boolean;
};