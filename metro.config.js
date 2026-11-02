// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The Jitsi React Native SDK imports its icons as raw `.svg` ES modules, which
// requires react-native-svg-transformer to compile them into components.
// `lucide-react-native` uses react-native-svg components directly (no .svg files),
// so this does not affect the rest of the app.
// Use the Expo wrapper so SVGs pass through Expo's Babel transformer (the
// default React Native entry point expects a separate Metro transformer package).
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer/expo');
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];

module.exports = config;
