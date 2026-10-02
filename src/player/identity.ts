const USERNAME_KEY = 'outplayed.username';
const MIN_LEN = 2;
const MAX_LEN = 12;

/** Allowed callsign characters. */
const VALID = /^[A-Za-z0-9_\-]+$/;

export function getSavedUsername(): string {
  try {
    return (localStorage.getItem(USERNAME_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

export function saveUsername(name: string): void {
  const cleaned = sanitizeUsername(name);
  if (!cleaned) return;
  try {
    localStorage.setItem(USERNAME_KEY, cleaned);
  } catch {
    // ignore quota / private mode
  }
}

export function sanitizeUsername(raw: string): string {
  return raw.trim().slice(0, MAX_LEN);
}

export function isValidUsername(name: string): boolean {
  const n = sanitizeUsername(name);
  return n.length >= MIN_LEN && n.length <= MAX_LEN && VALID.test(n);
}

export const USERNAME_RULES = {
  MIN_LEN,
  MAX_LEN,
} as const;
