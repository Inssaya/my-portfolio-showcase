import { ReactNode, useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { useIsGuest } from "@/lib/cv/guest";
import CvSaveWorkPrompt from "@/components/cv/CvSaveWorkPrompt";

interface CvGuestGateProps {
  children: ReactNode;
  /** What is behind the gate, e.g. "your saved CVs" or "your profile".
   *  Used verbatim in the message the guest reads, so write it as a noun
   *  phrase that fits the sentence "…to see and manage <this>." */
  what: string;
}

/**
 * Wraps a page that only signed-up visitors should reach.
 *
 * Guests can build a CV without an account (that's the point of anonymous
 * sign-in), but the shape of the product changes past the builder itself —
 * a "your saved CVs" page for someone with no account to save to would be
 * lying. So the content is still rendered underneath (so the visitor can
 * see what they'd be unlocking), just blurred and non-interactive, with an
 * account prompt sitting over it.
 *
 * Renders children directly for signed-up users — no extra DOM, no cost.
 */
const CvGuestGate = ({ children, what }: CvGuestGateProps) => {
  const guest = useIsGuest();
  const [askOpen, setAskOpen] = useState(false);

  if (!guest) return <>{children}</>;

  return (
    <div className="relative">
      <CvSaveWorkPrompt
        open={askOpen}
        onClose={() => setAskOpen(false)}
        reason="save"
      />
      {/* Aria-hidden so a screen reader is told directly by the overlay
          rather than trying to read the blurred content behind it. */}
      <div
        aria-hidden
        className="pointer-events-none select-none blur-sm opacity-40"
      >
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center px-4 pt-16 sm:pt-24">
        <div
          role="dialog"
          aria-label={`Sign up to see ${what}`}
          className="w-full max-w-sm rounded-2xl border border-accent/30 bg-card/95 p-6 text-center shadow-xl backdrop-blur"
        >
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Lock size={20} />
          </div>
          <h2 className="font-sora text-base font-bold">Create an account</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            You're building as a guest. Save your work to see and manage{" "}
            <span className="text-foreground">{what}</span> — everything you've
            already written comes with you.
          </p>
          <button
            type="button"
            onClick={() => setAskOpen(true)}
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            <Sparkles size={14} />
            Create your account
          </button>
        </div>
      </div>
    </div>
  );
};

export default CvGuestGate;
