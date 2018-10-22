import { BooleanValue, InternalObjectFields, NullValue, NumberValue, ObjectFields, ObjectPrototypeValue, ObjectValue, StringValue, UndefinedValue } from "./types";

export function numberValue(value: number): NumberValue {
    return {
        type: 'number',
        value
    };
}

export function stringValue(value: string): StringValue {
    return {
        type: 'string',
        value
    };
}

export function booleanValue(value: boolean): BooleanValue {
    return {
        type: 'boolean',
        value
    };
}

export function objectValue<TObjectFields extends ObjectFields, TInternalObjectFields extends InternalObjectFields>(prototype: ObjectPrototypeValue, ownFields: TObjectFields = {} as TObjectFields, internalFields: TInternalObjectFields = {} as TInternalObjectFields): ObjectValue<TObjectFields> {
    return {
        type: 'object',
        ownFields,
        internalFields,
        prototype
    };
}

export const nullValue: NullValue = {
    type: 'null'
};

export const undefinedValue: UndefinedValue = {
    type: 'undefined'
};
