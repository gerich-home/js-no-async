import { Context } from './context';
import { formatStack } from './globals';
import { Value } from './types';

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
        return context.toString(thrownValue);
    } catch {
        return null;
    }
}
