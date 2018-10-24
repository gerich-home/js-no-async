import fs from 'fs';
import path from 'path';
import { Engine } from './engine';
import { RuntimeError } from './runtimeError';

const testCodePath = path.resolve(__dirname, '../testCode');

fs.readdirSync(testCodePath).forEach(file => {
    console.log(`Running code: ${file}`);

    const code = fs.readFileSync(path.resolve(__dirname, `../testCode/${file}`), 'UTF8');

    const engine = new Engine();

    try {
        engine.runCode(code);
    } catch(e) {
        if (e instanceof RuntimeError) {
            console.error('Runtime error', e.statement.loc && e.statement.loc.start.line + ':' + e.statement.loc.start.column);
        } else {
            throw e;
        }
    }

    console.log(`Finished code execution`);
});
