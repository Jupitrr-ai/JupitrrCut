import 'react-native-get-random-values';
import 'react-native-reanimated';
import '../global.css';
import '@lib/nativewind';
import '@lib/i18n';

// Import each font from its specific weight sub-path rather than the package
// index. Metro does not tree-shake, so importing from the package root evaluates
// its index.js, which `require()`s EVERY weight of the family and drags all of
// them into the asset graph (~34MB of unused .ttf files in the release APK).
// The per-weight sub-path only requires the single .ttf we actually use.
import { AtkinsonHyperlegible_400Regular } from '@expo-google-fonts/atkinson-hyperlegible/400Regular';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono/600SemiBold';
import { Lato_400Regular } from '@expo-google-fonts/lato/400Regular';
import { Lexend_400Regular } from '@expo-google-fonts/lexend/400Regular';
import { LibreBaskerville_400Regular_Italic } from '@expo-google-fonts/libre-baskerville/400Regular_Italic';
import { Merriweather_400Regular } from '@expo-google-fonts/merriweather/400Regular';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { OpenSans_400Regular } from '@expo-google-fonts/open-sans/400Regular';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Raleway_400Regular } from '@expo-google-fonts/raleway/400Regular';
import { VarelaRound_400Regular } from '@expo-google-fonts/varela-round/400Regular';
import { DatabaseProvider, useDatabase } from '@lib/providers/DatabaseProvider';
import { posthog } from '@lib/services/posthog';
import { configurePurchases } from '@lib/services/purchases';
import * as Sentry from '@sentry/react-native';
import { ShareIntentHandler } from '@shared/components/ShareIntentHandler';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import { PostHogProvider } from 'posthog-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Opt-in — only initializes if you set your own DSN. Guest/editor use works fine without it.
if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,

    // PII collection disabled by default — enable deliberately if you need it.
    sendDefaultPii: false,

    // Enable Logs
    enableLogs: true,

    // Configure Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

    // uncomment the line below to enable Spotlight (https://spotlightjs.com)
    // spotlight: __DEV__,
  });
}

function AppContent() {
  const { isReady } = useDatabase();

  if (!isReady) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { flex: 1 } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(main)" />
      {/* Full screen with the swipe-back gesture off: the offer's dismiss hold is the only
          way out, and a modal that can be flicked away is not a hold. */}
      <Stack.Screen
        name="paywall"
        options={{
          presentation: 'fullScreenModal',
          gestureEnabled: false,
          animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  );
}

export default Sentry.wrap(function RootLayout() {
  const [fontsLoaded] = useFonts({
    VarelaRound_400Regular,
    Nunito_400Regular,
    OpenSans_400Regular,
    Lato_400Regular,
    Raleway_400Regular,
    Inter_400Regular,
    Poppins_400Regular,
    Lexend_400Regular,
    AtkinsonHyperlegible_400Regular,
    Merriweather_400Regular,
    JetBrainsMono_400Regular,
    JetBrainsMono_600SemiBold,
    // Editorial accent for emphasised words — mirrors the italic serif on the landing page.
    LibreBaskerville_400Regular_Italic,
    // Brand UI faces (DESIGN.md) — one family name per weight file
    /* eslint-disable @typescript-eslint/no-require-imports -- static font assets */
    'CircularStd-Book': require('../assets/fonts/CircularStd-Book.otf'),
    'CircularStd-Medium': require('../assets/fonts/CircularStd-Medium.otf'),
    'CircularStd-Bold': require('../assets/fonts/CircularStd-Bold.otf'),
    'CircularStd-Black': require('../assets/fonts/CircularStd-Black.otf'),
    /* eslint-enable @typescript-eslint/no-require-imports */
  });

  useEffect(() => {
    // Configure RevenueCat after the React Native bridge is ready.
    // Must be in useEffect so native modules are available on Android.
    configurePurchases();
  }, []);

  if (!fontsLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <PostHogProvider
      client={posthog}
      autocapture={{
        captureScreens: true,
        captureTouches: false,
      }}
    >
      <ShareIntentProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <StatusBar style="auto" />
            <DatabaseProvider>
              <ShareIntentHandler />
              <AppContent />
            </DatabaseProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ShareIntentProvider>
    </PostHogProvider>
  );
});
