import { parse } from "@babel/parser";
import { Node } from "@babel/types";
import { ParsedScript, undefinedValue } from "./factories";
import { Scope } from "./scope";
import { ObjectValue, Value } from "./types";

export function getObjectField(value: ObjectValue, propertyName: string): Value {
    const property = value.ownProperties.get(propertyName);
    if (property !== undefined) {
        return property.value;
    }

    if (value.prototype.type === 'null') {
        return undefinedValue;
    }

    return getObjectField(value.prototype, propertyName);
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
