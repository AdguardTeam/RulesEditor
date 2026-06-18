const webpack = require('webpack');
const path = require('path');

module.exports = {
    mode: 'production',
    entry: {
        index: './src/index.ts',
    },
    output: {
        path: path.resolve(__dirname, './dist'),
        filename: '[name].js',
        clean: true,
        library: {
            type: 'umd'
        }
    },
    // CodeMirror, Lezer, and vscode-oniguruma MUST NOT be bundled.
    // CodeMirror/Lezer: `instanceof` checks (e.g. for extension values and
    // facets) break with duplicate copies.
    // vscode-oniguruma: a peer dependency — the consumer provides the WASM and
    // may already have loaded it. Externalizing forces the consumer's bundler
    // to resolve a single shared copy.
    externalsType: 'umd',
    externals: [
        /^@codemirror\/.+$/,
        /^@lezer\/.+$/,
        /^vscode-oniguruma$/,
    ],
    resolve: {
        extensions: ['.ts', '.js'],
        fallback: {
            'path': require.resolve('path-browserify'),
            'util': require.resolve('util/')
        }
    },
    module: {
        rules: [
            {
                test: /\.ts?$/,
                use: [{
                    loader: 'ts-loader',
                    options: {
                        configFile: 'tsconfig.build.json',
                    },
                }],
                exclude: /node_modules/,
            },
        ]
    },
    plugins: [
        new webpack.DefinePlugin({
            process: { env: {} },
        }),
    ],
};
