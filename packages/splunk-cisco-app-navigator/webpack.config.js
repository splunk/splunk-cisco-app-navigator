const path = require('path');
const webpack = require('webpack');
const { merge: webpackMerge } = require('webpack-merge');
const baseConfig = require('@splunk/webpack-configs').default;
const CopyPlugin = require('copy-webpack-plugin');
const pkg = require('./package.json');

// Extract *installed* dependency versions for the Tech Stack dev-mode panel.
// We read each package's own package.json from node_modules so the modal shows
// the real resolved version (e.g. 18.3.1) instead of the semver range floor (18.0.0).
const depVersions = {};
const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
Object.entries(allDeps).forEach(([name, range]) => {
  try {
    const pkgPath = require.resolve(path.join(name, 'package.json'), { paths: [__dirname] });
    depVersions[name] = require(pkgPath).version;
  } catch {
    depVersions[name] = range.replace(/^[\^~]/, '');
  }
});

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
    new webpack.DefinePlugin({
      SCAN_DEPENDENCY_VERSIONS: JSON.stringify(depVersions),
    }),
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
