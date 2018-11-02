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

export type ObjectPropertyDescriptor = {
    value: Value;
};

export type ObjectProperties = Map<string, ObjectPropertyDescriptor>;

export type InternalObjectFields = {
    [variableName: string]: any;
};

export type Variables =  Map<string, Value>;

export type GeneralFunctionInvoke = (thisArg: Value, argValues: Value[], context: Context) => Value;
export type ObjectMethodInvoke = (thisArg: ObjectValue, argValues: Value[], context: Context) => Value;

export type FunctionInternalFields = {
    invoke: GeneralFunctionInvoke;
};

export type Block = {
    body: Statement[];
};

export type Context = {
    node: Node;
    scope: Scope;
};

export type FunctionNode = FunctionExpression | FunctionDeclaration | ObjectMethod | ArrowFunctionExpression;

export type FunctionContext = {
    node: FunctionNode;
    scope: Scope;
};
