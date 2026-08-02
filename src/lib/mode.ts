/**
 * Which door the visitor chose at the entry gate.
 *
 * Remembered so a returning visitor is not asked again, but never used to skip
 * the gate silently on a first visit — the gate click is what unlocks audio
 * autoplay for the guided tour.
 */

export type SiteMode = "classic" | "experience";

const KEY = "portfolio:mode";

export function rememberMode(mode: SiteMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Private browsing with storage disabled: the gate simply asks again.
  }
}

export function rememberedMode(): SiteMode | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "classic" || value === "experience" ? value : null;
  } catch {
    return null;
  }
}

export function forgetMode() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
