const path = require('node:path');

const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = {
    mode: 'production',
    entry: {
        index: './src/index.ts',
    },
    output: {
        path: path.resolve(__dirname, './dist'),
        filename: '[name].js',
        clean: true,
        publicPath: '/',
        assetModuleFilename: '[name][ext]',
        library: {
            type: 'umd',
        },
    },
    resolve: {
        extensions: ['.ts', '.js'],
        fallback: {
            path: require.resolve('path-browserify'),
            util: require.resolve('util/'),
        },
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
            {
                test: /\.wasm$/,
                type: 'asset/resource',
            },
        ],
    },
    plugins: [
        new webpack.DefinePlugin({
            process: { env: {} },
        }),
        new CopyPlugin({
            patterns: [
                { from: 'node_modules/codemirror/lib/codemirror.css', to: './' },
            ],
        }),
    ],
};
