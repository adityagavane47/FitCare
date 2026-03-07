const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const { transformer, resolver } = config;

config.transformer = {
    ...transformer,
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
};
config.resolver = {
    ...resolver,
    assetExts: [...resolver.assetExts, 'bin'],
    sourceExts: [...resolver.sourceExts, 'svg', 'js', 'jsx', 'json', 'ts', 'tsx'],
};

module.exports = config;
