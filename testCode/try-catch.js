try {
    log('start 1');
    throw 1;
    log('not exec 1');
} catch(e) {
    log('caught', e);
} finally {
    log('finally 1');
}
log('end 1');

try {
    log('start 2');
} catch(e) {
    log('not caught 2', e);
} finally {
    log('finally 2');
}

log('end 2');