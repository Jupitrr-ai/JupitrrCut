import { screens } from '@lib/navigation/screens';
import { AppBackground } from '@shared/components/AppBackground';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function MainLayout() {
  const { t } = useTranslation();

  return (
    <AppBackground>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: 'transparent' },
          orientation: 'portrait',
        }}
      >
        <Stack.Screen
          name={screens.main.index.name}
          options={{ headerShown: false, headerBackTitle: '', animation: 'none' }}
        />
        <Stack.Screen
          name={screens.main.settings.name}
          options={{ title: t(screens.main.settings.titleKey), headerShown: false }}
        />
        <Stack.Screen
          name={screens.main.ideas.name}
          options={{ headerShown: false, animation: 'none' }}
        />
        <Stack.Screen name="projects/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="video-stitches" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen
          name={screens.main.videoStitchesStitching.name}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name={screens.main.videoStitchesComplete.name}
          options={{ headerShown: false }}
        />
      </Stack>
    </AppBackground>
  );
}
