import { Statement } from "@babel/types";

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

export type ObjectPropertyDescriptor = {
    value: Value;
};

export type ObjectProperties = Map<string, ObjectPropertyDescriptor>;

export type InternalObjectFields = {
    [variableName: string]: any;
};

export type Variables =  Map<string, Value>;

export type FunctionInternalFields = {
    invoke(thisArg: Value, argValues: Value[]): Value;
};

export type Block = {
    body: Statement[];
};
