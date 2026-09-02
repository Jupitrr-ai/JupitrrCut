import {
  parseClips,
  parseTitle,
  serializeClips,
  normalizeScript,
  getClipOffsets,
} from './clip-parser';

describe('parseClips', () => {
  describe('basic parsing', () => {
    it('should handle empty script', () => {
      const clips = parseClips('');
      expect(clips).toHaveLength(0);
    });

    it('should handle whitespace-only script', () => {
      const clips = parseClips('   \n\n   ');
      expect(clips).toHaveLength(0);
    });

    it('should assign correct indices', () => {
      const script = 'First\n\nSecond\n\nThird';
      const clips = parseClips(script);

      expect(clips).toHaveLength(3);
      expect(clips[0]?.index).toBe(0);
      expect(clips[1]?.index).toBe(1);
      expect(clips[2]?.index).toBe(2);
    });
  });

  describe('paragraph break support', () => {
    it('should parse clips from paragraph breaks (double newlines)', () => {
      const script = `First clip text

Second clip text

Third clip text`;
      const clips = parseClips(script);

      expect(clips).toHaveLength(3);
      expect(clips[0]?.text).toBe('First clip text');
      expect(clips[1]?.text).toBe('Second clip text');
      expect(clips[2]?.text).toBe('Third clip text');
    });

    it('should handle multiple consecutive newlines as single delimiter', () => {
      const script = `First clip



Second clip`;
      const clips = parseClips(script);

      expect(clips).toHaveLength(2);
      expect(clips[0]?.text).toBe('First clip');
      expect(clips[1]?.text).toBe('Second clip');
    });

    it('should handle single paragraph as one clip', () => {
      const script = 'Just one clip';
      const clips = parseClips(script);

      expect(clips).toHaveLength(1);
      expect(clips[0]?.text).toBe('Just one clip');
    });

    it('should preserve single newlines within clips', () => {
      const script = `First line
still first clip

Second clip`;
      const clips = parseClips(script);

      expect(clips).toHaveLength(2);
      expect(clips[0]?.text).toBe('First line\nstill first clip');
      expect(clips[1]?.text).toBe('Second clip');
    });

    it('should split with CRLF blank lines (Notion/Windows paste)', () => {
      const script = 'First clip\r\n\r\nSecond clip\r\n\r\nThird clip';
      const clips = parseClips(script);

      expect(clips).toHaveLength(3);
      expect(clips[0]?.text).toBe('First clip');
      expect(clips[1]?.text).toBe('Second clip');
      expect(clips[2]?.text).toBe('Third clip');
    });

    it('should split blank lines containing whitespace characters', () => {
      const script = 'First clip\n \t\nSecond clip\n\u00A0\nThird clip';
      const clips = parseClips(script);

      expect(clips).toHaveLength(3);
      expect(clips[0]?.text).toBe('First clip');
      expect(clips[1]?.text).toBe('Second clip');
      expect(clips[2]?.text).toBe('Third clip');
    });
  });
});

describe('parseTitle (deprecated)', () => {
  it('should return empty string for any input', () => {
    expect(parseTitle('Title / content')).toBe('');
    expect(parseTitle('Just text')).toBe('');
    expect(parseTitle('')).toBe('');
  });
});

describe('normalizeScript', () => {
  it('should normalize paragraph-separated clips', () => {
    const script = `First clip

Second clip`;
    const normalized = normalizeScript(script);

    expect(normalized).toBe('First clip\n\nSecond clip');
  });

  it('should handle empty script', () => {
    expect(normalizeScript('')).toBe('');
    expect(normalizeScript('   ')).toBe('');
  });

  it('should preserve single newlines within clips', () => {
    const script = `First line
still first clip

Second clip`;
    const normalized = normalizeScript(script);

    expect(normalized).toBe('First line\nstill first clip\n\nSecond clip');
  });
});

describe('serializeClips', () => {
  it('should serialize clips with blank line separators', () => {
    const clips = [
      { index: 0, text: 'First clip' },
      { index: 1, text: 'Second clip' },
    ];
    expect(serializeClips(clips)).toBe('First clip\n\nSecond clip');
  });

  it('should handle single clip', () => {
    const clips = [{ index: 0, text: 'Only clip' }];
    expect(serializeClips(clips)).toBe('Only clip');
  });

  it('should handle empty array', () => {
    expect(serializeClips([])).toBe('');
  });

  it('should preserve internal newlines in clip text', () => {
    const clips = [{ index: 0, text: 'Line one\nLine two' }];
    expect(serializeClips(clips)).toBe('Line one\nLine two');
  });
});

describe('getClipOffsets', () => {
  it('should return empty array for empty script', () => {
    expect(getClipOffsets('')).toEqual([]);
  });

  it('should return [0] for single clip', () => {
    expect(getClipOffsets('Hello world')).toEqual([0]);
  });

  it('should return correct offsets for two clips', () => {
    const script = 'First clip\n\nSecond clip';
    const offsets = getClipOffsets(script);
    expect(offsets).toEqual([0, 12]);
  });

  it('should return correct offsets for three clips', () => {
    const script = 'AAA\n\nBBB\n\nCCC';
    const offsets = getClipOffsets(script);
    expect(offsets).toEqual([0, 5, 10]);
  });

  it('should handle whitespace-only script', () => {
    expect(getClipOffsets('   \n\n   ')).toEqual([]);
  });
});
