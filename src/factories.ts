import { File } from "@babel/types";
import { BooleanValue, InternalObjectFields, NullValue, NumberValue, ObjectProperties, ObjectPrototypeValue, ObjectValue, StringValue, UndefinedValue, SuccessfulStatementResult, BreakStatementResult, ReturnStatementResult, Value, ThrowStatementResult, Context } from "./types";

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

export function objectValue(prototype: ObjectPrototypeValue, ownProperties: ObjectProperties = new Map(), internalFields: InternalObjectFields = {}): ObjectValue {
    return {
        type: 'object',
        ownProperties,
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

export const successResult: SuccessfulStatementResult = {
    type: 'success'
};

export const breakResult: BreakStatementResult = {
    type: 'break'
};

export function returnResult(returnedValue: Value): ReturnStatementResult {
    return {
        type: 'return',
        returnedValue
    };
};

export function throwResult(thrownValue: Value, context: Context): ThrowStatementResult {
    return {
        type: 'throw',
        thrownValue,
        context
    };
};
