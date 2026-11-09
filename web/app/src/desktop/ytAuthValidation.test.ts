import { describe, expect, it } from 'vitest';
import { isDesktopYouTubeSignedIn, shouldVerifyDesktopYouTubeAtStartup, validateYouTubeAccountMenu } from '../../../desktop/src/ytAuthValidation.js';

describe('isDesktopYouTubeSignedIn', () => {
  const verified = { hasCookie: true, connected: true, verified: true, rejected: false, pending: false };

  it('requires YouTube to verify the saved session', () => {
    expect(isDesktopYouTubeSignedIn(verified)).toBe(true);
    expect(isDesktopYouTubeSignedIn({ ...verified, verified: false })).toBe(false);
  });

  it('stays signed out when disconnected, rejected, or still checking', () => {
    expect(isDesktopYouTubeSignedIn({ ...verified, connected: false })).toBe(false);
    expect(isDesktopYouTubeSignedIn({ ...verified, rejected: true })).toBe(false);
    expect(isDesktopYouTubeSignedIn({ ...verified, pending: true })).toBe(false);
  });
});

describe('shouldVerifyDesktopYouTubeAtStartup', () => {
  const savedSession = { hasCookie: true, connected: true, verified: false, rejected: false, pending: false, attempted: false };

  it('rechecks saved false and undefined-equivalent verification state on launch', () => {
    expect(shouldVerifyDesktopYouTubeAtStartup(savedSession)).toBe(true);
  });

  it('does not retry a rejected, disconnected, verified, pending, or already-attempted session', () => {
    expect(shouldVerifyDesktopYouTubeAtStartup({ ...savedSession, rejected: true })).toBe(false);
    expect(shouldVerifyDesktopYouTubeAtStartup({ ...savedSession, connected: false })).toBe(false);
    expect(shouldVerifyDesktopYouTubeAtStartup({ ...savedSession, verified: true })).toBe(false);
    expect(shouldVerifyDesktopYouTubeAtStartup({ ...savedSession, pending: true })).toBe(false);
    expect(shouldVerifyDesktopYouTubeAtStartup({ ...savedSession, attempted: true })).toBe(false);
    expect(shouldVerifyDesktopYouTubeAtStartup({ ...savedSession, hasCookie: false })).toBe(false);
  });
});

describe('validateYouTubeAccountMenu', () => {
  it('accepts a successful account menu with an active account renderer', () => {
    expect(validateYouTubeAccountMenu(200, {
      header: { activeAccountHeaderRenderer: { name: { simpleText: 'Listener' } } },
    })).toEqual({ verified: true, rejected: false, problem: null });
  });

  it('rejects an explicitly anonymous YouTube response', () => {
    expect(validateYouTubeAccountMenu(200, {
      responseContext: { serviceTrackingParams: [{ params: [{ key: 'logged_in', value: '0' }] }] },
    })).toEqual({ verified: false, rejected: true, problem: null });
  });

  it('rejects an unauthorized response', () => {
    expect(validateYouTubeAccountMenu(401, null)).toEqual({
      verified: false,
      rejected: true,
      problem: null,
    });
  });

  it('keeps a saved sign-in retryable after a temporary server error', () => {
    const result = validateYouTubeAccountMenu(503, null);
    expect(result.verified).toBe(false);
    expect(result.rejected).toBe(false);
    expect(result.problem).toContain('HTTP 503');
  });

  it('does not mistake a successful but incomplete response for an expired sign-in', () => {
    const result = validateYouTubeAccountMenu(200, { responseContext: {} });
    expect(result.verified).toBe(false);
    expect(result.rejected).toBe(false);
    expect(result.problem).toContain('did not return account details');
  });
});
