import { formatStack } from './globals';
import { Context, Value } from './types';

export class RuntimeError extends Error {
    constructor(
        context: Context,
        public thrownValue: Value
    ) {
        super();
        this.message = `${tryGetThrownValue(context, thrownValue)}${formatStack(context)}`;
    }

    toString() {
        return this.message;
    }
}

function tryGetThrownValue(context: Context, thrownValue: Value): string | null {
    if (context === null) {
        return null;
    }
    
    try {
        return context.scope.engine.toString(context, thrownValue);
    } catch {
        return null;
    }
}
