import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Check, Download, FileText, FileUp, RotateCcw, Sparkles, X } from "lucide-react";
import ChatMarkdown from "@/components/ChatMarkdown";
import CvAppShell from "@/components/cv/CvAppShell";
import { useResumeChat } from "@/lib/resume/useResumeChat";

/**
 * The CV builder — a full page, not the floating widget.
 *
 * The two are deliberately different products: the widget answers questions
 * about Yassine from a fixed profile, while this one interviews the visitor and
 * writes *their* document. That difference is why this gets a whole viewport, a
 * file drop target and a persistent download, rather than a corner panel.
 */

const OPENERS = [
  "I don't have a CV yet — help me start one",
  "Make my CV sound more professional",
  "I'm applying for an internship",
];

// One control for both jobs: a CV to read, or a headshot to put on it. The
// server routes by content, so the visitor never has to know there are two
// paths — see the `/upload` handler.
const ACCEPTED = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp";

const ResumeBuilder = () => {
  // "Continue" from the My Data page links here with ?session=<id>, which
  // must win over whatever session localStorage already had — see
  // useResumeChat's initialSessionId doc comment.
  const [searchParams] = useSearchParams();
  const {
    turns,
    status,
    error,
    busy,
    pdfVersion,
    canBuild,
    hasPhoto,
    photoBlobUrl,
    send,
    upload,
    build,
    download,
    dropPhoto,
    reset,
  } = useResumeChat(searchParams.get("session"));
  const [draft, setDraft] = useState("");
  const [dragging, setDragging] = useState(false);
  const [longWait, setLongWait] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The warm-up ping (main.tsx, useResumeChat) usually means the backend is
  // already awake by the time a message is sent — but not always: a Render
  // free-tier cold start can take up to about a minute, and a visitor who
  // moves fast enough can still land on one. Spinning dots alone for 50
  // seconds with no explanation reads as broken, not slow, so this switches
  // to an explicit message once a request has been running a while.
  useEffect(() => {
    if (!busy) {
      setLongWait(false);
      return;
    }
    const timer = setTimeout(() => setLongWait(true), 7000);
    return () => clearTimeout(timer);
  }, [busy]);

  useEffect(() => {
    document.title = "CV Builder — Yassine Sinif";
    return () => {
      document.title = "Yassine Sinif — AI & Data Engineer | Portfolio";
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, status]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft;
    setDraft("");
    void send(text);
  };

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset the input so choosing the same file twice still fires a change.
    event.target.value = "";
    if (file) void upload(file);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void upload(file);
  };

  const unavailable = status === "unavailable";
  const empty = turns.length === 0;

  return (
    <CvAppShell>
      <main
        className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-3xl flex-col px-4 pb-4 pt-6"
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy && !unavailable) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-sora text-2xl font-bold md:text-3xl">
              CV Builder
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your CV or answer a few questions. I'll write and design it
              for you.{" "}
              <span className="text-accent">Free while it's in beta.</span>
            </p>
          </div>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
            >
              <RotateCcw size={12} />
              Start over
            </button>
          )}
        </header>

        <div className="relative flex flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/50">
          <AnimatePresence>
            {dragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex items-center justify-center bg-background/90 backdrop-blur-sm"
              >
                <p className="flex items-center gap-2 font-sora text-sm font-semibold text-accent">
                  <FileUp size={16} />
                  Drop a CV to import it, or a photo for your CV
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
            {empty && !unavailable && (
              <div className="space-y-5 py-6">
                <div className="flex items-start gap-3">
                  <Sparkles size={18} className="mt-0.5 shrink-0 text-accent" />
                  <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                    <p className="font-sora font-semibold text-foreground">
                      Two ways to start
                    </p>
                    <p>
                      <strong className="text-foreground">Have a CV?</strong> Drop
                      it here or use the upload button — I'll read it, fix the
                      writing and redesign it.
                    </p>
                    <p>
                      <strong className="text-foreground">Starting fresh?</strong>{" "}
                      Just tell me about yourself and I'll ask what I need.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {OPENERS.map((opener) => (
                    <button
                      key={opener}
                      type="button"
                      onClick={() => void send(opener)}
                      className="rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
                    >
                      {opener}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn, index) => (
              <div
                key={index}
                className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    turn.role === "user"
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary text-foreground/90"
                  }`}
                >
                  <ChatMarkdown content={turn.content} />

                  {turn.actions?.map((action) => (
                    <span
                      key={action}
                      className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-accent"
                    >
                      <Check size={11} />
                      {action}
                    </span>
                  ))}

                  {/* Attached to the turn that produced it, so scrolling back
                      through several versions keeps each download with the
                      message that describes it. A button rather than an
                      <a href>: the endpoint now requires a bearer token that a
                      plain browser navigation cannot carry, so this fetches
                      the PDF and saves it as a blob instead — see
                      downloadResume in api.ts. */}
                  {turn.pdfVersion !== undefined && (
                    <button
                      type="button"
                      onClick={() => void download()}
                      className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90"
                    >
                      <Download size={13} />
                      Download your CV
                      {turn.pdfVersion > 1 && (
                        <span className="opacity-70">v{turn.pdfVersion}</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex items-center gap-2 px-1 py-2">
                <div className="flex gap-1.5" aria-label="Working">
                  {[0, 1, 2].map((dot) => (
                    <motion.span
                      key={dot}
                      animate={{ opacity: [0.25, 1, 0.25] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: dot * 0.18 }}
                      className="h-1.5 w-1.5 rounded-full bg-accent"
                    />
                  ))}
                </div>
                {longWait ? (
                  <span className="text-xs text-muted-foreground">
                    Waking up the server — this can take up to a minute the first time.
                  </span>
                ) : status === "uploading" ? (
                  <span className="text-xs text-muted-foreground">
                    Reading your CV…
                  </span>
                ) : null}
              </div>
            )}

            {unavailable && (
              <p className="py-6 text-sm leading-relaxed text-muted-foreground">
                The CV builder isn't switched on for this deployment yet. In the
                meantime, email{" "}
                <a href="mailto:yassinsinif4@gmail.com" className="text-accent underline">
                  yassinsinif4@gmail.com
                </a>
                .
              </p>
            )}

            {error && !unavailable && (
              <p className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-muted-foreground">
                {error}
              </p>
            )}
          </div>

          {/* Always available once the draft holds something real. The agent is
              meant to render when you approve, but it has more than once said
              the CV was ready having built nothing — so the visitor gets a
              route to their file that does not depend on the model at all. */}
          {canBuild && !unavailable && (
            <div className="flex items-center justify-between gap-3 border-t border-border/50 bg-accent/5 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                {hasPhoto && photoBlobUrl && (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <img
                      src={photoBlobUrl}
                      alt="The photo that will appear on your CV"
                      className="h-7 w-7 rounded-full object-cover ring-1 ring-border/60"
                    />
                    <button
                      type="button"
                      onClick={() => void dropPhoto()}
                      title="Remove the photo"
                      aria-label="Remove the photo"
                      className="text-muted-foreground transition-colors hover:text-accent"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
                <p className="min-w-0 text-xs text-muted-foreground">
                  {pdfVersion > 0
                    ? "Made a change? Rebuild to get an updated PDF."
                    : hasPhoto
                      ? "Happy with what you've told me? Build it whenever you like."
                      : "Want a photo on it? Upload one with the button below."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void build()}
                disabled={busy}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <FileText size={13} />
                {pdfVersion > 0 ? "Rebuild CV" : "Build my CV"}
              </button>
            </div>
          )}

          <form onSubmit={submit} className="border-t border-border/50 p-3">
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED}
                onChange={pickFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy || unavailable}
                aria-label="Upload a CV or a photo"
                title="Upload a CV (PDF/DOCX) or a photo"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-30"
              >
                <FileUp size={15} />
              </button>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  empty ? "Tell me about yourself…" : "Type your answer…"
                }
                aria-label="Your message"
                disabled={unavailable}
                className="flex-1 rounded-full bg-secondary/60 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:bg-secondary disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!draft.trim() || busy || unavailable}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity disabled:opacity-30"
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </form>
        </div>
      </main>
    </CvAppShell>
  );
};

export default ResumeBuilder;
