import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FileText, Loader2, Plus } from "lucide-react";
import CvAppShell from "@/components/cv/CvAppShell";
import { fetchSessions, type SessionSummary } from "@/lib/resume/api";

/**
 * Every CV the visitor has started. Backed by GET /sessions, which reads
 * from Postgres — see cv-service/app/db.py's list_session_rows — so this
 * only shows anything once persistence is actually configured server-side;
 * an empty list is the honest, quiet result otherwise, not an error.
 *
 * A photo gallery was part of the original ask, but the current design does
 * not persist photo bytes past this process's own lifetime (see the note in
 * supabase/schema.sql) — only the currently-live session's photo, if any,
 * can ever be shown. Rather than fake a "photos" section with nothing real
 * behind it, this page sticks to what genuinely survives: the CVs
 * themselves.
 */
const CvMyData = () => {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);

  useEffect(() => {
    document.title = "CV Builder — History";
    void fetchSessions().then(setSessions);
  }, []);

  return (
    <CvAppShell>
      <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-2xl flex-col px-4 pb-4 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-sora text-2xl font-bold">History</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every CV chat you've started. Each keeps its own memory — pick one
              up where you left off.
            </p>
          </div>
          <Link
            to="/cv-builder?new=1"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            <Plus size={13} /> New CV
          </Link>
        </div>

        <div className="mt-5 space-y-2">
          {sessions === null && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              Loading…
            </div>
          )}

          {sessions?.length === 0 && (
            <p className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing yet —{" "}
              <Link to="/cv-builder" className="text-accent underline">
                start a CV
              </Link>{" "}
              and it'll show up here.
            </p>
          )}

          {sessions?.map((session) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Link
                to={`/cv-builder?session=${session.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/50 px-4 py-3.5 transition-colors hover:border-accent/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <FileText size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {session.name ?? "Untitled CV"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.style} ·{" "}
                      {session.updated_at
                        ? new Date(session.updated_at).toLocaleDateString()
                        : "—"}
                      {session.pdf_version > 0 ? " · built" : ""}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-xs font-semibold text-accent">Continue</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </main>
    </CvAppShell>
  );
};

export default CvMyData;
