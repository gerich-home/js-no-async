import { Value } from "./types";
import { NotImplementedError } from "./notImplementedError";

export function toString(value: Value): string {
    switch(value.type) {
        case 'string':
            return value.value;
        case 'boolean':
            return value.value.toString();
        case 'number':
            return value.value.toString();
        case 'null':
            return 'null';
        case 'object':
            throw new NotImplementedError('object.toNumber is not supported');
        case 'undefined':
            return 'undefined';
    }
}

export function toNumber(value: Value): number {
    switch(value.type) {
        case 'string':
            return Number(value.value);
        case 'boolean':
            return Number(value.value);
        case 'number':
            return value.value;
        case 'null':
            return 0;
        case 'object':
            throw new NotImplementedError('object.toNumber is not supported');
        case 'undefined':
            return NaN;
    }
}
