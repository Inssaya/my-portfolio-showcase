import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChatResponse,
  ResumeApiError,
  downloadResume,
  fetchDraft,
  fetchPhotoUrl,
  generateResume,
  removePhoto,
  resumeApiConfigured,
  sendMessage,
  uploadCv,
} from "./api";

export interface ResumeTurn {
  role: "user" | "assistant";
  content: string;
  /** What the agent did on this turn, rendered as chips. */
  actions?: string[];
  /** Set on the turn where a PDF became available, so the download button
   *  appears attached to that message rather than floating. */
  pdfVersion?: number;
}

export type ResumeStatus = "idle" | "thinking" | "uploading" | "unavailable" | "error";

/** Session id survives a reload so a half-finished CV is not lost to a stray
 *  refresh. Sessions expire server-side, which the 404 path below handles.
 *  It is also user-scoped server-side now — a stale id from a previous
 *  account on a shared browser just falls through to a fresh session rather
 *  than erroring, see SessionStore.get_or_create. */
const SESSION_KEY = "resume_session_id";

function readStoredSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function storeSession(id: string): void {
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {
    // Private mode or storage disabled — the session still works for this tab,
    // it just will not survive a reload.
  }
}

export function useResumeChat() {
  const [turns, setTurns] = useState<ResumeTurn[]>([]);
  const [status, setStatus] = useState<ResumeStatus>(
    resumeApiConfigured ? "idle" : "unavailable",
  );
  const [error, setError] = useState<string | null>(null);
  const [pdfVersion, setPdfVersion] = useState(0);
  /** True once the draft holds enough to render, so the UI can offer the
   *  button whether or not the model ever decides to generate. */
  const [canBuild, setCanBuild] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(false);
  /** A local blob: URL for the attached portrait, or null while there isn't
   *  one. <img> cannot carry the bearer token the /photo endpoint now
   *  requires, so the bytes are fetched once here instead of pointed at
   *  directly — see fetchPhotoUrl in api.ts. */
  const [photoBlobUrl, setPhotoBlobUrl] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(readStoredSession());
  const photoBlobUrlRef = useRef<string | null>(null);

  const busy = status === "thinking" || status === "uploading";

  const setPhoto = useCallback((url: string | null) => {
    // Each object URL pins the blob in memory until revoked; without this a
    // long session that swaps photos a few times would leak one per swap.
    if (photoBlobUrlRef.current) URL.revokeObjectURL(photoBlobUrlRef.current);
    photoBlobUrlRef.current = url;
    setPhotoBlobUrl(url);
  }, []);

  // Revoke on unmount too — leaving the CV builder mid-session must not leak
  // the last photo's blob for the rest of the tab's life.
  useEffect(() => {
    return () => {
      if (photoBlobUrlRef.current) URL.revokeObjectURL(photoBlobUrlRef.current);
    };
  }, []);

  /** Ask the server what the draft actually holds, rather than inferring it
   *  from what the model claimed in prose. */
  const refreshDraft = useCallback(
    async (sessionId: string) => {
      const draft = await fetchDraft(sessionId);
      if (!draft) return;
      // A name alone is not a CV; the server refuses to render one, so offering
      // the button then would just produce an error.
      const substantive = draft.filled.filter(
        (field) => field !== "full_name" && field !== "headline",
      );
      setCanBuild(substantive.length > 0);
      setPdfVersion(draft.pdf_version);

      setHasPhoto((was) => {
        if (was === draft.has_photo) return was;
        if (draft.has_photo) {
          void fetchPhotoUrl(sessionId).then(setPhoto);
        } else {
          setPhoto(null);
        }
        return draft.has_photo;
      });
    },
    [setPhoto],
  );

  const applyResponse = useCallback(
    (data: ChatResponse) => {
      sessionRef.current = data.session_id;
      storeSession(data.session_id);
      setPdfVersion(data.pdf_version);
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          actions: data.actions.length ? data.actions : undefined,
          pdfVersion: data.pdf_ready ? data.pdf_version : undefined,
        },
      ]);
      setStatus("idle");
      void refreshDraft(data.session_id);
    },
    [refreshDraft],
  );

  const handleFailure = useCallback((caught: unknown) => {
    if (caught instanceof ResumeApiError) {
      // An expired session should not strand the visitor: drop it so the next
      // message starts a fresh one rather than 404ing forever.
      if (caught.status === 404) sessionRef.current = null;
      setError(caught.message);
      setStatus(caught.status === 503 ? "unavailable" : "error");
      return;
    }
    setError("Could not reach the CV builder. Check your connection and try again.");
    setStatus("error");
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy || status === "unavailable") return;

      setError(null);
      setTurns((prev) => [...prev, { role: "user", content: message }]);
      setStatus("thinking");

      try {
        applyResponse(await sendMessage(message, sessionRef.current));
      } catch (caught) {
        handleFailure(caught);
      }
    },
    [applyResponse, busy, handleFailure, status],
  );

  const upload = useCallback(
    async (file: File) => {
      if (busy || status === "unavailable") return;

      setError(null);
      setTurns((prev) => [
        ...prev,
        { role: "user", content: `Uploaded **${file.name}**` },
      ]);
      setStatus("uploading");

      try {
        applyResponse(await uploadCv(file, sessionRef.current));
      } catch (caught) {
        handleFailure(caught);
      }
    },
    [applyResponse, busy, handleFailure, status],
  );

  /** Render the draft directly, bypassing the model entirely. */
  const build = useCallback(async () => {
    const sessionId = sessionRef.current;
    if (!sessionId || busy) return;

    setError(null);
    setStatus("thinking");
    try {
      applyResponse(await generateResume(sessionId));
    } catch (caught) {
      handleFailure(caught);
    }
  }, [applyResponse, busy, handleFailure]);

  /** Save the rendered PDF. A separate action from `build`: building creates
   *  or updates the file server-side, this fetches the existing one — the
   *  download button on an older turn re-fetches that same version rather
   *  than re-rendering. */
  const download = useCallback(async () => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    try {
      await downloadResume(sessionId);
    } catch (caught) {
      handleFailure(caught);
    }
  }, [handleFailure]);

  const dropPhoto = useCallback(async () => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    await removePhoto(sessionId);
    setHasPhoto(false);
    setPhoto(null);
  }, [setPhoto]);

  const reset = useCallback(() => {
    sessionRef.current = null;
    setCanBuild(false);
    setHasPhoto(false);
    setPhoto(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
    setTurns([]);
    setPdfVersion(0);
    setError(null);
    setStatus(resumeApiConfigured ? "idle" : "unavailable");
  }, [setPhoto]);

  return {
    turns,
    status,
    error,
    busy,
    pdfVersion,
    canBuild,
    hasPhoto,
    photoBlobUrl,
    sessionId: sessionRef.current,
    send,
    upload,
    build,
    download,
    dropPhoto,
    reset,
  };
}
