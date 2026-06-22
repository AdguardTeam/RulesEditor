/**
 * Performance benchmark comparing the two Oniguruma engines that drive
 * vscode-textmate tokenization:
 *
 * - the native-`RegExp` mock from `src/lib/onig-mock.ts` (built on
 *   `oniguruma-to-es`), which is what the library ships; and
 * - the reference WASM engine from `vscode-oniguruma`.
 *
 * Both engines tokenize the same fixture (a slice of the AdGuard Base filter)
 * through identical grammar registries, so the only variable is the Oniguruma
 * implementation. The benchmark exists to confirm that the native engine is at
 * least as fast as the WASM one. Run it with `pnpm run bench`.
 *
 * @see https://main.vitest.dev/guide/benchmarking.html
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import {
    Registry,
    parseRawGrammar,
    INITIAL,
    type IGrammar,
    type IOnigLib,
    type IRawGrammar,
} from 'vscode-textmate';
import {
    loadWASM,
    createOnigScanner as createWasmOnigScanner,
    createOnigString as createWasmOnigString,
} from 'vscode-oniguruma';

import { createOnigScanner, createOnigString } from '../src/lib/onig-mock';
import { SCOPE_ADBLOCK, SCOPE_JS } from '../src/lib/constants';
import adblockJson from '../src/grammars/adblock.tmLanguage.json';
import jsJson from '../src/grammars/js.tmLanguage.json';

const require = createRequire(import.meta.url);
const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Maps grammar scope names to their raw JSON definitions, mirroring the
 * production registry in `src/lib/registry.ts`.
 */
const scopeToRawJson: Record<string, unknown> = {
    [SCOPE_ADBLOCK]: adblockJson,
    [SCOPE_JS]: jsJson,
};

/**
 * Builds a vscode-textmate registry wired to the supplied Oniguruma engine,
 * using the same grammar-loading logic as the production registry.
 *
 * @param onigLib Resolves to the Oniguruma engine to drive scanning.
 * @returns A registry that loads the bundled grammars with `onigLib`.
 */
const createGrammarRegistry = (onigLib: Promise<IOnigLib>): Registry => new Registry({
    onigLib,
    loadGrammar: async (scopeName: string): Promise<IRawGrammar | null> => {
        const raw = scopeToRawJson[scopeName];
        if (!raw) {
            return null;
        }
        return parseRawGrammar(JSON.stringify(raw), `${scopeName}.json`);
    },
});

/**
 * Number of fixture rules to tokenize per benchmark iteration. The full Base
 * filter is ~160k lines; a slice keeps each iteration fast while remaining
 * representative of real rules.
 */
const RULE_LIMIT = 5000;

const fixturePath = path.resolve(dirname, 'fixtures', 'basefilter.txt');
const lines = readFileSync(fixturePath, 'utf8')
    .split('\n')
    // Drop blank lines
    .filter((line) => line.length > 0)
    .slice(0, RULE_LIMIT);

/**
 * Tokenizes every fixture line independently (from the initial state, matching
 * how the library tokenizes individual rules).
 *
 * @param grammar The loaded adblock grammar.
 * @returns Nothing.
 */
const tokenizeAll = (grammar: IGrammar): void => {
    for (let i = 0; i < lines.length; i += 1) {
        grammar.tokenizeLine(lines[i], INITIAL);
    }
};

/**
 * Loads the adblock grammar twice — once driven by the native-`RegExp` engine
 * and once by the WASM engine — so the only difference between the two
 * benchmarks is the Oniguruma implementation.
 *
 * @returns The two loaded grammars.
 */
const setupGrammars = async (): Promise<{ nativeGrammar: IGrammar; wasmGrammar: IGrammar }> => {
    // Build the native-RegExp grammar.
    const nativeRegistry = createGrammarRegistry(
        Promise.resolve({ createOnigScanner, createOnigString }),
    );
    const nativeGrammar = await nativeRegistry.loadGrammar(SCOPE_ADBLOCK);

    // Build the WASM grammar (one-time WASM initialization).
    const wasmBinary = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
    await loadWASM(wasmBinary);
    const wasmRegistry = createGrammarRegistry(
        Promise.resolve({
            createOnigScanner: createWasmOnigScanner,
            createOnigString: createWasmOnigString,
        }),
    );
    const wasmGrammar = await wasmRegistry.loadGrammar(SCOPE_ADBLOCK);

    if (!nativeGrammar || !wasmGrammar) {
        throw new Error('Failed to load the adblock grammar for benchmarking.');
    }

    return { nativeGrammar, wasmGrammar };
};

const NATIVE_LABEL = 'native RegExp (onig-mock / oniguruma-to-es)';
const WASM_LABEL = 'WASM (vscode-oniguruma)';

test(
    `tokenizing ${lines.length} Base filter rules: native RegExp vs WASM Oniguruma`,
    async ({ bench, annotate }) => {
        const { nativeGrammar, wasmGrammar } = await setupGrammars();

        // `bench.compare` prints a table (hz/mean/samples) and marks the fastest
        // entry, so the run reports the relative speed of the two engines. The
        // generous warmup lets the JIT optimize the native path for fair,
        // steady-state numbers.
        const result = await bench.compare(
            bench(NATIVE_LABEL, () => {
                tokenizeAll(nativeGrammar);
            }),
            bench(WASM_LABEL, () => {
                tokenizeAll(wasmGrammar);
            }),
            { warmupIterations: 10, iterations: 30, time: 0 },
        );

        // Surface the comparison as a test annotation; this never fails the run.
        const native = result.get(NATIVE_LABEL);
        const wasm = result.get(WASM_LABEL);
        const nativeMean = native.latency.mean;
        const wasmMean = wasm.latency.mean;
        const ratio = nativeMean / wasmMean;
        const faster = ratio <= 1;
        const pct = (Math.abs(ratio - 1) * 100).toFixed(1);
        await annotate(
            `native RegExp is ${pct}% ${faster ? 'faster' : 'slower'} than WASM `
            + `(native ${nativeMean.toFixed(3)}ms vs WASM ${wasmMean.toFixed(3)}ms per run).`,
        );
    },
);
