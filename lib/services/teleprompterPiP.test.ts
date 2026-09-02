import { estimateTeleprompterPiPDuration, generateTeleprompterPiPVideo } from './teleprompterPiP';

describe('estimateTeleprompterPiPDuration', () => {
  it('keeps short scripts long enough for PiP startup', () => {
    expect(estimateTeleprompterPiPDuration('Quick intro')).toBe(8);
  });

  it('adds padding to longer scripts', () => {
    const text = Array.from({ length: 30 }, (_, index) => `word${index}`).join(' ');

    expect(estimateTeleprompterPiPDuration(text)).toBe(15);
  });
});

describe('generateTeleprompterPiPVideo', () => {
  it('rejects — cloud rendering is not available in this OSS build', async () => {
    await expect(
      generateTeleprompterPiPVideo({
        projectId: 'p1',
        clipIndex: 0,
        text: 'Quick intro',
        fontFamily: 'Inter_400Regular',
        textSize: 24,
        scrollSpeed: 40,
        preparationDelaySeconds: 3,
        width: 1080,
        height: 1920,
      })
    ).rejects.toThrow('Cloud teleprompter rendering is not available in this build.');
  });
});
