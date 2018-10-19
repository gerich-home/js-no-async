import { Scope } from './scope';
import { ObjectValue } from './types';
import { objectValue, nullValue } from './factories';

export class Engine {
    readonly rootPrototype: ObjectValue = {
        type: 'object',
        ownFields: {},
        internalFields: {},
        prototype: nullValue
    };

    readonly functionPrototype = objectValue(this.rootPrototype);

    readonly globalScope: Scope = new Scope(this);
}