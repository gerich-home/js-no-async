import { Context } from './context';
import { formatStack } from './globals';

export class NotImplementedError extends Error {
    constructor(
        context: Context,
        details: string
    ) {
        super();
        this.message = `${details}${formatStack(context)}`;
    }

    toString() {
        return this.message;
    }
}
