import { ActivityIndicator, Pressable, Text } from 'react-native';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** White pill on dark backgrounds (hero / demo) */
  variant?: 'primary' | 'light' | 'disabled';
}

export function OnboardingCTA({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
}: Props) {
  const isDisabled = disabled || loading;

  const containerClass =
    variant === 'light'
      ? isDisabled
        ? 'bg-white/30'
        : 'bg-white'
      : variant === 'disabled' || isDisabled
        ? 'bg-gray-200'
        : 'bg-primary';

  const textClass =
    variant === 'light'
      ? isDisabled
        ? 'text-white/60'
        : 'text-ink'
      : isDisabled
        ? 'text-gray-400'
        : 'text-white';

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      className={`items-center rounded-2xl py-4 active:scale-[0.97] ${containerClass}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'light' ? '#0B0B0F' : '#ffffff'} />
      ) : (
        <Text className={`text-base font-semibold ${textClass}`}>{label}</Text>
      )}
    </Pressable>
  );
}
