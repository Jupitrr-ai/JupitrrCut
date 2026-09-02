import type { IconName } from '@shared/components/ui/Icon';
import { Icon } from '@shared/components/ui/Icon';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { PressableProps } from 'react-native';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'md' | 'lg';

const CONTAINER_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary active:bg-primary-pressed',
  secondary: 'bg-primary-tint active:bg-[#E0E7FF]',
  ghost: 'bg-transparent active:bg-surface-subtle',
  destructive: 'bg-danger active:bg-[#B91C1C]',
};

const LABEL_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-primary',
  ghost: 'text-primary',
  destructive: 'text-white',
};

const LABEL_COLORS: Record<ButtonVariant, string> = {
  primary: '#FFFFFF',
  secondary: '#3C3FEF',
  ghost: '#3C3FEF',
  destructive: '#FFFFFF',
};

// min-h keeps every button at or above Apple's 44pt tap-target minimum
const CONTAINER_SIZES: Record<ButtonSize, string> = {
  md: 'min-h-11 rounded-xl px-5 py-2.5',
  lg: 'min-h-[56px] rounded-2xl px-7 py-4',
};

interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
  className?: string;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled,
  className = '',
  ...pressableProps
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const containerClass = isDisabled ? 'bg-surface-disabled' : CONTAINER_VARIANTS[variant];
  const labelClass = isDisabled ? 'text-ink-disabled' : LABEL_VARIANTS[variant];
  const contentColor = isDisabled ? '#98A2B3' : LABEL_COLORS[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      className={`flex-row items-center justify-center active:scale-[0.98] ${CONTAINER_SIZES[size]} ${containerClass} ${className}`}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator size="small" color={contentColor} />
      ) : (
        <>
          {icon ? (
            <View className="mr-2">
              <Icon name={icon} size={size === 'lg' ? 20 : 18} color={contentColor} />
            </View>
          ) : null}
          <Text className={`font-heading ${size === 'lg' ? 'text-[17px]' : 'text-base'} ${labelClass}`}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
