import { useCallback, useMemo, useRef, useState } from "react";
import { adminData, slugify } from "@/lib/admin-data";
import { CV_FILENAME, CV_URL } from "@/lib/cv";
import { ASSISTANT_TOOLS, ToolCall } from "./tools";
import { buildProfileDigest, buildSystemPrompt } from "./profile";

export interface Turn {
  role: "user" | "assistant";
  content: string;
  /** Actions the assistant performed on this turn, for rendering as chips. */
  actions?: string[];
}

export type AssistantStatus = "idle" | "thinking" | "unavailable" | "error";

export interface AssistantHandlers {
  /** Live description of what the visitor is looking at, if any. */
  getContext?: () => string | null;
  onShowProject?: (slug: string) => void;
  onResumeTour?: () => void;
}

/** Wire-format message for the API route. */
interface WireMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

const MAX_TOOL_ROUNDS = 3;

export function useAssistant(handlers: AssistantHandlers = {}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const historyRef = useRef<WireMessage[]>([]);

  // Rebuilt per send rather than memoised on mount, so admin edits made during
  // the session are reflected without a reload.
  const digest = useMemo(() => buildProfileDigest(), []);

  /**
   * Runs a tool the model asked for. Every tool is a UI action, so this all
   * happens client-side; the string returned goes back to the model so it can
   * acknowledge what happened in its own words.
   */
  const runTool = useCallback(
    (call: ToolCall): { result: string; label: string } => {
      switch (call.name) {
        case "send_cv": {
          const anchor = document.createElement("a");
          anchor.href = CV_URL;
          anchor.download = CV_FILENAME;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          return { result: "The CV download has started.", label: "Sent the CV" };
        }

        case "open_github": {
          const url = adminData.getSocialLinks().github;
          if (!url) return { result: "No GitHub link is configured.", label: "" };
          window.open(url, "_blank", "noopener,noreferrer");
          return { result: "Opened GitHub in a new tab.", label: "Opened GitHub" };
        }

        case "show_project": {
          const slug = typeof call.arguments.slug === "string" ? call.arguments.slug : "";
          const project = adminData
            .getProjects()
            .find((candidate) => slugify(candidate.title) === slug);

          if (!project) {
            // Tell the model plainly rather than navigating somewhere wrong.
            return { result: `No project exists with the slug "${slug}".`, label: "" };
          }

          handlers.onShowProject?.(slug);
          return { result: `Showing "${project.title}".`, label: `Opened ${project.title}` };
        }

        case "resume_tour": {
          if (!handlers.onResumeTour) {
            return { result: "There is no tour running to resume.", label: "" };
          }
          handlers.onResumeTour();
          return { result: "The tour has resumed.", label: "Resumed the tour" };
        }

        default:
          return { result: `Unknown tool: ${call.name}`, label: "" };
      }
    },
    [handlers],
  );

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || status === "thinking") return;

      setTurns((prev) => [...prev, { role: "user", content: question }]);
      setStatus("thinking");
      historyRef.current.push({ role: "user", content: question });

      const system = buildSystemPrompt(digest, handlers.getContext?.() ?? null);
      const actions: string[] = [];

      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              system,
              messages: historyRef.current,
              tools: ASSISTANT_TOOLS,
            }),
          });

          if (response.status === 503) {
            setStatus("unavailable");
            return;
          }
          if (!response.ok) throw new Error(`chat failed: ${response.status}`);

          const data = (await response.json()) as { content: string; toolCalls: ToolCall[] };

          // No tools requested: this is the final answer.
          if (!data.toolCalls?.length) {
            historyRef.current.push({ role: "assistant", content: data.content });
            setTurns((prev) => [
              ...prev,
              { role: "assistant", content: data.content, actions: actions.length ? actions : undefined },
            ]);
            setStatus("idle");
            return;
          }

          // Record the model's tool request, then run each one and feed the
          // outcome back so the next round can respond to what actually
          // happened rather than to what it assumed would happen.
          historyRef.current.push({
            role: "assistant",
            content: data.content ?? "",
            tool_calls: data.toolCalls.map((call) => ({
              id: call.id,
              type: "function" as const,
              function: { name: call.name, arguments: JSON.stringify(call.arguments) },
            })),
          });

          for (const call of data.toolCalls) {
            const { result, label } = runTool(call);
            if (label) actions.push(label);
            historyRef.current.push({
              role: "tool",
              tool_call_id: call.id,
              content: result,
            });
          }
        }

        // Ran out of rounds: stop rather than loop forever.
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Sorry — I got stuck on that one. Could you rephrase it?",
            actions: actions.length ? actions : undefined,
          },
        ]);
        setStatus("idle");
      } catch {
        setStatus("error");
      }
    },
    [digest, handlers, runTool, status],
  );

  const reset = useCallback(() => {
    historyRef.current = [];
    setTurns([]);
    setStatus("idle");
  }, []);

  return { turns, status, send, reset };
}
