import { formatStack } from './globals';
import { Context } from './types';

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
