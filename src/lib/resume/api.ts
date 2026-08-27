import { supabase } from "@/lib/supabase";

/**
 * Client for the resume service.
 *
 * The service is a separate FastAPI deployment (see `cv-service/`), not a
 * Vercel function, because the CV renderer is ReportLab and the layout code is
 * worth far more than the convenience of a single deploy. So this talks to an
 * absolute origin rather than a relative /api path.
 *
 * Every route on the service now sits behind Supabase auth (app/auth.py), so
 * every call here carries the visitor's access token as a bearer header.
 */

const BASE_URL = (import.meta.env.VITE_RESUME_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/** True when the frontend knows where the resume service lives. */
export const resumeApiConfigured = BASE_URL.length > 0;

// Render's free tier sleeps a service after ~15 minutes idle and takes up to
// roughly a minute to cold-start on the next request. Re-pinging more often
// than that window is just wasted requests against an instance that is
// already awake.
const WARM_UP_MIN_INTERVAL_MS = 5 * 60 * 1000;
let lastWarmUpAt = 0;

/**
 * Fire-and-forget GET to /ping, to wake a sleeping backend before the
 * visitor's first real request needs it to already be awake.
 *
 * The frontend itself never waits on this — it is a static Vercel deploy the
 * visitor sees instantly regardless of what the backend is doing. Without
 * this, though, the *backend* only starts waking up the moment the visitor
 * sends their first chat message, which makes an ordinary first message look
 * like the app has hung for the better part of a minute. Calling this as
 * early as possible (main.tsx, before React even mounts) uses the time the
 * visitor spends reading the page, signing in or uploading a file as free
 * warm-up time instead.
 *
 * `/ping` (not `/health`) on purpose: it needs no auth and does the smallest
 * possible amount of work — no settings lookup, no key-pool read — since the
 * only thing this call needs to prove is that the process is awake. A
 * scheduled job (.github/workflows/keep-warm.yml) also hits the same
 * endpoint independently of any visitor, for the same reason.
 */
export function warmUpResumeService(): void {
  if (!resumeApiConfigured) return;
  const now = Date.now();
  if (now - lastWarmUpAt < WARM_UP_MIN_INTERVAL_MS) return;
  lastWarmUpAt = now;

  fetch(`${BASE_URL}/ping`).catch(() => {
    // Silent on purpose: this is opportunistic warming, not a real request.
    // Failure here changes nothing — the visitor's actual first message
    // would simply wait out the cold start itself, exactly as it always did.
  });
}

/**
 * The signed-in visitor's bearer token, read fresh on every call.
 *
 * supabase-js keeps the session in localStorage and refreshes it in the
 * background, so this is never stale by more than the refresh cycle — reading
 * it lazily here, rather than caching it in a ref somewhere, is what makes
 * that automatic refresh actually take effect for the API calls that use it.
 */
async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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
const NOT_SIGNED_IN = "Sign in to use the CV builder.";

/**
 * How long to wait before giving up on a request.
 *
 * There was no limit at all, and on a phone that is worse than a long one: a
 * mobile network drops a connection that has been quiet for a while, `fetch`
 * rejects with a bare TypeError indistinguishable from being offline, and the
 * visitor is told to check a connection that is fine. Meanwhile the server
 * finished the work and billed for it.
 *
 * An upload is the slow one by a distance — it can pay for a vision call and
 * then a full tool loop that saves every section, inside the one request — so
 * it gets three minutes. Both numbers are deliberately generous: the point is
 * a *deterministic, recognisable* failure, not a short one.
 */
const CHAT_TIMEOUT_MS = 120_000;
const UPLOAD_TIMEOUT_MS = 180_000;

/** 408 is not a status the service sends; it is how a local give-up is
 *  labelled so the UI can tell it apart from a real network failure and go
 *  looking for work the server may have finished anyway. */
export const TIMED_OUT = 408;

/** The service's answer to a guest asking for the finished PDF. */
export const NEEDS_ACCOUNT = 402;

const TIMED_OUT_MESSAGE =
  "That took longer than expected. Checking whether it went through…";

/**
 * fetch with a deadline, turning an abort into something recognisable.
 *
 * AbortSignal.timeout is used rather than a hand-rolled AbortController plus
 * setTimeout because it cancels itself — a manual timer has to be cleared on
 * every exit path, and the one that gets missed leaks on every request.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (caught) {
    const aborted =
      caught instanceof DOMException &&
      (caught.name === "TimeoutError" || caught.name === "AbortError");
    if (aborted) throw new ResumeApiError(TIMED_OUT_MESSAGE, TIMED_OUT);
    throw caught;
  }
}

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

  if (response.status === 401) {
    throw new ResumeApiError(NOT_SIGNED_IN, response.status);
  }
  // 402 is this service's "an account is required" — a guest asking for the
  // PDF. The detail is already written for the visitor, so it passes straight
  // through; the UI catches the status to offer the account form rather than
  // just printing it.
  if (response.status === NEEDS_ACCOUNT) {
    throw new ResumeApiError(
      detail || "Create an account or log in to download your CV.",
      response.status,
    );
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

  const response = await fetchWithTimeout(
    `${BASE_URL}/chat`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ message, session_id: sessionId }),
    },
    CHAT_TIMEOUT_MS,
  );
  return parse(response);
}

export async function uploadCv(file: File, sessionId: string | null): Promise<ChatResponse> {
  if (!resumeApiConfigured) throw new ResumeApiError(NOT_CONFIGURED, 503);

  const form = new FormData();
  form.append("file", file);
  if (sessionId) form.append("session_id", sessionId);

  const response = await fetchWithTimeout(
    `${BASE_URL}/upload`,
    { method: "POST", headers: await authHeader(), body: form },
    UPLOAD_TIMEOUT_MS,
  );
  return parse(response);
}

/**
 * Fetch the finished PDF and trigger a save, as a blob.
 *
 * Used to be a plain `<a href>` pointing straight at the service. That stopped
 * working the moment the endpoint required auth: a browser navigation cannot
 * carry a custom Authorization header, only fetch() can. So this fetches the
 * bytes itself and hands the browser a local blob: URL to save instead.
 */
export async function downloadResume(sessionId: string): Promise<void> {
  return downloadFromPath(`/resume/${sessionId}.pdf`, "cv.pdf");
}

/**
 * Admin download: re-render any user's CV from its stored draft.
 * Hits /admin/resume/{id}.pdf, which the cv-service gates on the caller's
 * admin email (see app/auth.py require_admin) — a non-admin token gets a 403.
 */
export async function adminDownloadResume(sessionId: string): Promise<void> {
  return downloadFromPath(`/admin/resume/${sessionId}.pdf`, "cv.pdf");
}

async function downloadFromPath(path: string, fallbackName: string): Promise<void> {
  if (!resumeApiConfigured) throw new ResumeApiError(NOT_CONFIGURED, 503);

  const response = await fetch(`${BASE_URL}${path}`, { headers: await authHeader() });
  if (!response.ok) {
    const detail =
      // A guest asking for the file. The server is the authority on this, not
      // the button: the UI hides the download behind an account form, but a
      // session that converted a moment ago — or one restored from an old tab
      // — can still arrive here, and "could not download, try again" would be
      // both wrong and unactionable.
      response.status === NEEDS_ACCOUNT
        ? "Create an account or log in to download your CV."
        : response.status === 403
          ? "You're not authorised to download this."
          : response.status === 409
            ? "This CV has no content to render yet."
            : "Could not download the CV. Try again.";
    throw new ResumeApiError(detail, response.status);
  }

  const blob = await response.blob();
  const filename =
    response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Deferred a tick: revoking synchronously has been flaky in some browsers
  // when the click's own download handling hasn't finished reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface DraftState {
  filled: string[];
  missing: string[];
  pdf_ready: boolean;
  pdf_version: number;
  has_photo: boolean;
}

/**
 * Fetch the attached portrait as an object URL, for an <img src>.
 *
 * Same reason as the PDF: a plain <img> cannot send a bearer token, so the
 * bytes are fetched here and turned into a local blob: URL instead. Returns
 * null on any failure — the thumbnail is a nicety, not something worth
 * surfacing an error banner over.
 */
export async function fetchPhotoUrl(sessionId: string): Promise<string | null> {
  if (!resumeApiConfigured) return null;
  try {
    const response = await fetch(`${BASE_URL}/photo/${sessionId}`, {
      headers: await authHeader(),
    });
    if (!response.ok) return null;
    return URL.createObjectURL(await response.blob());
  } catch {
    return null;
  }
}

/** Detach the portrait — a CV lifted from an upload may carry one the visitor
 *  does not want, and some countries advise against photos entirely. */
export async function removePhoto(sessionId: string): Promise<void> {
  if (!resumeApiConfigured) return;
  await fetch(`${BASE_URL}/photo/${sessionId}`, { method: "DELETE", headers: await authHeader() });
}

/** What the session currently holds. Drives the "Build my CV" button. */
export async function fetchDraft(sessionId: string): Promise<DraftState | null> {
  if (!resumeApiConfigured) return null;
  try {
    const response = await fetch(`${BASE_URL}/draft/${sessionId}`, { headers: await authHeader() });
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

  const response = await fetch(`${BASE_URL}/generate/${sessionId}`, {
    method: "POST",
    headers: await authHeader(),
  });
  return parse(response);
}

/**
 * Switch the template a session will render with.
 *
 * Kept tiny on purpose: this only records the choice. The visitor still hits
 * "Build my CV" (or "Rebuild") to spend tokens on a re-render — a picker
 * change should not silently replace a file they may be reading. Returns the
 * saved style so the caller can confirm what the server accepted.
 */
export async function setSessionStyle(
  sessionId: string,
  style: string,
): Promise<string | null> {
  if (!resumeApiConfigured) return null;
  const response = await fetch(`${BASE_URL}/session/${sessionId}/style`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ style }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { style: string };
  return body.style ?? null;
}

export interface SessionSummary {
  id: string;
  name: string | null;
  style: string;
  language: string;
  pdf_version: number;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Every CV this visitor has started, for the "My Data" page.
 *
 * Backed by Postgres, not the in-memory store — see GET /sessions in
 * cv-service. Returns [] on any failure (unconfigured deployment, network
 * hiccup) rather than throwing: a listing page should show "nothing yet",
 * never an error banner, when the honest answer is just "could not check".
 */
export async function fetchSessions(): Promise<SessionSummary[]> {
  if (!resumeApiConfigured) return [];
  try {
    const response = await fetch(`${BASE_URL}/sessions`, { headers: await authHeader() });
    if (!response.ok) return [];
    const body = (await response.json()) as { sessions: SessionSummary[] };
    return body.sessions;
  } catch {
    return [];
  }
}
