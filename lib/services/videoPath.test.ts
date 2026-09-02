const NEW_DOC = 'file:///var/mobile/Containers/Data/Application/NEW-UUID/Documents';

jest.mock('expo-file-system', () => ({
  Paths: { document: NEW_DOC },
  File: class {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }
  },
}));

import { resolveDocumentPath, toDocumentRelativePath } from './videoPath';

const OLD_DOC = 'file:///var/mobile/Containers/Data/Application/OLD-UUID/Documents';

describe('toDocumentRelativePath', () => {
  it('strips the container prefix from an absolute document path', () => {
    expect(toDocumentRelativePath(`${OLD_DOC}/clip_a_0_123.mp4`)).toBe('clip_a_0_123.mp4');
  });

  it('preserves a subdirectory (e.g. samples/)', () => {
    expect(toDocumentRelativePath(`${OLD_DOC}/samples/1_original.mp4`)).toBe(
      'samples/1_original.mp4'
    );
  });

  it('returns already-relative values unchanged', () => {
    expect(toDocumentRelativePath('clip_a_0_123.mp4')).toBe('clip_a_0_123.mp4');
  });

  it('passes through remote and simulator URIs', () => {
    expect(toDocumentRelativePath('https://cdn.example.com/v.mp4')).toBe(
      'https://cdn.example.com/v.mp4'
    );
    expect(toDocumentRelativePath('simulator://recording-1')).toBe('simulator://recording-1');
  });

  it('handles nullish input', () => {
    expect(toDocumentRelativePath(null)).toBeUndefined();
    expect(toDocumentRelativePath(undefined)).toBeUndefined();
  });
});

describe('resolveDocumentPath', () => {
  it('re-bases a relative path onto the current documents directory', () => {
    expect(resolveDocumentPath('clip_a_0_123.mp4')).toBe(`${NEW_DOC}/clip_a_0_123.mp4`);
  });

  it('repairs a legacy absolute path with an outdated container UUID', () => {
    expect(resolveDocumentPath(`${OLD_DOC}/clip_a_0_123.mp4`)).toBe(`${NEW_DOC}/clip_a_0_123.mp4`);
  });

  it('resolves a subdirectory path against the current documents directory', () => {
    expect(resolveDocumentPath('samples/1_original.mp4')).toBe(`${NEW_DOC}/samples/1_original.mp4`);
    expect(resolveDocumentPath(`${OLD_DOC}/samples/1_original.mp4`)).toBe(
      `${NEW_DOC}/samples/1_original.mp4`
    );
  });

  it('passes through remote and simulator URIs untouched', () => {
    expect(resolveDocumentPath('https://cdn.example.com/v.mp4')).toBe(
      'https://cdn.example.com/v.mp4'
    );
    expect(resolveDocumentPath('simulator://recording-1')).toBe('simulator://recording-1');
  });

  it('handles nullish input', () => {
    expect(resolveDocumentPath(null)).toBeUndefined();
    expect(resolveDocumentPath(undefined)).toBeUndefined();
  });
});
