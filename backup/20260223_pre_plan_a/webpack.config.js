const path = require('path');
const { merge: webpackMerge } = require('webpack-merge');
const baseConfig = require('@splunk/webpack-configs').default;
const CopyPlugin = require('copy-webpack-plugin');

const commonConfig = webpackMerge(baseConfig, {
  entry: {
    products: path.join(__dirname, 'src/main/webapp/pages/products/render.jsx'),
  },
  output: {
    path: path.join(__dirname, 'stage', 'appserver', 'static', 'pages'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: 'babel-loader',
      },

    ],
  },
  resolve: {
    extensions: ['.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src/main/webapp'),
    },
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: path.join(__dirname, 'src/main/resources/splunk'),
          to: path.join(__dirname, 'stage'),
          globOptions: {
            ignore: ['**/.DS_Store', '**/__pycache__/**', '**/*.pyc'],
          },
        },
      ],
    }),
  ],
});

module.exports = commonConfig;
