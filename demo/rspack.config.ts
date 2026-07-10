import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@rspack/cli';
import { rspack } from '@rspack/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * Standalone dev-server config for the demo page. Unlike the library build
 * (`rspack.config.ts`), CodeMirror and Lezer are bundled here so the demo runs
 * as a self-contained app. The demo imports the editor straight from `src` so
 * local changes are reflected without a separate build step.
 */
export default defineConfig({
    mode: 'development',
    context: __dirname,
    entry: {
        main: './index.ts',
    },
    target: ['browserslist:last 2 versions, > 0.2%, not dead, Firefox ESR'],
    resolve: {
        extensions: ['...', '.ts'],
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                type: 'css/auto',
            },
            {
                test: /\.wasm$/,
                type: 'asset/resource',
            },
            {
                test: /\.ts$/,
                use: [{
                    loader: 'ts-loader',
                    options: {
                        configFile: path.resolve(__dirname, 'tsconfig.json'),
                    },
                }],
                exclude: /node_modules/,
            },
        ],
    },
    plugins: [
        new rspack.HtmlRspackPlugin({
            template: './index.html',
        }),
    ],
    devServer: {
        port: 8080,
    },
});
