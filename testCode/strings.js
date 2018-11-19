var a = "abcdefg";

log(a[0] + a[2] + a[5]);

function decimalToHexString(n) {
    log(n);
  var hex = "0123456789ABCDEF";
  n >>>= 0;
  log(n);
  var s = "";
  log('while 1')
  while (n) {
      log(n & 0xf)
      log(hex[n & 0xf])
    s = hex[n & 0xf] + s;
    log(s)
    n >>>= 4;
    log(n)
  }
  log('while 2')
  log(s.length)
  while (s.length < 4) {
    s = "0" + s;
    log(s)
  }
  log(s)
  return s;
}

function decimalToPercentHexString(n) {
  var hex = "0123456789ABCDEF";
  return "%" + hex[(n >> 4) & 0xf] + hex[n & 0xf];
}

decimalToHexString(100)

log('done')