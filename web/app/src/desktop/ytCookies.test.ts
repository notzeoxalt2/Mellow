import { describe, expect, it } from 'vitest';
import { resetYouTubeChannelForSessionChange } from '../../../desktop/src/ytCookies';

describe('YouTube desktop session identity', () => {
  it('clears a previous brand-channel selection when the login changes', () => {
    const auth = {
      sapisid: 'old-session',
      sapisidName: 'SAPISID',
      ytAuthUser: '0',
      ytPageId: 'brand-channel-123',
      ytActive: { id: '0:brand-channel-123' },
      ytAuthVerified: true,
    };

    expect(resetYouTubeChannelForSessionChange(auth, 'new-session', 'SAPISID', '0')).toBe(true);
    expect(auth.ytPageId).toBeNull();
    expect(auth.ytActive).toBeNull();
    expect(auth.ytAuthVerified).toBe(false);
  });

  it('preserves the selected channel while refreshing the same login', () => {
    const active = { id: '0:brand-channel-123' };
    const auth = {
      sapisid: 'same-session',
      sapisidName: 'SAPISID',
      ytAuthUser: '0',
      ytPageId: 'brand-channel-123',
      ytActive: active,
    };

    expect(resetYouTubeChannelForSessionChange(auth, 'same-session', 'SAPISID', '0')).toBe(false);
    expect(auth.ytPageId).toBe('brand-channel-123');
    expect(auth.ytActive).toBe(active);
  });

  it('clears the channel when the selected Google login index changes', () => {
    const auth = {
      sapisid: 'same-session',
      sapisidName: 'SAPISID',
      ytAuthUser: '1',
      ytPageId: 'brand-channel-123',
      ytActive: { id: '1:brand-channel-123' },
    };

    expect(resetYouTubeChannelForSessionChange(auth, 'same-session', 'SAPISID', '2')).toBe(true);
    expect(auth.ytPageId).toBeNull();
    expect(auth.ytActive).toBeNull();
  });

  it('clears a brand channel when the selected signing cookie scope changes', () => {
    const auth = {
      sapisid: 'same-session',
      sapisidName: '__Secure-3PAPISID',
      ytAuthUser: '0',
      ytPageId: 'brand-channel-123',
      ytActive: { id: '0:brand-channel-123' },
    };

    expect(resetYouTubeChannelForSessionChange(auth, 'same-session', 'SAPISID', '0')).toBe(true);
    expect(auth.ytPageId).toBeNull();
    expect(auth.ytActive).toBeNull();
  });
});
