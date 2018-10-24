import { ThrowStatement } from "@babel/types";
import { Value } from "./types";

export class RuntimeError extends Error {
    constructor(public statement: ThrowStatement, public thrownValue: Value) {
        super();
    }
}
