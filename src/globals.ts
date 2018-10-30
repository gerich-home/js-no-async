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

export function formatMessage(node: Node, scope: Scope): string {
    return '\n> ' + formatNode(node, scope.script) + '\n' + formatStack(scope);
}

function formatStack(scope: Scope | null): string {
    if (scope === null) {
        return '> [[GLOBAL]]';
    }

    const definingFunction = scope.definingFunction;
    if (definingFunction === null) {
        return formatStack(scope.parent);
    }

    return '> ' + formatNode(definingFunction.caller.node, definingFunction.caller.scope.script) + '\n' + formatStack(definingFunction.caller.scope);
}

function formatNode(node: Node, script: ParsedScript | null): string {
    if (node.loc === null) {
        return '';
    }

    const start = node.loc.start;
    const location = `${start.line}:${start.column}`;
    
    if (script === null || node.start === null || node.end === null) {
        return `at ${location}`;
    }

    return `at ${script.path}:${location} ${script.sourceCode.slice(node.start, node.end)}`;
}

export function parseScript(sourceCode: string, path: string): ParsedScript {
    return {
        file: parse(sourceCode),
        sourceCode,
        path
    };
}
