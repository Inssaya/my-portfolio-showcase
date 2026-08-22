/**
 * Client for the resume service.
 *
 * The service is a separate FastAPI deployment (see `cv-service/`), not a
 * Vercel function, because the CV renderer is ReportLab and the layout code is
 * worth far more than the convenience of a single deploy. So this talks to an
 * absolute origin rather than a relative /api path.
 */

const BASE_URL = (import.meta.env.VITE_RESUME_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/** True when the frontend knows where the resume service lives. */
export const resumeApiConfigured = BASE_URL.length > 0;

export interface ChatResponse {
  session_id: string;
  reply: string;
  actions: string[];
  pdf_ready: boolean;
  pdf_version: number;
  usage: { prompt: number; completion: number; total: number };
}

/** Thrown with a message already fit to show the visitor. */
export class ResumeApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const NOT_CONFIGURED =
  "The CV builder isn't switched on for this deployment yet.";

async function parse(response: Response): Promise<ChatResponse> {
  if (response.ok) return (await response.json()) as ChatResponse;

  // FastAPI puts the human-readable reason in `detail`; the upload endpoint
  // relies on that to explain a scanned PDF or an unsupported format.
  //
  // A 429 sends an object instead of a string, because a rate-limited turn may
  // already have saved work and spent tokens before it stopped — the message is
  // then one field among several. Both shapes are handled so neither endpoint
  // can surface "[object Object]" at a visitor.
  let detail = "";
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") {
      detail = body.detail;
    } else if (typeof body?.detail?.message === "string") {
      detail = body.detail.message;
    } else if (Array.isArray(body?.detail)) {
      // FastAPI validation errors are an array of field problems. Rendering
      // that object is what turned "your CV is too long to paste" into an
      // unreadable failure — so it gets a sentence a person can act on.
      detail =
        response.status === 422
          ? "That message is too long to send. Try uploading the file instead."
          : "";
    }
  } catch {
    // Non-JSON error body — fall through to the status-based message.
  }

  if (response.status === 503 || detail === "not_configured") {
    throw new ResumeApiError(NOT_CONFIGURED, response.status);
  }
  if (detail) throw new ResumeApiError(detail, response.status);
  if (response.status === 502) {
    throw new ResumeApiError(
      "The writing model is unreachable right now. Try again in a moment.",
      response.status,
    );
  }
  throw new ResumeApiError("Something went wrong. Try again in a moment.", response.status);
}

export async function sendMessage(message: string, sessionId: string | null): Promise<ChatResponse> {
  if (!resumeApiConfigured) throw new ResumeApiError(NOT_CONFIGURED, 503);

  const response = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  return parse(response);
}

export async function uploadCv(file: File, sessionId: string | null): Promise<ChatResponse> {
  if (!resumeApiConfigured) throw new ResumeApiError(NOT_CONFIGURED, 503);

  const form = new FormData();
  form.append("file", file);
  if (sessionId) form.append("session_id", sessionId);

  const response = await fetch(`${BASE_URL}/upload`, { method: "POST", body: form });
  return parse(response);
}

/** Where the finished PDF lives. Used as an <a href>, so no fetch involved. */
export function resumeDownloadUrl(sessionId: string): string {
  return `${BASE_URL}/resume/${sessionId}.pdf`;
}

export interface DraftState {
  filled: string[];
  missing: string[];
  pdf_ready: boolean;
  pdf_version: number;
  has_photo: boolean;
}

/** The attached portrait. `v` busts the cache when it is replaced. */
export function photoUrl(sessionId: string, version: number): string {
  return `${BASE_URL}/photo/${sessionId}?v=${version}`;
}

/** Detach the portrait — a CV lifted from an upload may carry one the visitor
 *  does not want, and some countries advise against photos entirely. */
export async function removePhoto(sessionId: string): Promise<void> {
  if (!resumeApiConfigured) return;
  await fetch(`${BASE_URL}/photo/${sessionId}`, { method: "DELETE" });
}

/** What the session currently holds. Drives the "Build my CV" button. */
export async function fetchDraft(sessionId: string): Promise<DraftState | null> {
  if (!resumeApiConfigured) return null;
  try {
    const response = await fetch(`${BASE_URL}/draft/${sessionId}`);
    if (!response.ok) return null;
    return (await response.json()) as DraftState;
  } catch {
    // The draft panel is an affordance, not the conversation — a failed poll
    // should never surface an error over a working chat.
    return null;
  }
}

/**
 * Render the draft with no model involved.
 *
 * The escape hatch behind the "Build my CV" button. The agent is supposed to
 * generate when the visitor approves, but it has more than once announced the
 * CV was ready having called nothing — leaving somebody with a finished draft
 * and no file. This path is pure server state, so it works regardless.
 */
export async function generateResume(sessionId: string): Promise<ChatResponse> {
  if (!resumeApiConfigured) throw new ResumeApiError(NOT_CONFIGURED, 503);

  const response = await fetch(`${BASE_URL}/generate/${sessionId}`, { method: "POST" });
  return parse(response);
}
