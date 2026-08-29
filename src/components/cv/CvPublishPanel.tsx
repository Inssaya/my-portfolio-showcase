import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, ExternalLink, Globe, Loader2, X } from "lucide-react";
import { fetchPublishState, portfolioUrl, setPublished } from "@/lib/portfolio/api";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_KEYS,
  resolveTheme,
  type PortfolioTheme,
} from "@/lib/portfolio/themes";
import { useIsGuest } from "@/lib/cv/guest";
import CvSaveWorkPrompt from "@/components/cv/CvSaveWorkPrompt";

interface CvPublishPanelProps {
  open: boolean;
  onClose: () => void;
  sessionId: string | null;
}

/**
 * Turning a finished CV into a public page.
 *
 * The CV and the portfolio are the same draft — nothing is copied — so this
 * panel only records three things: whether the page is live, which theme it
 * wears, and whether the phone number is on it.
 *
 * Two rules are enforced in the database rather than here, and this component
 * is written on the assumption that it cannot be trusted with either:
 * publishing requires a real account (a guest's account gets purged, which
 * would break the URL later), and the phone number is stripped server-side
 * unless opted in. What follows is the explanation of those rules, not the
 * implementation of them.
 */
const CvPublishPanel = ({ open, onClose, sessionId }: CvPublishPanelProps) => {
  const guest = useIsGuest();
  const [live, setLive] = useState(false);
  const [theme, setTheme] = useState<PortfolioTheme>(DEFAULT_THEME);
  const [showPhone, setShowPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [askAccount, setAskAccount] = useState(false);

  useEffect(() => {
    if (!open) {
      setError(null);
      setCopied(false);
      return;
    }
    // Load the live settings every time it opens. Without this the panel
    // insists nothing is published — it would offer a Publish button for a
    // page that already exists, and hide the URL of a page that is live.
    if (!sessionId) return;
    let cancelled = false;
    void fetchPublishState(sessionId).then((state) => {
      if (cancelled || !state) return;
      setLive(state.published);
      setShowPhone(state.showPhone);
      // resolveTheme, not the raw value: the column is deliberately
      // unconstrained, so an unknown theme must fall back rather than leave
      // the picker with nothing selected.
      setTheme(resolveTheme(state.theme));
    });
    return () => {
      cancelled = true;
    };
  }, [open, sessionId]);

  const url = sessionId ? portfolioUrl(sessionId) : "";

  const save = async (next: {
    published: boolean;
    theme?: PortfolioTheme;
    showPhone?: boolean;
  }) => {
    if (!sessionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await setPublished(sessionId, next);
      if (!ok) {
        setError("Couldn't update that. Try again.");
        return;
      }
      setLive(next.published);
      if (next.theme) setTheme(next.theme);
      if (next.showPhone !== undefined) setShowPhone(next.showPhone);
    } catch (caught) {
      // The database refuses a guest publishing; surface that as the account
      // prompt rather than as an error the visitor can do nothing about.
      const message = caught instanceof Error ? caught.message : "";
      if (/account is required/i.test(message)) {
        setAskAccount(true);
      } else {
        setError("Couldn't update that. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const publish = (event: FormEvent) => {
    event.preventDefault();
    if (guest) {
      setAskAccount(true);
      return;
    }
    void save({ published: true, theme, showPhone });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the URL is on screen and selectable,
      // so this is a convenience failing, not the feature failing.
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={onClose}
        >
          <CvSaveWorkPrompt
            open={askAccount}
            reason="save"
            onClose={() => setAskAccount(false)}
            onSaved={() => {
              setAskAccount(false);
              void save({ published: true, theme, showPhone });
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.33, 1, 0.68, 1] }}
            role="dialog"
            aria-label="Publish your portfolio"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border/60 bg-card shadow-2xl shadow-black/40 sm:max-h-[85dvh] sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/50 px-6 py-4">
              <div>
                <h2 className="font-sora text-lg font-bold">Your portfolio page</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  A public page built from this CV. Edit the CV and the page
                  changes with it.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={publish} className="overflow-y-auto px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pick a look
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {THEME_KEYS.map((key) => {
                  const tokens = THEMES[key];
                  const selected = theme === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setTheme(key);
                        // Only persist immediately once it is live — before
                        // that, publishing carries the choice.
                        if (live) void save({ published: true, theme: key });
                      }}
                      className={`overflow-hidden rounded-xl border-2 text-left transition-all ${
                        selected ? "border-accent" : "border-border/60 hover:border-accent/50"
                      }`}
                    >
                      {/* A swatch of the real palette, not a screenshot: the
                          page is generated, so there is nothing to photograph
                          until it exists. */}
                      <div
                        className="flex h-14 items-center gap-1.5 px-3"
                        style={{ background: tokens.colors.bg }}
                      >
                        <span
                          className="h-6 w-6 rounded-full"
                          style={{ background: tokens.colors.accent }}
                        />
                        <span className="flex flex-col gap-1">
                          <span
                            className="block h-1.5 w-12 rounded-full"
                            style={{ background: tokens.colors.text, opacity: 0.85 }}
                          />
                          <span
                            className="block h-1.5 w-8 rounded-full"
                            style={{ background: tokens.colors.muted, opacity: 0.7 }}
                          />
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 bg-card px-2.5 py-2">
                        <span className="text-xs font-semibold">{tokens.name}</span>
                        {selected && <Check size={12} className="shrink-0 text-accent" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 p-3">
                <input
                  type="checkbox"
                  checked={showPhone}
                  onChange={(event) => {
                    setShowPhone(event.target.checked);
                    if (live) void save({ published: true, showPhone: event.target.checked });
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                />
                <span className="text-sm">
                  Show my phone number
                  {/* Said plainly, because the difference between a CV and a
                      public page is not obvious until it has cost you. */}
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                    Off by default. Your CV is sent to people you choose; this page
                    is open to anyone with the link, including search engines.
                  </span>
                </span>
              </label>

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {error}
                </p>
              )}

              {live ? (
                <div className="mt-5 rounded-xl border border-accent/40 bg-accent/5 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-accent">
                    <Globe size={14} />
                    Your page is live
                  </p>
                  <p className="mt-2 break-all rounded-lg bg-secondary/60 px-3 py-2 font-mono text-xs">
                    {url}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void copy()}
                      className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground"
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      {copied ? "Copied" : "Copy link"}
                    </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3.5 py-2 text-xs font-medium transition-colors hover:border-accent/50 hover:text-accent"
                    >
                      <ExternalLink size={13} />
                      Open
                    </a>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void save({ published: false })}
                      className="ml-auto rounded-full px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                    >
                      Take it offline
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={busy || !sessionId}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                  {busy ? "Publishing…" : "Publish my portfolio"}
                </button>
              )}

              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {guest
                  ? "Publishing needs an account — a guest session is temporary, and the link would stop working when it expires."
                  : "You can take the page offline at any time, and the link stops working immediately."}
              </p>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CvPublishPanel;
