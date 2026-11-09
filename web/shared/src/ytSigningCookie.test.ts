import { describe, expect, it } from 'vitest';
import { selectYouTubeSigningCookie } from './ytSigningCookie';

describe('selectYouTubeSigningCookie', () => {
  it('uses the preferred signing-cookie order instead of API array order', () => {
    const cookie = selectYouTubeSigningCookie(
      [
        { name: '__Secure-3PAPISID', value: 'third-party' },
        { name: 'SAPISID', value: 'sapisid' },
      ],
      [],
    );

    expect(cookie).toEqual({ name: 'SAPISID', value: 'sapisid' });
  });

  it('skips empty preferred cookies and uses the next valid cookie', () => {
    const cookie = selectYouTubeSigningCookie(
      [
        { name: 'SAPISID', value: '' },
        { name: '__Secure-3PAPISID', value: 'third-party' },
      ],
      [],
    );

    expect(cookie).toEqual({ name: '__Secure-3PAPISID', value: 'third-party' });
  });

  it('falls back to the www.youtube.com snapshot when music has no signing cookie', () => {
    const cookie = selectYouTubeSigningCookie(
      [{ name: 'CONSENT', value: 'yes' }],
      [{ name: '__Secure-1PAPISID', value: 'youtube-origin' }],
    );

    expect(cookie).toEqual({ name: '__Secure-1PAPISID', value: 'youtube-origin' });
  });

  it('returns null when no non-empty signing cookie exists', () => {
    expect(selectYouTubeSigningCookie([{ name: 'SAPISID', value: ' ' }], [])).toBeNull();
  });
});
