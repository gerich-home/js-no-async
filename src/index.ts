import { Engine } from './engine';

const code = `
function num(a) {
    return {
        inc(b) { a = a + b; },
        get() { return a; }
    };
}

function cnt(a) {
    this.a = a;
}

cnt.prototype.inc = function(b) { this.a = this.a + b; };
cnt.prototype.get = function() { return this.a; };

var o = new Object();
Object.prototype.xxx = 99;
log(o.xxx);
log(log.xxx);
var n = new cnt(30);
var f = new Function('a', 'return "TEST" + a + "TEST";');
log('Function.prototype.constructor === Function:', Function.prototype.constructor === Function);
log('Object.prototype.constructor === Function:', Object.prototype.constructor === Function);
log('Object.prototype.constructor === Object:', Object.prototype.constructor === Object);
log(f('foo'));
log(f('bar'));

var n1 = num(10);
var n2 = num(20);
log(n1.get());
log(n2.get());
log(n.get());

const x = 10;
var y = 20;
let z = 30;

log(x, y, z);

{
    const x = 11;
    var y = 22;
    let z = 33;

    log(x, y, z);
}

log(10 !== 20, 10 === 20, !(10 === 20), !'test', !null, -12);

log(Object instanceof Function);
log(typeof 10, typeof 'aaa', typeof null);
log(x, y, z);

n1.inc(5);
n2.inc(33);

log(n1.get());
log(n2.get());
n.inc(7);
log(n.get());
`;

const engine = new Engine();

engine.runCode(code);
