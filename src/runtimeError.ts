import { formatStack } from "./globals";
import { Context, Value } from "./types";

export class RuntimeError extends Error {
    constructor(
        public thrownValue: Value,
        context: Context
    ) {
        super();
        this.message = `${tryGetThrownValue(thrownValue, context)}${formatStack(context)}`;
    }

    toString() {
        return this.message;
    }
}

function tryGetThrownValue(thrownValue: Value, context: Context): string | null {
    if (context === null) {
        return null;
    }
    
    try {
        return context.scope.engine.toString(thrownValue, context);
    } catch {
        return null;
    }
}
