import '@testing-library/react-native/matchers';
import '@lib/i18n';

// Mock expo modules as needed
jest.mock('expo-status-bar', () => ({
  StatusBar: 'StatusBar',
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en' }],
}));
