import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Check, MessageSquare, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ChatMarkdown from "@/components/ChatMarkdown";
import { AssistantHandlers, useAssistant } from "@/lib/assistant/useAssistant";

interface AssistantWidgetProps extends AssistantHandlers {
  /** Called when the panel opens, so the tour can freeze itself. */
  onOpen?: () => void;
  /** Shown in the header while the tour is paused behind the panel. */
  pausedLabel?: string;
}

const SUGGESTIONS = [
  "What has he actually built?",
  "Is he available for an internship?",
  "Send me his CV",
];

/**
 * The floating assistant.
 *
 * Opening it is what pauses the guided tour, so `onOpen` fires before any
 * message is sent — the visitor should not have to wait for a reply before the
 * narration stops talking over them.
 */
const AssistantWidget = ({ onOpen, pausedLabel, ...handlers }: AssistantWidgetProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const assistant = useAssistant({
    ...handlers,
    onShowProject: (slug) => {
      handlers.onShowProject?.(slug);
      navigate(`/projects/${slug}`);
      setOpen(false);
    },
  });

  const { turns, status, send } = assistant;

  useEffect(() => {
    if (!open) return;
    onOpen?.();
    inputRef.current?.focus();
  }, [open, onOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, status]);

  // Escape closes the panel, matching every other dialog on the web.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft;
    setDraft("");
    void send(text);
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.33, 1, 0.68, 1] }}
            role="dialog"
            aria-label="Ask about Yassine"
            // The panel needs a real, opaque surface — the ambient .glass-card
            // background is nearly transparent by design (it lets the mesh nebulae
            // show through cards on the page), which would leave the chat body
            // unreadable on top of the starfield. Solid card fill + heavy blur,
            // with the border and shadow the design language uses everywhere else.
            className="fixed bottom-24 left-2 right-2 z-50 flex h-[min(28rem,calc(100svh-7rem))] flex-col overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-xl md:left-auto md:right-6 md:w-96 md:h-[min(32rem,70svh)]"
          >
            <header className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-accent" />
                <span className="font-sora text-sm font-semibold">Ask about Yassine</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={16} />
              </button>
            </header>

            {pausedLabel && (
              <p className="border-b border-border/40 bg-accent/5 px-4 py-2 text-[11px] text-accent">
                {pausedLabel}
              </p>
            )}

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {turns.length === 0 && status !== "unavailable" && (
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Ask me anything about his experience, projects or availability.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void send(suggestion)}
                        className="rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {turns.map((turn, i) => (
                <div
                  key={i}
                  className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      turn.role === "user"
                        ? "bg-accent text-accent-foreground"
                        : "bg-secondary text-foreground/90"
                    }`}
                  >
                    {turn.role === "assistant" ? <ChatMarkdown content={turn.content} /> : turn.content}
                    {turn.actions?.map((action) => (
                      <span
                        key={action}
                        className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-accent"
                      >
                        <Check size={11} />
                        {action}
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              {status === "thinking" && (
                <div className="flex gap-1.5 px-1 py-2" aria-label="Thinking">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      animate={{ opacity: [0.25, 1, 0.25] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                      className="h-1.5 w-1.5 rounded-full bg-accent"
                    />
                  ))}
                </div>
              )}

              {status === "unavailable" && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  The assistant isn't switched on for this deployment yet. In the
                  meantime, everything it would tell you is on the page — or email{" "}
                  <a href="mailto:yassinsinif4@gmail.com" className="text-accent underline">
                    yassinsinif4@gmail.com
                  </a>
                  .
                </p>
              )}

              {status === "error" && (
                <p className="text-sm text-muted-foreground">
                  Something went wrong reaching the assistant. Try again in a moment.
                </p>
              )}
            </div>

            <form onSubmit={submit} className="border-t border-border/50 p-3">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask a question…"
                  aria-label="Your question"
                  disabled={status === "unavailable"}
                  className="flex-1 rounded-full bg-secondary/60 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:bg-secondary disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || status === "thinking" || status === "unavailable"}
                  aria-label="Send"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity disabled:opacity-30"
                >
                  <ArrowUp size={16} />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close the assistant" : "Ask about Yassine"}
        aria-expanded={open}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-6 right-4 z-50 flex h-13 items-center gap-2 rounded-full border border-border/60 bg-card/90 px-4 py-3.5 shadow-xl shadow-black/30 backdrop-blur-md transition-colors hover:border-accent/50 md:right-6"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        {open ? <X size={16} /> : <MessageSquare size={16} className="text-accent" />}
        <span className="font-sora text-xs font-semibold">Ask</span>
      </motion.button>
    </>
  );
};

export default AssistantWidget;
