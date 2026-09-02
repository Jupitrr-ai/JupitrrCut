import { autoSplitScript, hasExplicitDelimiter, splitByDelimiter } from './auto-split';

describe('autoSplitScript', () => {
  it('splits long CJK text into multiple scenes', () => {
    const text = `AI可以寫code。

但佢唔會幫你建立人生方向。

AI可以分析資料。

但價值判斷，仍然係人類責任。

未來唔係「人 vs AI」。

係「識用AI嘅人」vs「唔識用AI嘅人」。`;

    const scenes = autoSplitScript(text);
    expect(scenes.length).toBeGreaterThan(1);
  });

  it('does NOT split CJK text that has no sentence punctuation (no hard cap)', () => {
    const longText =
      '這是一段很長的中文內容但是完全沒有任何句號或標點符號所以不應該被切分繼續增加文字讓它變得更長'.repeat(
        3
      );
    const scenes = autoSplitScript(longText);
    expect(scenes).toHaveLength(1);
  });

  it('does NOT split a long run-on english sentence with no punctuation', () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const scenes = autoSplitScript(text);
    expect(scenes).toHaveLength(1);
  });

  it('only breaks at punctuation and keeps embedded english words intact', () => {
    const text = '我們討論 productivity 工具。'.repeat(6);
    const scenes = autoSplitScript(text, { wordsPerGroup: 8 });
    expect(scenes.length).toBeGreaterThan(1);
    for (const scene of scenes) {
      // No scene contains a cut fragment of "productivity".
      expect(/produc(?!tivity)|(?<!produc)tivity/.test(scene)).toBe(false);
    }
  });

  it('respects the configurable words-per-group target', () => {
    const text = Array.from({ length: 40 }, (_, i) => `word${i}.`).join(' ');
    const few = autoSplitScript(text, { wordsPerGroup: 8 });
    const many = autoSplitScript(text, { wordsPerGroup: 40 });
    expect(few.length).toBeGreaterThan(many.length);
  });
});

describe('splitByDelimiter', () => {
  it('splits on "/" delimiters surrounded by whitespace', () => {
    expect(splitByDelimiter('First clip / Second clip / Third clip')).toEqual([
      'First clip',
      'Second clip',
      'Third clip',
    ]);
  });

  it('does not treat slashes inside urls, dates, or words as delimiters', () => {
    expect(splitByDelimiter('Visit https://jupitrr.com on 12/25 for and/or deals')).toEqual([
      'Visit https://jupitrr.com on 12/25 for and/or deals',
    ]);
    expect(hasExplicitDelimiter('https://jupitrr.com 12/25 and/or')).toBe(false);
  });

  it('detects an explicit delimiter only when whitespace-bounded', () => {
    expect(hasExplicitDelimiter('a / b')).toBe(true);
    expect(hasExplicitDelimiter('a/b')).toBe(false);
  });

  it('also honors blank lines alongside slash delimiters', () => {
    expect(splitByDelimiter('Intro / Body\n\nOutro')).toEqual(['Intro', 'Body', 'Outro']);
  });
});
