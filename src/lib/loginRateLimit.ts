/**
 * Client-side login rate limiter.
 *
 * Supabase Auth already enforces server-side throttling on its own endpoints,
 * but the static-password fallback has no such protection. This module covers
 * both paths uniformly: localStorage tracks failures and lockouts so a page
 * refresh doesn't reset the counter, but a determined attacker who knows to
 * clear storage can still bypass it — that's the ceiling of what pure
 * client-side code can guarantee. A real server-side middleware (e.g. a
 * Supabase Edge Function or Vercel middleware) would be the next step.
 *
 * Constants:
 *  MAX_ATTEMPTS  – failures allowed before lockout
 *  LOCKOUT_MS    – how long to lock (10 min)
 *  WINDOW_MS     – rolling window within which failures are counted;
 *                  older failures are forgiven automatically
 */

const STORAGE_KEY = "admin_login_rate";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes
const WINDOW_MS = 15 * 60 * 1000;  // rolling 15-minute window

interface RateState {
  /** Timestamps (epoch ms) of each failure still inside the rolling window. */
  failures: number[];
  /** Epoch ms when the lockout ends, or null when not locked. */
  lockedUntil: number | null;
}

const EMPTY: RateState = { failures: [], lockedUntil: null };

function readState(): RateState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    return JSON.parse(raw) as RateState;
  } catch {
    return EMPTY;
  }
}

function writeState(state: RateState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage disabled or full — fail open (don't block the user).
  }
}

/** Prune failures older than the rolling window and expired lockouts. */
function normalise(state: RateState): RateState {
  const now = Date.now();
  const failures = state.failures.filter((t) => now - t < WINDOW_MS);
  const lockedUntil =
    state.lockedUntil && state.lockedUntil > now ? state.lockedUntil : null;
  return { failures, lockedUntil };
}

// ── public API ────────────────────────────────────────────────────────────────

export interface LockStatus {
  locked: boolean;
  /** ms until the lockout ends (0 when not locked). */
  msRemaining: number;
  /** Failures left before a lockout is triggered (undefined when locked). */
  attemptsLeft?: number;
}

/** Read current status without mutating state. */
export function getLockStatus(): LockStatus {
  const state = normalise(readState());

  if (state.lockedUntil) {
    return {
      locked: true,
      msRemaining: state.lockedUntil - Date.now(),
    };
  }

  return {
    locked: false,
    msRemaining: 0,
    attemptsLeft: MAX_ATTEMPTS - state.failures.length,
  };
}

/** Call after every failed sign-in attempt. Returns updated status. */
export function recordFailure(): LockStatus {
  const state = normalise(readState());
  const now = Date.now();

  state.failures.push(now);

  if (state.failures.length >= MAX_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_MS;
    writeState(state);
    return { locked: true, msRemaining: LOCKOUT_MS };
  }

  writeState(state);
  return {
    locked: false,
    msRemaining: 0,
    attemptsLeft: MAX_ATTEMPTS - state.failures.length,
  };
}

/** Call after a successful sign-in — clears all failure history. */
export function recordSuccess(): void {
  writeState(EMPTY);
}
