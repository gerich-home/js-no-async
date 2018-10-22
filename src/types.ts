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

export type ObjectValue<TObjectFields extends ObjectFields = ObjectFields, TInternalObjectFields extends InternalObjectFields = InternalObjectFields> = {
    readonly type: 'object';
    readonly ownFields: TObjectFields;
    readonly internalFields: TInternalObjectFields;
    readonly prototype: ObjectValue | NullValue;
};

export type ObjectPrototypeValue = ObjectValue | NullValue;

export type ObjectFields = {
    [variableName: string]: Value;
};

export type InternalObjectFields = {
    [variableName: string]: any;
};

export type Variables = {
    [variableName: string]: Value;
};

export type FunctionInternalFields = {
    invoke(thisArg: Value, argValues: Value[]): Value;
};

export type Block = {
    body: Statement[];
};
