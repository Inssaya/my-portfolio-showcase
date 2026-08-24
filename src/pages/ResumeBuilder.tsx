import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Check,
  Download,
  FileText,
  FileUp,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
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

const ACCEPTED = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp";

const ResumeBuilder = () => {
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
        className="relative mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-3xl flex-col px-3 pb-3 pt-4 sm:px-4 sm:pb-4 sm:pt-5"
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy && !unavailable) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {/* Subtle ambient glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 overflow-hidden">
          <div className="mx-auto h-40 w-72 rounded-full bg-accent/[0.07] blur-3xl" />
        </div>

        {/* Header */}
        <header className="relative z-10 mb-4 flex items-start justify-between gap-4 px-1 sm:px-0">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/10">
                <Sparkles size={15} strokeWidth={2.2} />
              </div>

              <h1 className="font-sora text-[22px] font-bold tracking-[-0.025em] text-foreground sm:text-2xl md:text-3xl">
                CV Builder
              </h1>
            </div>

            <p className="mt-2 max-w-xl text-[13px] leading-5 text-muted-foreground sm:text-sm">
              Upload your CV or answer a few questions. I'll write and design
              it for you.{" "}
              <span className="font-medium text-accent">
                Free while it's in beta.
              </span>
            </p>
          </div>

          {turns.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="group mt-0.5 flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-accent/40 hover:bg-accent/[0.04] hover:text-accent"
            >
              <RotateCcw
                size={11}
                className="transition-transform duration-300 group-hover:-rotate-90"
              />
              Start over
            </button>
          )}
        </header>

        {/* Main workspace */}
        <div className="relative flex flex-1 flex-col overflow-hidden rounded-[22px] border border-border/70 bg-card/70 shadow-[0_14px_45px_rgba(0,0,0,0.06)] backdrop-blur-xl sm:rounded-[26px]">
          {/* Inner highlight */}
          <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/[0.04]" />

          {/* Drag overlay */}
          <AnimatePresence>
            {dragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex items-center justify-center bg-background/85 p-6 backdrop-blur-md"
              >
                <motion.div
                  initial={{ scale: 0.96, y: 8 }}
                  animate={{ scale: 1, y: 0 }}
                  className="rounded-3xl border border-dashed border-accent/50 bg-accent/[0.06] px-8 py-7 text-center shadow-2xl"
                >
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/15">
                    <FileUp size={21} />
                  </div>

                  <p className="font-sora text-sm font-semibold text-foreground">
                    Drop your file here
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    CV or profile photo
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Conversation */}
          <div
            ref={scrollRef}
            className="relative flex-1 space-y-5 overflow-y-auto px-3.5 py-5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/60 sm:px-5 sm:py-6"
          >
            {/* Empty state */}
            {empty && !unavailable && (
              <div className="space-y-6 py-5 sm:py-8">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                  className="flex items-start gap-3.5"
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/10">
                    <Sparkles size={16} />
                  </div>

                  <div className="max-w-xl space-y-2.5 text-[13px] leading-6 text-muted-foreground sm:text-sm">
                    <p className="font-sora font-semibold text-[14px] text-foreground sm:text-[15px]">
                      Two ways to start
                    </p>

                    <p>
                      <strong className="font-semibold text-foreground">
                        Have a CV?
                      </strong>{" "}
                      Drop it here or use the upload button — I'll read it,
                      fix the writing and redesign it.
                    </p>

                    <p>
                      <strong className="font-semibold text-foreground">
                        Starting fresh?
                      </strong>{" "}
                      Just tell me about yourself and I'll ask what I need.
                    </p>
                  </div>
                </motion.div>

                <div className="ml-0 flex flex-wrap gap-2 sm:ml-[3.25rem]">
                  {OPENERS.map((opener, index) => (
                    <motion.button
                      key={opener}
                      type="button"
                      onClick={() => void send(opener)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.25,
                        delay: 0.08 + index * 0.04,
                      }}
                      className="rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-accent/[0.05] hover:text-accent hover:shadow-md"
                    >
                      {opener}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {turns.map((turn, index) => (
              <motion.div
                key={index}
                initial={{
                  opacity: 0,
                  y: 7,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  duration: 0.24,
                  ease: "easeOut",
                }}
                className={
                  turn.role === "user"
                    ? "flex justify-end"
                    : "flex justify-start"
                }
              >
                <div
                  className={`max-w-[90%] rounded-[20px] px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[84%] ${
                    turn.role === "user"
                      ? "rounded-br-[7px] bg-accent text-accent-foreground shadow-accent/10"
                      : "rounded-bl-[7px] border border-border/60 bg-secondary/75 text-foreground/90"
                  }`}
                >
                  <ChatMarkdown content={turn.content} />

                  {turn.actions?.map((action) => (
                    <span
                      key={action}
                      className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-accent"
                    >
                      <Check size={11} strokeWidth={2.5} />
                      {action}
                    </span>
                  ))}

                  {turn.pdfVersion !== undefined && (
                    <button
                      type="button"
                      onClick={() => void download()}
                      className="group mt-3 inline-flex items-center gap-2 rounded-xl bg-background px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm ring-1 ring-border/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <Download
                        size={13}
                        className="text-accent transition-transform group-hover:translate-y-0.5"
                      />

                      <span>Download your CV</span>

                      {turn.pdfVersion > 1 && (
                        <span className="text-muted-foreground">
                          v{turn.pdfVersion}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </motion.div>
            ))}

            {/* Loading */}
            {busy && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 px-1 py-2"
              >
                <div className="flex h-7 items-center gap-1.5 rounded-full border border-border/60 bg-secondary/50 px-2.5">
                  {[0, 1, 2].map((dot) => (
                    <motion.span
                      key={dot}
                      animate={{
                        opacity: [0.3, 1, 0.3],
                        scale: [0.85, 1, 0.85],
                      }}
                      transition={{
                        duration: 1.1,
                        repeat: Infinity,
                        delay: dot * 0.18,
                      }}
                      className="h-1.5 w-1.5 rounded-full bg-accent"
                    />
                  ))}
                </div>

                {longWait ? (
                  <span className="text-[11px] text-muted-foreground">
                    Waking up the server — this can take up to a minute the
                    first time.
                  </span>
                ) : status === "uploading" ? (
                  <span className="text-[11px] text-muted-foreground">
                    Reading your CV…
                  </span>
                ) : null}
              </motion.div>
            )}

            {/* Unavailable */}
            {unavailable && (
              <div className="rounded-2xl border border-border/60 bg-secondary/35 px-4 py-4 shadow-sm">
                <p className="text-sm leading-6 text-muted-foreground">
                  The CV builder isn't switched on for this deployment yet. In
                  the meantime, email{" "}
                  <a
                    href="mailto:yassinsinif4@gmail.com"
                    className="font-medium text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent"
                  >
                    yassinsinif4@gmail.com
                  </a>
                  .
                </p>
              </div>
            )}

            {/* Error */}
            {error && !unavailable && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-accent/25 bg-accent/[0.045] px-3.5 py-2.5 text-xs leading-5 text-muted-foreground shadow-sm"
              >
                {error}
              </motion.p>
            )}
          </div>

          {/* Build bar */}
          {canBuild && !unavailable && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-t border-border/60 bg-accent/[0.035] px-3.5 py-3 sm:px-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {hasPhoto && photoBlobUrl && (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="relative">
                        <img
                          src={photoBlobUrl}
                          alt="The photo that will appear on your CV"
                          className="h-8 w-8 rounded-xl object-cover ring-1 ring-border/70 shadow-sm"
                        />

                        <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background text-accent shadow-sm ring-1 ring-border/60">
                          <Check size={8} strokeWidth={3} />
                        </span>
                      </span>

                      <button
                        type="button"
                        onClick={() => void dropPhoto()}
                        title="Remove the photo"
                        aria-label="Remove the photo"
                        className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  )}

                  <p className="min-w-0 truncate text-[11px] leading-5 text-muted-foreground sm:text-xs">
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
                  className="group flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground shadow-sm shadow-accent/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-accent/15 disabled:opacity-40"
                >
                  <FileText
                    size={13}
                    className="transition-transform group-hover:scale-110"
                  />

                  {pdfVersion > 0 ? "Rebuild CV" : "Build my CV"}
                </button>
              </div>
            </motion.div>
          )}

          {/* Composer */}
          <form className="border-t border-border/60 bg-background/55 p-3 backdrop-blur-md sm:p-3.5">
            <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-secondary/40 p-1.5 shadow-inner transition-all duration-200 focus-within:border-accent/30 focus-within:bg-background/80 focus-within:shadow-sm">
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all duration-200 hover:bg-background hover:text-accent disabled:opacity-30"
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
                className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground/55 disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={!draft.trim() || busy || unavailable}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-sm transition-all duration-200 hover:scale-[1.03] hover:shadow-md disabled:scale-100 disabled:opacity-25"
              >
                <ArrowUp size={16} strokeWidth={2.2} />
              </button>
            </div>
          </form>
        </div>
      </main>
    </CvAppShell>
  );
};

export default ResumeBuilder;