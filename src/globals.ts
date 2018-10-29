import { Node } from "@babel/types";
import { undefinedValue, ParsedScript } from "./factories";
import { Scope } from "./scope";
import { ObjectValue, Value } from "./types";
import { parse } from "@babel/parser";

export function getObjectField(value: ObjectValue, fieldName: string): Value {
    if (Object.prototype.hasOwnProperty.call(value.ownProperties, fieldName)) {
        return value.ownProperties[fieldName];
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
    const script = scope.script;

    if (script == null || astNode.start === null || astNode.end === null) {
        return ` at ${location}`;
    }

    return ` at ${location} (${script.sourceCode.slice(astNode.start, astNode.end)})`;
}

export function parseScript(sourceCode: string): ParsedScript {
    return {
        file: parse(sourceCode),
        sourceCode
    };
}
