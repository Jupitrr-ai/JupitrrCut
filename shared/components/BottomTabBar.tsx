import type { IconName } from '@shared/components/ui/Icon';
import { Icon } from '@shared/components/ui/Icon';
import { router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TabId = 'projects' | 'ideas' | 'stitches';

interface Tab {
  id: TabId;
  labelKey: string;
  icon: IconName;
  activeIcon: IconName;
  href: '/(main)' | '/(main)/ideas' | '/(main)/video-stitches';
  match: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  {
    id: 'ideas',
    labelKey: 'tabs.ideas',
    icon: 'idea',
    activeIcon: 'ideaFilled',
    href: '/(main)/ideas',
    match: (p) => p.includes('ideas'),
  },
  {
    id: 'projects',
    labelKey: 'tabs.projects',
    icon: 'clapperboard',
    activeIcon: 'clapperboardFilled',
    href: '/(main)',
    match: (p) => !p.includes('video-stitches') && !p.includes('ideas'),
  },
  {
    id: 'stitches',
    labelKey: 'tabs.stitches',
    icon: 'scissors',
    activeIcon: 'scissorsFilled',
    href: '/(main)/video-stitches',
    match: (p) => p.includes('video-stitches'),
  },
];

export function BottomTabBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View
      className="border-t border-solid border-surface-line bg-white"
      style={{ paddingBottom: insets.bottom }}
    >
      <View className="flex-row">
        {TABS.map((tab) => {
          const isActive = tab.match(pathname);

          return (
            <Pressable
              key={tab.id}
              onPress={() => router.replace(tab.href)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={t(tab.labelKey)}
              className="flex-1 items-center py-3"
            >
              <Icon
                name={isActive ? tab.activeIcon : tab.icon}
                size={26}
                color={isActive ? '#3C3FEF' : '#9CA3AF'}
              />
              <Text
                className={`mt-1 text-[11px] ${
                  isActive ? 'font-heading text-primary' : 'font-sans text-gray-400'
                }`}
              >
                {t(tab.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
