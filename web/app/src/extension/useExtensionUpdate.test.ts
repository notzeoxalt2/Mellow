import { describe, expect, it } from 'vitest';
import { publishedManifestUrl } from './useExtensionUpdate';

describe('published extension manifest URL', () => {
  it('resolves beside the packaged file app instead of from the drive root', () => {
    expect(publishedManifestUrl('file:///E:/Mellow/resources/app/app/dist/index.html'))
      .toBe('file:///E:/Mellow/resources/app/app/dist/downloads/extension.json');
  });

  it('resolves from the website root', () => {
    expect(publishedManifestUrl('https://mellow.example/home'))
      .toBe('https://mellow.example/downloads/extension.json');
  });
});
