module.exports = function (api) {
  api.cache(true);
  return {
    // nativewind/babel already includes react-native-worklets/plugin (required by Reanimated 4).
    // Do not add react-native-reanimated/plugin here — running it twice breaks runtime.
    presets: ['babel-preset-expo', 'nativewind/babel'],
  };
};
