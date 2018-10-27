import { parse } from '@babel/parser';
import fs from 'fs';
import glob from 'glob';
import yaml from 'js-yaml';
import { Engine } from './engine';

run();

function globAsync(pattern: string): Promise<string[]> {
    return new Promise(resolve => glob(pattern, (err, files) => resolve(files)));
}

function readFileAsync(filePath: string): Promise<string> {
    return new Promise(resolve => fs.readFile(filePath, 'UTF8', (err, contents) => resolve(contents)));
}

function extractYaml(text: string) {
    const start = text.indexOf('/*---');

    if (start === -1) {
        return {};
    }

    const end = text.indexOf('---*/');
    return yaml.load(text.substring(start + 5, end));
}

async function run() {
    const harnessFiles = await globAsync('test262/harness/*.js');

    const allHarnessCodeFiles = await Promise.all(harnessFiles.map(async harnessFileName => {
        const sourceCode = await readFileAsync(harnessFileName);
        
        return {
            harnessFileName,
            code: {
                sourceCode,
                file: parse(sourceCode)
            }
        };
    }));

    const allHarnessCode: any = allHarnessCodeFiles
        .reduce((o, harnessFile) => ({
            ...o,
            [harnessFile.harnessFileName.replace('test262/harness/', '')]: harnessFile.code
        }), {});

    const files = await globAsync('test262/test/harness/*.js');
    const counts = {
        passed: 0,
        failed: 0
    };

    for (const file of files) {
        console.log(`Running test: ${file.replace('test262/test/', '')}`);
        const code = await readFileAsync(file);

        const config = extractYaml(code);

        const engine = new Engine();

        try {
            engine.runGlobalCodeAst(allHarnessCode['assert.js']);
            engine.runGlobalCodeAst(allHarnessCode['sta.js']);
            (config.includes || [])
                .forEach((include: string) => {
                    engine.runGlobalCodeAst(allHarnessCode[include]);
                });
            engine.runGlobalCode(code);
        
            if (config.negative) {
                console.log('Unexpected positive result');
                console.log(`- FAILED`);
                counts.failed++;
            } else {
                console.log(`+ PASS`);
                counts.passed++;
            }
        } catch(e) {
            if (config.negative) {
                console.log(`+ PASS`);
                counts.passed++;
            } else {
                console.log('Engine error', e);
                console.log(`- FAILED`);
                counts.failed++;
            }
        }
    }

    console.log();
    console.log(`Test run complete: ${counts.passed}/${counts.passed + counts.failed} passed`);
}