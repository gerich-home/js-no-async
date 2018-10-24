import { undefinedValue } from "./factories";
import { ObjectValue, Value } from "./types";

export function getObjectField(value: ObjectValue, fieldName: string): Value {
    if (Object.prototype.hasOwnProperty.call(value.ownFields, fieldName)) {
        return value.ownFields[fieldName];
    }

    if (value.prototype.type === 'null') {
        return undefinedValue;
    }

    return getObjectField(value.prototype, fieldName);
}
