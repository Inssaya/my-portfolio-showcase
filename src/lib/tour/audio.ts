import { AudioPort } from "./engine";

/**
 * The real `AudioPort`, backed by a single HTMLAudioElement.
 *
 * One element is reused for every segment rather than one per clip: browsers
 * only grant autoplay to elements that have already been unlocked by a user
 * gesture, and that permission does not transfer to a freshly constructed
 * element. Reusing the one the visitor's click unlocked is what lets the tour
 * play straight through without a second prompt.
 */
/**
 * 20 milliseconds of silence, inline.
 *
 * `play()` on an element with no source never settles: resource selection sits
 * waiting for a source that will never arrive, so the returned promise stays
 * pending forever. Awaiting it during unlock would hang the tour before it
 * started. Giving the element something real to play makes the promise settle.
 */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRmQBAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUABAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAA";

/** Never let the unlock stall the tour, however the browser behaves. */
const UNLOCK_TIMEOUT_MS = 800;

export class HtmlAudio implements AudioPort {
  private readonly el: HTMLAudioElement;
  private endedHandler: (() => void) | null = null;

  constructor() {
    this.el = new Audio();
    this.el.preload = "auto";
    this.el.addEventListener("ended", () => this.endedHandler?.());
  }

  /**
   * Unlock playback during a user gesture, before any clip is chosen.
   *
   * Every step here is best-effort. The element has no source yet, so browsers
   * are within their rights to reject the play() and to throw on the seek that
   * follows — and if either escaped, the tour would never start at all. The
   * unlock is an optimisation; failing it must never block playback.
   */
  async unlock() {
    try {
      // A muted play/pause on a real source marks the element user-activated.
      this.el.muted = true;
      this.el.src = SILENT_WAV;

      await Promise.race([
        this.el.play().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, UNLOCK_TIMEOUT_MS)),
      ]);

      this.el.pause();
      this.el.currentTime = 0;
    } catch {
      // Nothing to recover: the first real clip will request playback itself,
      // which is still inside the original gesture.
    } finally {
      this.el.muted = false;
    }
  }

  load(src: string) {
    this.el.src = src;
    this.el.currentTime = 0;
  }

  async play() {
    try {
      await this.el.play();
    } catch {
      // Autoplay refused, or the element was torn down mid-await. The engine
      // stays in "playing" and the visitor can nudge it; throwing here would
      // strand the tour with no way forward.
    }
  }

  pause() {
    this.el.pause();
  }

  currentMs() {
    return this.el.currentTime * 1000;
  }

  seek(ms: number) {
    this.el.currentTime = ms / 1000;
  }

  onEnded(handler: () => void) {
    this.endedHandler = handler;
  }

  setMuted(muted: boolean) {
    this.el.muted = muted;
  }

  destroy() {
    this.el.pause();
    this.el.src = "";
    this.endedHandler = null;
  }

  /** Warm the browser cache for the next clip while the current one plays. */
  static preload(src: string) {
    const el = new Audio();
    el.preload = "auto";
    el.src = src;
  }
}
