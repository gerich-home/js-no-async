import { ThrowStatement } from "@babel/types";
import { formatStack } from "./globals";
import { Scope } from "./scope";
import { Value } from "./types";

export class RuntimeError extends Error {
    constructor(
        statement: ThrowStatement,
        public thrownValue: Value,
        scope: Scope
    ) {
        super();
        this.message = `${tryGetThrownValue(scope, thrownValue, statement)}${formatStack(statement, scope)}`;
    }

    toString() {
        return this.message;
    }
}

function tryGetThrownValue(scope: Scope, thrownValue: Value, statement: ThrowStatement): string | null {
    try {
        return scope.engine.toString(thrownValue, statement, scope);
    } catch {
        return null;
    }
}
