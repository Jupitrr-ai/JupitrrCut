import { AutoStitchIllustration } from './illustrations/AutoStitchIllustration';
import { ImportScriptIllustration } from './illustrations/ImportScriptIllustration';
import { PublishIllustration } from './illustrations/PublishIllustration';
import { ScriptScenesIllustration } from './illustrations/ScriptScenesIllustration';
import { TeleprompterDemoIllustration } from './illustrations/TeleprompterDemoIllustration';

interface Props {
  stepKey: string;
}

export function OnboardingIllustration({ stepKey }: Props) {
  switch (stepKey) {
    case 'writeScript':
      return <TeleprompterDemoIllustration />;
    case 'sceneRecording':
      return <ScriptScenesIllustration />;
    case 'autoStitch':
      return <AutoStitchIllustration />;
    case 'importJupitrr':
      return <ImportScriptIllustration />;
    case 'brollPublish':
      return <PublishIllustration />;
    default:
      return null;
  }
}
