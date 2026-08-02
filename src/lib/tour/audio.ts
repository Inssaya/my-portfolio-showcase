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
export class HtmlAudio implements AudioPort {
  private readonly el: HTMLAudioElement;
  private endedHandler: (() => void) | null = null;

  constructor() {
    this.el = new Audio();
    this.el.preload = "auto";
    this.el.addEventListener("ended", () => this.endedHandler?.());
  }

  /** Unlock playback during a user gesture, before any clip is chosen. */
  async unlock() {
    try {
      // A muted play/pause on the element is enough to mark it user-activated.
      this.el.muted = true;
      await this.el.play().catch(() => undefined);
      this.el.pause();
      this.el.currentTime = 0;
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
