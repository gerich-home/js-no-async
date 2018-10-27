import { Node } from "@babel/types";
import { undefinedValue } from "./factories";
import { Scope } from "./scope";
import { ObjectValue, Value } from "./types";

export function getObjectField(value: ObjectValue, fieldName: string): Value {
    if (Object.prototype.hasOwnProperty.call(value.ownFields, fieldName)) {
        return value.ownFields[fieldName];
    }

    if (value.prototype.type === 'null') {
        return undefinedValue;
    }

    return getObjectField(value.prototype, fieldName);
}

export function formatMessage(astNode: Node, scope: Scope): string {
    if (astNode.loc === null) {
        return '';
    }

    const start = astNode.loc.start;
    const location = `${start.line}:${start.column}`;
    const sourceCode = scope.sourceCode;

    if (sourceCode == null || astNode.start === null || astNode.end === null) {
        return ` at ${location}`;
    }

    return ` at ${location} (${sourceCode.slice(astNode.start, astNode.end)})`;
}