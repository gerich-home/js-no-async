import { Node } from "@babel/types";
import { formatMessage } from "./globals";
import { Scope } from "./scope";

export class NotImplementedError extends Error {
    constructor(
        message: string,
        astNode: Node,
        scope: Scope
    ) {
        super(`${message}${formatMessage(astNode, scope)}`);
    }

    toString() {
        return this.message;
    }
}
