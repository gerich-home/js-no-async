// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
description: |
    Provides both:
    - An error class to avoid false positives when testing for thrown exceptions
    - A function to explicitly throw an exception using the Test262Error class
---*/

function Test262Error(message) {
  this.message = message || "";
}
  
Test262Error.prototype.toString = function () {
  return "Test262Error: " + this.message;
};
  
var $ERROR;
$ERROR = function $ERROR(message) {
  throw new Test262Error(message);
};

// https://github.com/tc39/test262/blob/master/harness/assert.js
// Copyright (C) 2017 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
description: |
    Collection of assertion functions used throughout test262
---*/

function assert(mustBeTrue, message) {
  if (mustBeTrue === true) {
    return;
  }

  if (message === undefined) {
    message = 'Expected true but got ' + String(mustBeTrue);
  }

  $ERROR(message);
}

assert._isSameValue = function (a, b) {
  if (a === b) {
    // Handle +/-0 vs. -/+0
    return a !== 0 || 1 / a === 1 / b;
  }

  // Handle NaN vs. NaN
  return a !== a && b !== b;
};

assert.sameValue = function (actual, expected, message) {
  if (assert._isSameValue(actual, expected)) {
    return;
  }

  if (message === undefined) {
    message = '';
  } else {
    message += ' ';
  }

  message += 'Expected SameValue(«' + String(actual) + '», «' + String(expected) + '») to be true';

  $ERROR(message);
};

assert.notSameValue = function (actual, unexpected, message) {
  if (!assert._isSameValue(actual, unexpected)) {
    return;
  }

  if (message === undefined) {
    message = '';
  } else {
    message += ' ';
  }

  message += 'Expected SameValue(«' + String(actual) + '», «' + String(unexpected) + '») to be false';

  $ERROR(message);
};

assert.throws = function (expectedErrorConstructor, func, message) {
  if (typeof func !== "function") {
    $ERROR('assert.throws requires two arguments: the error constructor ' +
      'and a function to run');
    return;
  }
  if (message === undefined) {
    message = '';
  } else {
    message += ' ';
  }

  try {
    func();
  } catch (thrown) {
    if (typeof thrown !== 'object' || thrown === null) {
      message += 'Thrown value was not an object!';
      $ERROR(message);
    } else if (thrown.constructor !== expectedErrorConstructor) {
      message += 'Expected a ' + expectedErrorConstructor.name + ' but got a ' + thrown.constructor.name;
      $ERROR(message);
    }
    return;
  }

  message += 'Expected a ' + expectedErrorConstructor.name + ' to be thrown but no exception was thrown at all';
  $ERROR(message);
};

/*---
info: |
    The Function prototype object does not have a valueOf property of its
    own. however, it inherits the valueOf property from the Object prototype
    Object
es5id: 15.3.4_A4
description: Checking valueOf property at Function.prototype
---*/

//CHECK#1
if (Function.prototype.hasOwnProperty("valueOf") !== false) {
  $ERROR('#1: The Function prototype object does not have a valueOf property of its own');
}

//CHECK#2
if (typeof Function.prototype.valueOf === "undefined") {
  $ERROR('#2: however, it inherits the valueOf property from the Object prototype Object');
}

//CHECK#3
if (Function.prototype.valueOf !== Object.prototype.valueOf) {
  $ERROR('#3: however, it inherits the valueOf property from the Object prototype Object');
}

/*---
info: |
    The initial value of Function.prototype.constructor is the built-in
    Function constructor
es5id: 15.3.4.1_A1_T1
description: Checking Function.prototype.constructor
---*/

//CHECK#1
if (Function.prototype.constructor !== Function) {
  $ERROR('#1: The initial value of Function.prototype.constructor is the built-in Function constructor');
}