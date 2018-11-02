import { formatStack } from "./globals";
import { Context } from "./types";

export class NotImplementedError extends Error {
    constructor(
        details: string,
        context: Context
    ) {
        super();
        this.message = `${details}${formatStack(context)}`;
    }

    toString() {
        return this.message;
    }
}
