import { SETTINGS_KEY_ONBOARDING_COMPLETED } from '@features/onboarding/constants';
import { JUPITRR } from '@features/onboarding/tokens';
import {
  useDatabase,
  useProjectRepository,
  useSettingsRepository,
} from '@lib/providers/DatabaseProvider';
import { getCombinedEntitlementStatus } from '@lib/services/purchases';
import { DEMO_PROJECT_NAMES } from '@shared/mocks/projects';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

function isDemoProject(name: string): boolean {
  return DEMO_PROJECT_NAMES.has(name);
}

type RouteState = 'loading' | 'onboarding' | 'main';

export default function Index() {
  const { isReady } = useDatabase();
  const settingsRepo = useSettingsRepository();
  const projectRepo = useProjectRepository();
  const [route, setRoute] = useState<RouteState>('loading');

  useEffect(() => {
    if (!isReady) return;

    let onboardingCompleted = settingsRepo.get<boolean>(SETTINGS_KEY_ONBOARDING_COMPLETED, false);

    const projects = projectRepo.getAll();
    const hasOnlyDemoProjects =
      projects.length > 0 && projects.every((project) => isDemoProject(project.name));

    // Self-heal installs where demo seeding incorrectly marked onboarding done.
    if (onboardingCompleted && hasOnlyDemoProjects) {
      settingsRepo.set(SETTINGS_KEY_ONBOARDING_COMPLETED, false);
      onboardingCompleted = false;
    }

    // Grandfather existing users who already have projects on this device.
    const hasUserCreatedProjects = projects.some((project) => !isDemoProject(project.name));
    if (!onboardingCompleted && hasUserCreatedProjects) {
      settingsRepo.set(SETTINGS_KEY_ONBOARDING_COMPLETED, true);
      setRoute('main');
      return;
    }

    if (!onboardingCompleted) {
      getCombinedEntitlementStatus().then((entitlement) => {
        if (entitlement !== 'inactive') {
          settingsRepo.set(SETTINGS_KEY_ONBOARDING_COMPLETED, true);
          setRoute('main');
        } else {
          setRoute('onboarding');
        }
      });
    } else {
      setRoute('main');
    }
  }, [isReady, settingsRepo, projectRepo]);

  if (!isReady || route === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color={JUPITRR.primary} />
      </View>
    );
  }

  if (route === 'onboarding') return <Redirect href="/(onboarding)" />;
  return <Redirect href="/(main)" />;
}
