/**
 * Tools the assistant can call.
 *
 * The schemas are declared once and shipped to the model by the API route,
 * while the handlers live on the client — every one of these is a UI action
 * (download a file, open a tab, navigate, resume playback), so the server has
 * nothing to execute. It only decides *that* an action should happen.
 */

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required: string[];
    };
  };
}

export const ASSISTANT_TOOLS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "send_cv",
      description:
        "Give the visitor Yassine's CV as a downloadable PDF. Call this whenever they ask for a CV, resume, or 'more details on paper'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "open_github",
      description:
        "Open Yassine's GitHub profile in a new tab. Call this when the visitor asks to see his code or repositories.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "show_project",
      description:
        "Take the visitor to a specific project. Use the exact slug given in the profile data.",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "The project's slug, exactly as listed in the profile data.",
          },
        },
        required: ["slug"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resume_tour",
      description:
        "Resume the guided tour from where it was paused. Only meaningful while the visitor is in the guided experience.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** What the client did, fed back to the model so it can acknowledge naturally. */
export interface ToolResult {
  id: string;
  name: string;
  result: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}
