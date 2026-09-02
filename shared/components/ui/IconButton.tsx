import type { IconName } from '@shared/components/ui/Icon';
import { Icon } from '@shared/components/ui/Icon';
import { Pressable } from 'react-native';
import type { PressableProps } from 'react-native';

type IconButtonVariant = 'plain' | 'tinted' | 'overlay';

const VARIANTS: Record<IconButtonVariant, { container: string; color: string }> = {
  plain: { container: 'bg-transparent active:bg-surface-subtle', color: '#101828' },
  tinted: { container: 'bg-surface-subtle active:bg-surface-disabled', color: '#101828' },
  overlay: { container: 'bg-black/40 active:bg-black/60', color: '#FFFFFF' },
};

interface IconButtonProps extends PressableProps {
  icon: IconName;
  /** Required: what the button does, for VoiceOver (e.g. t('common.back')) */
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  size?: number;
  color?: string;
}

/** Icon-only button with a guaranteed 44x44pt tap target. */
export function IconButton({
  icon,
  accessibilityLabel,
  variant = 'plain',
  size = 22,
  color,
  className = '',
  ...pressableProps
}: IconButtonProps) {
  const preset = VARIANTS[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`h-11 w-11 items-center justify-center rounded-full active:scale-95 ${preset.container} ${className}`}
      {...pressableProps}
    >
      <Icon name={icon} size={size} color={color ?? preset.color} />
    </Pressable>
  );
}
