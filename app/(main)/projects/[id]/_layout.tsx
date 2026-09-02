import { screens } from '@lib/navigation/screens';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function ProjectLayout() {
  const { t } = useTranslation();

  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: 'white' } }}>
      <Stack.Screen
        name={screens.project.script.name}
        options={{ title: t(screens.project.script.titleKey), headerShown: false }}
      />
      <Stack.Screen
        name={screens.project.clips.name}
        options={{ title: t(screens.project.clips.titleKey), headerShown: false }}
      />
      <Stack.Screen
        name={screens.project.record.name}
        options={{
          title: t(screens.project.record.titleKey),
          headerShown: false,
          orientation: 'all',
        }}
      />
      <Stack.Screen
        name={screens.project.review.name}
        options={{ title: t(screens.project.review.titleKey), headerShown: false }}
      />
      <Stack.Screen
        name={screens.project.stitching.name}
        options={{ title: t(screens.project.stitching.titleKey), headerShown: false }}
      />
      <Stack.Screen
        name={screens.project.complete.name}
        options={{ title: t(screens.project.complete.titleKey), headerShown: false }}
      />
    </Stack>
  );
}
