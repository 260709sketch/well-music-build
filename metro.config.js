const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Expo Router 配置
config.transformer = {
  ...config.transformer,
  routerRoot: path.resolve(__dirname, 'src/app'),
};

config.resolver = {
  ...config.resolver,
  sourceExts: [...config.resolver.sourceExts, 'mjs'],
};

module.exports = config;
