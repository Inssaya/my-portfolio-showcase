import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, User as UserIcon, Mail, Calendar, Pencil, Check, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import CvAppShell from "@/components/cv/CvAppShell";
import { supabase } from "@/lib/supabase";

const CvProfile = () => {
  const navigate = useNavigate();

  // --- State ---
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // --- Derived data (memoized) ---
  const displayName = useMemo(() => {
    const first = user?.user_metadata?.first_name as string | undefined;
    const last = user?.user_metadata?.last_name as string | undefined;
    const full = [first, last].filter(Boolean).join(" ");
    if (full) return full;
    if (user?.email) return user.email.split("@")[0];
    return "there";
  }, [user]);

  const memberSince = useMemo(() => {
    if (!user?.created_at) return null;
    return new Date(user.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
  }, [user]);

  // --- Fetch user and listen for auth changes ---
  useEffect(() => {
    document.title = "CV Builder — Profile";

    let isMounted = true;

    const fetchUser = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (isMounted) {
          setUser(data.user);
          if (data.user) {
            setEditFirstName(data.user.user_metadata?.first_name || "");
            setEditLastName(data.user.user_metadata?.last_name || "");
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load profile");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (isMounted) {
          setUser(session?.user ?? null);
          if (session?.user) {
            setEditFirstName(session.user.user_metadata?.first_name || "");
            setEditLastName(session.user.user_metadata?.last_name || "");
          }
        }
      }
    );

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // --- Handlers ---
  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    navigate("/cv-builder/login");
  }, [navigate]);

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      setUser(data.user);
      if (data.user) {
        setEditFirstName(data.user.user_metadata?.first_name || "");
        setEditLastName(data.user.user_metadata?.last_name || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleEditToggle = useCallback(() => {
    if (isEditing) {
      // Cancel: reset to current values
      setEditFirstName(user?.user_metadata?.first_name || "");
      setEditLastName(user?.user_metadata?.last_name || "");
    }
    setIsEditing(!isEditing);
  }, [isEditing, user]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          first_name: editFirstName.trim(),
          last_name: editLastName.trim(),
        },
      });
      if (updateError) throw updateError;

      // Re‑fetch user to get fresh metadata
      const { data, error: fetchError } = await supabase.auth.getUser();
      if (fetchError) throw fetchError;
      setUser(data.user);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update name");
    } finally {
      setIsSaving(false);
    }
  }, [editFirstName, editLastName]);

  // --- Loading ---
  if (isLoading) {
    return (
      <CvAppShell>
        <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-2xl flex-col items-center justify-center px-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          <p className="mt-4 text-sm text-muted-foreground">Loading your profile…</p>
        </main>
      </CvAppShell>
    );
  }

  // --- Error ---
  if (error) {
    return (
      <CvAppShell>
        <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-2xl flex-col items-center justify-center px-4">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center">
            <p className="text-destructive">Something went wrong: {error}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={handleRefresh}
                className="rounded-md bg-accent px-4 py-2 text-sm text-white"
              >
                Retry
              </button>
              <button
                onClick={handleLogout}
                className="rounded-md border px-4 py-2 text-sm"
              >
                Sign out
              </button>
            </div>
          </div>
        </main>
      </CvAppShell>
    );
  }

  // --- No user (signed out) ---
  if (!user) {
    return (
      <CvAppShell>
        <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-2xl flex-col items-center justify-center px-4">
          <div className="rounded-2xl border p-6 text-center">
            <p className="text-muted-foreground">You are not signed in.</p>
            <Link
              to="/cv-builder/login"
              className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm text-white"
            >
              Sign in
            </Link>
          </div>
        </main>
      </CvAppShell>
    );
  }

  // --- Profile content ---
  return (
    <CvAppShell>
      <main className="mx-auto w-full max-w-md px-5 pb-12 pt-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          {/* Avatar + identity, centred */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-accent/25 to-accent/5 ring-1 ring-accent/20">
              <UserIcon size={34} className="text-accent" />
            </div>

            {isEditing ? (
              <div className="mt-5 w-full space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm outline-none transition-colors focus:border-accent/50"
                  />
                  <input
                    type="text"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm outline-none transition-colors focus:border-accent/50"
                  />
                </div>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <Check size={14} />
                    {isSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={handleEditToggle}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X size={14} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-4 flex items-center gap-2">
                  <h1 className="font-sora text-2xl font-bold">{displayName}</h1>
                  <button
                    onClick={handleEditToggle}
                    className="text-muted-foreground transition-colors hover:text-accent"
                    aria-label="Edit name"
                  >
                    <Pencil size={15} />
                  </button>
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Mail size={14} className="shrink-0" />
                  <span className="break-all">{user.email}</span>
                </p>
              </>
            )}

            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-xs font-semibold text-accent">
              <Sparkles size={13} className="shrink-0" />
              Beta member{memberSince ? ` since ${memberSince}` : ""}
            </div>
          </div>

          {/* Details card */}
          <div className="mt-8 rounded-2xl border border-border/60 bg-card/50 p-5">
            {memberSince && (
              <div className="flex items-center gap-2.5 text-sm">
                <Calendar size={16} className="shrink-0 text-accent" />
                <span className="text-muted-foreground">Joined</span>
                <span className="ml-auto font-medium">{memberSince}</span>
              </div>
            )}
            <p
              className={`text-sm leading-relaxed text-muted-foreground ${
                memberSince ? "mt-4 border-t border-border/50 pt-4" : ""
              }`}
            >
              You're one of the first people using the CV builder — thank you for
              trying it while it's still rough around the edges. Everything you
              build stays private to your account; see{" "}
              <Link to="/cv-builder/terms" className="text-accent underline">
                Terms &amp; Privacy
              </Link>{" "}
              for the details.
            </p>
          </div>
        </motion.div>
      </main>
    </CvAppShell>
  );
};

export default CvProfile;