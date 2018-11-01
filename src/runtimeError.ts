import { Node } from "@babel/types";
import { formatStack } from "./globals";
import { Scope } from "./scope";
import { Value } from "./types";

export class RuntimeError extends Error {
    constructor(
        public thrownValue: Value,
        node: Node,
        scope: Scope
    ) {
        super();
        this.message = `${tryGetThrownValue(scope, thrownValue, node)}${formatStack(node, scope)}`;
    }

    toString() {
        return this.message;
    }
}

function tryGetThrownValue(scope: Scope, thrownValue: Value, statement: Node): string | null {
    try {
        return scope.engine.toString(thrownValue, statement, scope);
    } catch {
        return null;
    }
}
