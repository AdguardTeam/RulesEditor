import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';
import { rspack } from '@rspack/core';
import type { Configuration } from '@rspack/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const plugins: Configuration['plugins'] = [
    new rspack.DefinePlugin({
        process: { env: {} },
    }),
];

if (process.env.ANALYZE) {
    plugins.push(new RsdoctorRspackPlugin({
        output: {
            mode: 'brief',
            options: {
                type: ['html'],
                htmlOptions: {
                    reportHtmlName: 'rsdoctor-report.html',
                    writeDataJson: false,
                },
            },
        },
    }));
}

const config: Configuration = {
    mode: 'production',
    entry: {
        index: './src/index.ts',
    },
    output: {
        path: path.resolve(__dirname, './dist'),
        filename: '[name].js',
        clean: true,
        library: {
            type: 'module',
        },
    },
    // CodeMirror and Lezer MUST NOT be bundled: their `instanceof` checks
    // (e.g. for extension values and facets) break with duplicate copies, so
    // they stay as peer dependencies resolved to a single shared copy.
    externalsType: 'module',
    externals: [
        /^@codemirror\/.+$/,
        /^@lezer\/.+$/,
        /^vscode-oniguruma$/,
    ],
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [{
                    loader: 'ts-loader',
                    options: {
                        configFile: 'tsconfig.build.json',
                    },
                }],
                exclude: /node_modules/,
            },
        ],
    },
    plugins,
};

export default config;
