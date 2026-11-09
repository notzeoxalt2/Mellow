import { describe, expect, it } from 'vitest';
import { mergeYouTubeCookies, prioritizeYouTubeSigningCookie } from '../../../../desktop/src/ytCookies';

describe('desktop YouTube cookie merge', () => {
  it('keeps Chrome’s synced session authoritative over a stale embedded session', () => {
    const result = mergeYouTubeCookies(
      'https://music.youtube.com',
      'SAPISID=chrome-fresh; SID=chrome-session',
      undefined,
      [
        { name: 'SAPISID', value: 'electron-stale' },
        { name: 'SID', value: 'electron-session' },
        { name: 'PREF', value: 'embedded-only' },
      ],
    );

    expect(result.signingCookie).toBe('chrome-fresh');
    expect(result.header).toContain('SAPISID=chrome-fresh');
    expect(result.header).toContain('SID=chrome-session');
    expect(result.header).toContain('PREF=embedded-only');
  });

  it('keeps host-scoped Chrome cookies on their matching YouTube origin', () => {
    const result = mergeYouTubeCookies(
      'https://www.youtube.com',
      'SAPISID=music-signing',
      'SID=yt-session',
      [{ name: 'PREF', value: 'embedded-only' }],
    );

    expect(result.header).toBe('PREF=embedded-only; SID=yt-session');
    expect(result.signingCookie).toBe('');
  });

  it('does not reuse the music.youtube.com snapshot when the www snapshot is empty', () => {
    const result = mergeYouTubeCookies(
      'https://www.youtube.com',
      'SAPISID=music-only',
      undefined,
      [],
    );

    expect(result.header).toBe('');
    expect(result.signingCookie).toBe('');
  });

  it('replaces an embedded stale signing cookie with the exact browser cookie', () => {
    const result = prioritizeYouTubeSigningCookie(
      'SID=embedded-session; SAPISID=embedded-stale; PREF=theme',
      '__Secure-3PAPISID',
      'browser-host-only',
    );

    expect(result.signingCookie).toBe('browser-host-only');
    expect(result.header).toContain('SAPISID=embedded-stale');
    expect(result.header).toContain('__Secure-3PAPISID=browser-host-only');
  });

  it('replaces the same cookie name without producing duplicate cookie fields', () => {
    const result = prioritizeYouTubeSigningCookie(
      'SAPISID=embedded-stale; SID=embedded-session',
      'SAPISID',
      'browser-fresh',
    );

    expect(result.header.match(/SAPISID=/g)).toHaveLength(1);
    expect(result.header).toContain('SAPISID=browser-fresh');
  });
});
