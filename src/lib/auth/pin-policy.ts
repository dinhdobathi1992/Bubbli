/**
 * PIN policy.
 *
 * Red-team finding #15: the plan specified a PIN with no entropy floor, so the
 * default outcome was a parent-chosen 4-digit code — 10,000 possibilities,
 * defeated by a sibling in an afternoon and by an attacker instantly.
 *
 * The floor is six digits, and the obvious codes are refused. This is a real
 * constraint on a real credential, not a checkbox: the child's crisis path is
 * only reachable inside an authenticated session, so PIN strength is a safety
 * property, not merely an access one.
 */

export const PIN_MIN_LENGTH = 6;
export const PIN_MAX_LENGTH = 12;

/**
 * Codes that dominate real-world PIN datasets, plus the shapes a child picks.
 * Rejecting these removes the overwhelming majority of guessable choices at
 * negligible cost to usability.
 */
const BLOCKED_EXACT = new Set([
  '000000', '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999',
  '123456', '654321', '012345', '543210', '123123', '121212', '112233', '696969', '123321',
  '111222', '101010', '202020', '123456789', '1234567', '12345678',
]);

export interface PinValidation {
  ok: boolean;
  /** Safe to show a parent. Never reveals which specific rule matched a value. */
  reason?: string;
}

/** Ascending or descending runs: 456789, 987654. */
function isSequential(pin: string): boolean {
  let asc = true;
  let desc = true;
  for (let i = 1; i < pin.length; i += 1) {
    const d = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
    if (d !== 1) asc = false;
    if (d !== -1) desc = false;
  }
  return asc || desc;
}

/** A single repeated digit, or a short repeating unit such as 121212. */
function isLowEntropyRepeat(pin: string): boolean {
  if (new Set(pin).size === 1) return true;
  for (const unit of [1, 2, 3]) {
    if (pin.length % unit !== 0) continue;
    const head = pin.slice(0, unit);
    if (head.repeat(pin.length / unit) === pin && new Set(head).size < pin.length) return true;
  }
  return false;
}

/** Plausible birth years inside the PIN, which children and parents both pick. */
function containsYear(pin: string): boolean {
  return /(19[5-9]\d|20[0-2]\d)/.test(pin);
}

export function validatePin(pin: string): PinValidation {
  if (!/^\d+$/.test(pin)) return { ok: false, reason: 'A PIN can only contain digits.' };
  if (pin.length < PIN_MIN_LENGTH) return { ok: false, reason: `A PIN needs at least ${PIN_MIN_LENGTH} digits.` };
  if (pin.length > PIN_MAX_LENGTH) return { ok: false, reason: `A PIN can be at most ${PIN_MAX_LENGTH} digits.` };
  if (BLOCKED_EXACT.has(pin)) return { ok: false, reason: 'That PIN is too common. Please choose another.' };
  if (isSequential(pin)) return { ok: false, reason: 'A PIN cannot be a run of consecutive digits.' };
  if (isLowEntropyRepeat(pin)) return { ok: false, reason: 'A PIN cannot be a repeating pattern.' };
  if (containsYear(pin)) return { ok: false, reason: 'A PIN should not contain a year.' };
  return { ok: true };
}

// ── Lockout policy ───────────────────────────────────────────────────────────

/** Failures before the account locks. */
export const PIN_MAX_ATTEMPTS = 5;

/**
 * How long a lock lasts.
 *
 * Deliberately finite. An unrecoverable lockout is a denial-of-service against
 * a child whose only route to the in-band crisis response runs through an
 * authenticated session — the availability control and the safety control are
 * the same control. A parent can also clear it immediately (see unlockChild).
 */
export const PIN_LOCKOUT_MS = 15 * 60 * 1000;
