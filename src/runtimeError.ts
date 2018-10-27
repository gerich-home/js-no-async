import { ThrowStatement } from "@babel/types";
import { formatMessage } from "./globals";
import { Scope } from "./scope";
import { Value } from "./types";

export class RuntimeError extends Error {
    constructor(
        statement: ThrowStatement,
        public thrownValue: Value,
        scope: Scope
    ) {
        super(`${tryGetThrownValue(scope, thrownValue)}${formatMessage(statement, scope)}`);
        this.message = `${tryGetThrownValue(scope, thrownValue)}${formatMessage(statement, scope)}`;
    }

    toString() {
        return this.message;
    }
}

function tryGetThrownValue(scope: Scope, thrownValue: Value): string | null {
    try {
        return scope.engine.toString(thrownValue);
    } catch {
        return null;
    }
}
