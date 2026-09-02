import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
        orientation: 'portrait',
        contentStyle: { flex: 1 },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
