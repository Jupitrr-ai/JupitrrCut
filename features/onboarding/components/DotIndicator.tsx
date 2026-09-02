import { View } from 'react-native';

interface DotIndicatorProps {
  total: number;
  current: number;
}

export function DotIndicator({ total, current }: DotIndicatorProps) {
  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          className={`h-2 rounded-full ${i === current ? 'w-8 bg-primary' : 'w-2 bg-ink-disabled/50'}`}
        />
      ))}
    </View>
  );
}
