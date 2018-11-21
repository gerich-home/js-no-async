var typedArrayConstructors = [
  Float64Array,
  Float32Array,
  Int32Array,
  Int16Array,
  Int8Array,
  Uint32Array,
  Uint16Array,
  Uint8Array,
  Uint8ClampedArray
];

var floatArrayConstructors = typedArrayConstructors.slice(0, 2);
var intArrayConstructors = typedArrayConstructors.slice(2, 7);

var TypedArray = Object.getPrototypeOf(Int8Array);

var callCount = 0;
var bcv = {
  values: [
    127,
  ],
  expected: {
    Int8: [
      127,
    ],
    Uint8: [
      127,
    ],
    Uint8Clamped: [
      127,
    ],
    Int16: [
      127,
    ],
    Uint16: [
      127,
    ],
    Int32: [
      127,
    ],
    Uint32: [
      127,
    ],
    Float32: [
      127,
    ],
    Float64: [
      127,
    ]
  }
};

var values = bcv.values;
var expected = bcv.expected;

for (var i = 0; i < typedArrayConstructors.length; ++i) {
  var constructor = typedArrayConstructors[i];
  log(typeof constructor);
  log(constructor instanceof Function);
  log(constructor.name);
  log(typeof constructor.name);
    f(constructor);
}

function f(TA) {
  var name = TA.name.slice(0, -5);

  return values.forEach(function(value, index) {
    var exp = expected[name][index];
    var initial = 0;
    if (exp === 0) {
      initial = 1;
    }
    fn(TA, value, exp, initial);

    function fn(TA, value, expected, initial) {
      log(typeof TA);
      var sample = new TA([initial]);
      sample.fill(value);
      assert.sameValue(initial, 0);
      assert.sameValue(sample[0], expected);
      callCount++;
    }
  });
}
