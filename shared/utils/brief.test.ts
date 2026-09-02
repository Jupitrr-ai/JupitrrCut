import { deriveBriefTitle } from './brief';

describe('deriveBriefTitle', () => {
  it('returns the trimmed title when present', () => {
    expect(deriveBriefTitle('  My Brief  ', 'script text', 'Fallback')).toBe('My Brief');
  });

  it('falls back to the start of the script when title is missing', () => {
    expect(deriveBriefTitle(undefined, 'First sentence of the script.', 'Fallback')).toBe(
      'First sentence of the script.'
    );
  });

  it('collapses whitespace and caps the script-derived title at 40 chars', () => {
    const script = 'One\n\ntwo   three ' + 'x'.repeat(100);
    const result = deriveBriefTitle(null, script, 'Fallback');
    expect(result.startsWith('One two three')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it('uses the fallback when both title and script are empty', () => {
    expect(deriveBriefTitle('', '   ', 'Fallback')).toBe('Fallback');
    expect(deriveBriefTitle(null, null, 'Fallback')).toBe('Fallback');
  });
});
