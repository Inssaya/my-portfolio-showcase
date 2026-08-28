import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, FileText, History, LayoutTemplate, Lock, LogOut, Mail, Menu, Plus, Sparkles, User as UserIcon } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { supabase } from "@/lib/supabase";
import CvSaveWorkPrompt from "@/components/cv/CvSaveWorkPrompt";
import CvTemplatePicker, {
  CvTemplate,
  readPreferredTemplate,
} from "@/components/cv/CvTemplatePicker";
import { guestName, isGuest } from "@/lib/cv/guest";

/**
 * The CV builder's own app shell: a burger menu, not the portfolio's
 * scroll-section rail (Navigation/MobileNav) — those links (Home, About,
 * Experience…) mean nothing once a visitor is signed in and inside this
 * product. Every authenticated /cv-builder/* page renders inside this.
 */

// `guestOnly` means the page is available even without an account (the
// builder itself, and the public contact form the portfolio already has).
// Anything else — history, profile — is behind CvGuestGate; the entry
// stays in the menu so a guest knows the page exists, but it wears a lock.
const ITEMS = [
  { to: "/cv-builder", label: "CV Builder", icon: FileText, guestOnly: true },
  { to: "/cv-builder/mydata", label: "History", icon: History, guestOnly: false },
  { to: "/cv-builder/profile", label: "Profile", icon: UserIcon, guestOnly: false },
  { to: "/cv-builder/contact", label: "Contact", icon: Mail, guestOnly: true },
];

interface CvAppShellProps {
  children: ReactNode;
  /**
   * Set by a page that has produced a finished CV. The shell — not the page —
   * decides what to do with that, because only the shell knows whether the
   * visitor is still a guest. Asking here also keeps it to once per visit
   * rather than once per rebuild.
   */
  cvReady?: boolean;
  /**
   * The current session's id, if a page is inside a live conversation. The
   * template picker needs this to save the choice server-side; without it,
   * picking still works and is remembered locally for the next session.
   */
  sessionId?: string | null;
}

interface GuestAccount {
  /** True while the visitor is building without having signed up. */
  isGuest: boolean;
  /** Friendly, stable display name — "Guest 511". */
  name: string;
  /** Open the "keep this CV" prompt. */
  promptToSave: () => void;
}

const GuestAccountContext = createContext<GuestAccount>({
  isGuest: false,
  name: "",
  promptToSave: () => {},
});

/**
 * Guest state lives in the shell so every /cv-builder page shares one source
 * of truth and one prompt instance. A page that reaches a natural moment to
 * ask — ResumeBuilder, once a CV has actually rendered — calls promptToSave();
 * the header offers the same thing permanently, so a visitor who dismissed it
 * is never stuck as a guest with no way back.
 */
export const useGuestAccount = () => useContext(GuestAccountContext);

const CvAppShell = ({ children, cvReady = false, sessionId = null }: CvAppShellProps) => {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [asked, setAsked] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [template, setTemplate] = useState<CvTemplate>(() => readPreferredTemplate());

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const guest = isGuest(user);
  const promptToSave = useCallback(() => setSavePromptOpen(true), []);

  useEffect(() => {
    // The conversion moment: they have a CV in hand and something to lose.
    // Once only — a save prompt that reappears after every edit is a wall
    // wearing a friendlier label.
    if (cvReady && guest && !asked) {
      setAsked(true);
      setSavePromptOpen(true);
    }
  }, [cvReady, guest, asked]);

  return (
    <GuestAccountContext.Provider
      value={{ isGuest: guest, name: guestName(user), promptToSave }}
    >
    <div className="min-h-[100svh] bg-background">
      <CvSaveWorkPrompt open={savePromptOpen} onClose={() => setSavePromptOpen(false)} />
      <CvTemplatePicker
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        sessionId={sessionId}
        current={template}
        onPicked={setTemplate}
      />
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Menu size={18} />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col p-0">
              <SheetHeader className="border-b border-border/60 px-5 py-4 text-left">
                <SheetTitle className="font-sora">CV Builder</SheetTitle>
              </SheetHeader>

              <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
                {ITEMS.map((item) => {
                  const active = location.pathname === item.to;
                  const locked = guest && !item.guestOnly;
                  return (
                    <SheetClose asChild key={item.to}>
                      <Link
                        to={item.to}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                          active
                            ? "bg-accent/15 text-accent"
                            : "text-foreground/80 hover:bg-secondary"
                        }`}
                      >
                        <item.icon size={16} />
                        <span className="flex-1">{item.label}</span>
                        {/* A lock on the entry, not a hidden entry — the
                            visitor should see the page exists, and clicking
                            still works: it lands them on the gate, which is
                            the same account form the "Save work" button
                            opens. */}
                        {locked && (
                          <Lock
                            size={12}
                            className="text-muted-foreground/60"
                            aria-label="Requires an account"
                          />
                        )}
                      </Link>
                    </SheetClose>
                  );
                })}
              </nav>

              <div className="space-y-1 border-t border-border/60 px-3 py-4">
                <SheetClose asChild>
                  <Link
                    to="/"
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-secondary"
                  >
                    <ArrowLeft size={16} />
                    Back to portfolio
                  </Link>
                </SheetClose>
                {/* A guest has no account to sign out of — sign-out would
                    just destroy the anonymous session they're mid-CV in.
                    So the same slot offers what a guest actually wants
                    from it: turning that session into a real account. */}
                {guest ? (
                  <SheetClose asChild>
                    <button
                      type="button"
                      onClick={promptToSave}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/10"
                    >
                      <Sparkles size={16} />
                      Create your account
                    </button>
                  </SheetClose>
                ) : (
                  <button
                    type="button"
                    onClick={() => void supabase?.auth.signOut()}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive/90 transition-colors hover:bg-destructive/10"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-1.5">
            <Link
              to="/cv-builder?new=1"
              className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-accent/50 hover:text-accent"
            >
              <Plus size={14} />
              New chat
            </Link>
            {/* History lives in the burger menu already, so it doesn't need a
                second spot here — the topbar reserves its space for actions
                that belong to the CV in front of you. */}
            <button
              type="button"
              onClick={() => setTemplateOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-accent/50 hover:text-accent"
              title={`Template: ${template === "modern" ? "Modern" : "Classic"}`}
            >
              <LayoutTemplate size={14} />
              Template
            </button>
            {guest ? (
              // A guest needs a permanent way to convert, not just the one
              // prompt shown after their first CV — dismissing that must not
              // strand them. Doubles as the answer to "am I signed in?".
              <button
                type="button"
                onClick={promptToSave}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
              >
                <UserIcon size={13} />
                Save work
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void supabase?.auth.signOut()}
                title="Sign out"
                aria-label="Sign out"
                className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      {children}
    </div>
    </GuestAccountContext.Provider>
  );
};

export default CvAppShell;
