import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, User as UserIcon } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import CvAppShell from "@/components/cv/CvAppShell";
import { supabase } from "@/lib/supabase";

/**
 * Every signed-in visitor's own page — the "something special" a plain
 * chat interface doesn't give them: a place that is unmistakably *theirs*,
 * separate from the tool itself. Read-only for now (name comes from
 * signup — see CvSignUp.tsx's user_metadata); editing is a fast follow if
 * it turns out anyone wants to correct a typo'd name.
 */
const CvProfile = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    document.title = "CV Builder — Profile";
    supabase?.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const firstName = (user?.user_metadata?.first_name as string | undefined) ?? "";
  const lastName = (user?.user_metadata?.last_name as string | undefined) ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "there";
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long" })
    : null;

  return (
    <CvAppShell>
      <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-2xl flex-col px-4 pb-4 pt-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl border border-border/60 bg-card/60 p-6"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <UserIcon size={24} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-sora text-xl font-bold">Hey, {fullName}</h1>
              <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent">
            <Sparkles size={12} />
            Beta member{memberSince ? ` since ${memberSince}` : ""}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            You're one of the first people using the CV builder — thank you for
            trying it while it's still rough around the edges. Everything you
            build stays private to your account; see{" "}
            <Link to="/cv-builder/terms" className="text-accent underline">
              Terms &amp; Privacy
            </Link>{" "}
            for the details.
          </p>
        </motion.div>
      </main>
    </CvAppShell>
  );
};

export default CvProfile;
