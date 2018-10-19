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
    readonly ownFields: ObjectFields;
    readonly internalFields: InternalObjectFields;
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
