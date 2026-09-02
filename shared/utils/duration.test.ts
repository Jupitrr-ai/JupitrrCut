import { estimateDuration } from './duration';

describe('estimateDuration', () => {
  it('should estimate duration based on word count', () => {
    // 10 words at 2.5 words/sec = 4 seconds
    const text = 'one two three four five six seven eight nine ten';
    expect(estimateDuration(text)).toBe(4);
  });

  it('should return minimum 3 seconds for short text', () => {
    expect(estimateDuration('hi')).toBe(3);
  });

  it('should handle empty text', () => {
    expect(estimateDuration('')).toBe(3);
  });

  it('should handle text with extra whitespace', () => {
    const text = '  one   two   three  ';
    expect(estimateDuration(text)).toBe(3); // 3 words, rounds to 2, min 3
  });
});
