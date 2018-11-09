import { File } from "@babel/types";
import { BooleanValue, InternalObjectFields, NullValue, NumberValue, ObjectProperties, ObjectPrototypeValue, ObjectValue, StringValue, UndefinedValue } from "./types";

export type ParsedScript = {
    file: File;
    sourceCode: string;
    path: string;
};

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

export function objectValue(prototype: ObjectPrototypeValue, internalFields: InternalObjectFields = {}): ObjectValue {
    return {
        type: 'object',
        ownProperties: new Map(),
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
