function containsRenderer(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsRenderer(item, key));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(([name, child]) =>
    name === key || containsRenderer(child, key),
  );
}

function isExplicitlyLoggedOut(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(isExplicitlyLoggedOut);
  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;
  if (record.key === 'logged_in' && String(record.value) === '0') return true;
  return Object.values(record).some(isExplicitlyLoggedOut);
}

export interface YouTubeAccountMenuValidation {
  verified: boolean;
  rejected: boolean;
  problem: string | null;
}

/** A desktop cookie is a saved credential, not proof that YouTube accepted it. */
export function isDesktopYouTubeSignedIn(input: {
  hasCookie: boolean;
  connected: boolean;
  verified: boolean;
  rejected: boolean;
  pending: boolean;
}): boolean {
  return input.hasCookie && input.connected && input.verified && !input.rejected && !input.pending;
}

/** Retry an unverified saved session once per desktop launch, including explicit false values. */
export function shouldVerifyDesktopYouTubeAtStartup(input: {
  hasCookie: boolean;
  connected: boolean;
  verified: boolean;
  rejected: boolean;
  pending: boolean;
  attempted: boolean;
}): boolean {
  return input.hasCookie && input.connected && !input.verified && !input.rejected && !input.pending && !input.attempted;
}

/** Classify only explicit logout signals as rejected; rate limits and service errors stay retryable. */
export function validateYouTubeAccountMenu(
  status: number,
  body: unknown,
): YouTubeAccountMenuValidation {
  if (status === 401 || isExplicitlyLoggedOut(body)) {
    return { verified: false, rejected: true, problem: null };
  }

  if (status < 200 || status >= 300) {
    return {
      verified: false,
      rejected: false,
      problem: `Could not verify YouTube Music right now (HTTP ${status}). Your saved sign-in was kept.`,
    };
  }

  if (!containsRenderer(body, 'activeAccountHeaderRenderer')) {
    return {
      verified: false,
      rejected: false,
      problem: 'YouTube Music did not return account details during verification. Your saved sign-in was kept.',
    };
  }

  return { verified: true, rejected: false, problem: null };
}
