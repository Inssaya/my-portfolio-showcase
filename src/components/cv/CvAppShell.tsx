import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, FileText, History, LogOut, Mail, Menu, Plus, User as UserIcon } from "lucide-react";
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
import { guestName, isGuest } from "@/lib/cv/guest";

/**
 * The CV builder's own app shell: a burger menu, not the portfolio's
 * scroll-section rail (Navigation/MobileNav) — those links (Home, About,
 * Experience…) mean nothing once a visitor is signed in and inside this
 * product. Every authenticated /cv-builder/* page renders inside this.
 */

const ITEMS = [
  { to: "/cv-builder", label: "CV Builder", icon: FileText },
  { to: "/cv-builder/mydata", label: "History", icon: History },
  { to: "/cv-builder/profile", label: "Profile", icon: UserIcon },
  { to: "/cv-builder/contact", label: "Contact", icon: Mail },
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

const CvAppShell = ({ children, cvReady = false }: CvAppShellProps) => {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [asked, setAsked] = useState(false);

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
                        {item.label}
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
                <button
                  type="button"
                  onClick={() => void supabase?.auth.signOut()}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive/90 transition-colors hover:bg-destructive/10"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
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
            <Link
              to="/cv-builder/mydata"
              className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-accent/50 hover:text-accent"
            >
              <History size={14} />
              History
            </Link>
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
