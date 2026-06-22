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
    // CodeMirror and Lezer MUST NOT be bundled: their `instanceof` checks
    // (e.g. for extension values and facets) break with duplicate copies, so
    // they stay as peer dependencies resolved to a single shared copy.
    // oniguruma-to-es is a regular dependency and IS bundled.
    externalsType: 'umd',
    externals: [
        /^@codemirror\/.+$/,
        /^@lezer\/.+$/,
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
