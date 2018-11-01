import { parse } from "@babel/parser";
import { Identifier, Node, SourceLocation } from "@babel/types";
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

export function formatStack(node: Node, scope: Scope): string {
    if (scope === null || scope.callStackEntry === null) {
        return formatStackLine(node, scope);
    }

    const caller = scope.callStackEntry.caller;
    
    return formatStackLine(node, scope) + formatStack(caller.node, caller.scope);
}

function formatStackLine(node: Node, scope: Scope): string {
    if (node.loc === null) {
        return '';
    }

    return `\n    at ${formatNodeLocation(scope, node, node.loc)}`;
}

function formatNodeLocation(scope: Scope, node: Node, loc: SourceLocation) {
    const location = formatNodeScriptLocation(scope, node, loc);

    const functionName = getCalledFunctionName(scope);
    
    return functionName === null ? location : `${functionName} (${location})`;
}

function formatNodeScriptLocation(scope: Scope, node: Node, loc: SourceLocation) {
    const start = loc.start;
    const lineCol = `${start.line}:${start.column}`;

    if (scope.script === null || node.start === null || node.end === null) {
        return lineCol;
    }
    
    return `${scope.script.path}:${lineCol}`;
}

function getCalledFunctionName(scope: Scope): string | null {
    const callStackEntry = scope.callStackEntry;

    if (callStackEntry === null) {
        return null;
    }

    const functionNode = callStackEntry.callee.node;
    switch(functionNode.type) {
        case 'FunctionDeclaration':
        case 'FunctionExpression':
            if (functionNode.id === null) {
                return null;
            }
            
            return functionNode.id.name;
        case 'ObjectMethod':
            return (functionNode.key as Identifier).name;
        case 'ArrowFunctionExpression':
            return null;
        default:
            return null;
    }
}

export function parseScript(sourceCode: string, path: string): ParsedScript {
    return {
        file: parse(sourceCode),
        sourceCode,
        path
    };
}
