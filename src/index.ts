import fs from 'fs';
import glob from 'glob';
import yaml from 'js-yaml';
import { Engine } from './engine';
import { parseScript } from './globals';

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
            script: parseScript(sourceCode, harnessFileName)
        };
    }));

    const allHarnessCode: any = allHarnessCodeFiles
        .reduce((o, harnessFile) => ({
            ...o,
            [harnessFile.harnessFileName.replace('test262/harness/', '')]: harnessFile.script
        }), {});

    const files = await globAsync(process.env.TESTS_GLOB as string);
    const counts = {
        passed: 0,
        failed: 0
    };

    for (const file of files) {
        const code = await readFileAsync(file);

        const config = extractYaml(code);

        const engine = new Engine();

        try {
            // console.log(`RUN:      ${file}`);
            engine.runGlobalCode(allHarnessCode['assert.js']);
            engine.runGlobalCode(allHarnessCode['sta.js']);
            (config.includes || [])
                .forEach((include: string) => {
                    engine.runGlobalCode(allHarnessCode[include]);
                });
            engine.runGlobalCode(parseScript(code, file));
        
            if (config.negative) {
                console.log(`- FAILED: ${file}`);
                console.log('Unexpected positive result');
                counts.failed++;
            } else {
                console.log(`+ PASS:   ${file}`);
                counts.passed++;
            }
        } catch(e) {
            if (config.negative) {
                console.log(`+ PASS:   ${file}`);
                counts.passed++;
            } else {
                console.log(`- FAILED: ${file}`);
                console.log('Engine error', e.message);
                counts.failed++;
            }
        }
    }

    console.log();
    console.log(`Test run complete: ${counts.passed}/${counts.passed + counts.failed} passed`);
}