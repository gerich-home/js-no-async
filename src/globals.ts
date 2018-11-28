import { parse } from '@babel/parser';
import { Identifier, Node, SourceLocation } from '@babel/types';
import { Context } from './context';
import { ParsedScript } from './factories';

export function formatStack(context: Context): string {
    if (context === null) {
        return '';
    }

    if (context.scope.callStackEntry === null) {
        return formatStackLine(context);
    }

    const caller = context.scope.callStackEntry.caller;
    
    return formatStackLine(context) + formatStack(caller);
}

function formatStackLine(context: NonNullable<Context>): string {
    if (context.node.loc === null) {
        return '';
    }

    return `\n    at ${formatNodeLocation(context, context.node.loc)}`;
}

function formatNodeLocation(context: NonNullable<Context>, loc: SourceLocation) {
    const location = formatNodeScriptLocation(context, loc);

    const functionName = getCalledFunctionName(context);
    
    return functionName === null ? location : `${functionName} (${location})`;
}

function formatNodeScriptLocation(context: NonNullable<Context>, loc: SourceLocation) {
    const start = loc.start;
    const lineCol = `${start.line}:${start.column}`;

    if (context.scope.script === null || context.node.start === null || context.node.end === null) {
        return lineCol;
    }
    
    return `${context.scope.script.path}:${lineCol}`;
}

function getCalledFunctionName(context: NonNullable<Context>): string | null {
    const callStackEntry = context.scope.callStackEntry;

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

export function isFunctionNode(node: Node): boolean {
    const type = node.type;

    return type === 'FunctionDeclaration' ||
        type === 'FunctionExpression' ||
        type === 'ObjectMethod' ||
        type === 'ArrowFunctionExpression';
}
