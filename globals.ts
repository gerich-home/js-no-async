import { Value, ObjectValue } from "./types";
import { undefinedValue } from "./factories";

export function getObjectField(value: ObjectValue, fieldName: string): Value {
    if (value.ownFields.hasOwnProperty(fieldName)) {
        return value.ownFields[fieldName];
    }

    if (value.prototype.type === 'null') {
        return undefinedValue;
    }

    return getObjectField(value.prototype, fieldName);
}
