import { Stack } from 'expo-router';

export default function VideoStitchesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="index"
        options={{ animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
      />
      <Stack.Screen
        name="[id]"
        options={{ animation: 'slide_from_right', contentStyle: { backgroundColor: 'white' } }}
      />
    </Stack>
  );
}
