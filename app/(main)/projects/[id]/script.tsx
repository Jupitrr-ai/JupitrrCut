import { EditableScriptEditor } from '@features/script-editor/components/EditableScriptEditor';
import { useSettingsRepository } from '@lib/providers/DatabaseProvider';
import { useProjectStore } from '@stores/useProjectStore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ScriptEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { getProject, updateProjectScript } = useProjectStore();
  const project = getProject(id ?? '');

  const settingsRepository = useSettingsRepository();
  const wordsPerGroup = settingsRepository.getAutoSplitWordsPerGroup();

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleReady = useCallback(
    (script: string) => {
      if (!id) return;

      // Save the script
      updateProjectScript(id, script);

      // Status stays 'scripted' — Recording starts when the first clip is saved

      // Navigate to clips overview
      router.push(`/(main)/projects/${id}/clips`);
    },
    [id, updateProjectScript, router]
  );

  const handleAutoSave = useCallback(
    (script: string) => {
      if (!id) return;
      updateProjectScript(id, script);
    },
    [id, updateProjectScript]
  );

  if (!project) {
    return null;
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      {Platform.OS === 'ios' && <StatusBar barStyle="dark-content" />}
      <EditableScriptEditor
        initialScript={project.script}
        onBack={handleBack}
        onReady={handleReady}
        onAutoSave={handleAutoSave}
        wordsPerGroup={wordsPerGroup}
      />
    </SafeAreaView>
  );
}
