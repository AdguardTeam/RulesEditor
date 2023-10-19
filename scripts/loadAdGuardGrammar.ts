import { load } from 'js-yaml';
import { promises as fs }  from 'fs';
import * as path  from 'path';
import { promisify }  from 'util';
import { exec as baseExec }  from 'child_process';
import type { addGrammar } from 'codemirror-textmate';
const exec = promisify(baseExec);

type Grammar = Parameters<typeof addGrammar>[1];

const TEMP_LIB_PATH = path.resolve(__dirname, '../lib');
const OUTPUT_FILE = path.resolve(__dirname, '../src/grammars/adblock.tmLanguage.json');
const INPUT_FILE = path.resolve(TEMP_LIB_PATH, './syntaxes/adblock.yaml-tmlanguage');
const REPO = 'https://github.com/AdguardTeam/VscodeAdblockSyntax.git';


/**
 * Function to verify that adguard.tmLanguage exclusively includes js sources.
 * @param textmate loaded adguard.tmLanguage Grammar
 * @returns true in case validation failed
 */
const validateIncludes = (textmate: Grammar) => {
    const string = JSON.stringify(textmate);
    const sourceRegExp = /"include":"source\.(\w{1,10})"/g;
    const extensions = new Set();
    [...string.matchAll(sourceRegExp)].forEach((match) => {
        extensions.add(match[1]);
    });
    if (!(extensions.size === 1 && extensions.has('js'))) {
        const ext = Array.from(extensions.values());
        console.error('Another source include found. Check that you have all needed grammars');
        console.error(`Following includes found: ${ext.map((e) => `source.${e}`).join(', ')}`)
        return true;
    }
};

/**
 * Function to download the adguard.tmLanguage file, validate its contents, and save it into the "src" directory.
 */
const main = async () => {
    console.log('Loading AdGuard tmLanguage');
    await exec(`git clone ${REPO} ${TEMP_LIB_PATH}  --depth 1`);
    try {
        console.log('Convert yaml into json');
        const data = load(await fs.readFile(INPUT_FILE, { encoding: 'utf-8' }));
        console.log('Validating AdGuard textmate for sources include')
        const hasErrors = validateIncludes(data as Grammar);

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(data, null, 4));
        await fs.rm(TEMP_LIB_PATH, { recursive: true, force: true });
        if (hasErrors) {
            process.exit(1);
        } else {
            console.log('Done');
        }
    } catch (e) {
        console.log(e);
        process.exit(1);
    }
}

main();
