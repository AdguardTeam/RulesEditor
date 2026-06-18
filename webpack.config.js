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
    // CodeMirror and Lezer packages MUST NOT be bundled. The editor relies on
    // `instanceof` checks (e.g. for extension values and facets), which break
    // when two copies of `@codemirror/state` are loaded — one bundled here and
    // one from the consumer. Externalizing them forces the consumer's bundler
    // to resolve a single shared copy.
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
