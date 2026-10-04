/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testRegex: '/src/(components|store)/.*\\.test\\.[jt]sx$',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': [
      'babel-jest',
      { presets: [['babel-preset-expo', { jsxImportSource: 'react' }]] },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-reanimated|react-native-gesture-handler|react-native-worklets|react-native-draggable-flatlist))',
  ],
};
