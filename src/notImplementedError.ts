import { Node } from "@babel/types";
import { formatStack } from "./globals";
import { Scope } from "./scope";

export class NotImplementedError extends Error {
    constructor(
        details: string,
        node: Node,
        scope: Scope
    ) {
        super();
        this.message = `${details}${formatStack(node, scope)}`;
    }

    toString() {
        return this.message;
    }
}
