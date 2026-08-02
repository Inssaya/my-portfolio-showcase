import { beforeEach, describe, expect, it } from "vitest";
import { AudioPort, TourEngine } from "../engine";
import { TourManifest, TourSegment } from "../types";

/**
 * A fake clip player. Nothing is decoded and no time passes on its own — a test
 * calls `finish()` to end the current clip, which is what makes the whole state
 * machine deterministic.
 */
class FakeAudio implements AudioPort {
  src: string | null = null;
  playing = false;
  muted = false;
  position = 0;
  destroyed = false;
  loads: string[] = [];
  private ended: (() => void) | null = null;

  load(src: string) {
    this.src = src;
    this.loads.push(src);
    this.position = 0;
    this.playing = false;
  }
  play() {
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  currentMs() {
    return this.position;
  }
  seek(ms: number) {
    this.position = ms;
  }
  onEnded(handler: () => void) {
    this.ended = handler;
  }
  setMuted(muted: boolean) {
    this.muted = muted;
  }
  destroy() {
    this.destroyed = true;
  }

  /** Simulate the clip reaching its end. */
  finish() {
    this.playing = false;
    this.ended?.();
  }
}

const segment = (over: Partial<TourSegment> & { id: string }): TourSegment => ({
  kind: "narration",
  text: `text of ${over.id}`,
  audio: `/tour/audio/${over.id}.mp3`,
  durationMs: 1000,
  charTimingsMs: [],
  cues: [],
  next: null,
  ...over,
});

const manifest: TourManifest = {
  version: "1",
  generatedAt: "",
  voice: "onyx",
  segments: [
    segment({ id: "greeting", kind: "greeting", next: "intro" }),
    segment({ id: "intro", next: "list" }),
    segment({ id: "list", kind: "project-list", next: "checkpoint" }),
    segment({ id: "checkpoint", kind: "checkpoint", next: null }),
    segment({ id: "p-1", kind: "project-intro", projectSlug: "proj", next: "p-2" }),
    segment({ id: "p-2", kind: "project-outro", projectSlug: "proj", next: null }),
    segment({ id: "closing", kind: "closing", next: null }),
  ],
};

const chains = { proj: ["p-1", "p-2"] };

let audio: FakeAudio;
let engine: TourEngine;

beforeEach(() => {
  audio = new FakeAudio();
  engine = new TourEngine({ manifest, audio, chains, closingSegmentId: "closing" });
});

describe("linear playback", () => {
  it("starts idle", () => {
    expect(engine.getState().status).toBe("idle");
  });

  it("plays the first segment on start", () => {
    engine.start();
    const state = engine.getState();
    expect(state.status).toBe("playing");
    expect(state.segment?.id).toBe("greeting");
    expect(audio.src).toBe("/tour/audio/greeting.mp3");
    expect(audio.playing).toBe(true);
  });

  it("advances through the chain as clips finish", () => {
    engine.start();
    audio.finish();
    expect(engine.getState().segment?.id).toBe("intro");
    audio.finish();
    expect(engine.getState().segment?.id).toBe("list");
  });

  it("stops at the checkpoint instead of running on", () => {
    engine.start();
    audio.finish(); // greeting -> intro
    audio.finish(); // intro -> list
    audio.finish(); // list -> checkpoint (its own line now narrates)
    audio.finish(); // checkpoint line finished
    expect(engine.getState().status).toBe("checkpoint");
    expect(audio.playing).toBe(false);
  });
});

describe("project detours", () => {
  const toCheckpoint = () => {
    engine.start();
    audio.finish();
    audio.finish();
    audio.finish();
    audio.finish();
  };

  it("plays a project chain when one is selected", () => {
    toCheckpoint();
    engine.selectProject("proj");
    expect(engine.getState().segment?.id).toBe("p-1");
    expect(engine.getState().activeProject).toBe("proj");
  });

  it("returns to the checkpoint after the last slide and records the visit", () => {
    toCheckpoint();
    engine.selectProject("proj");
    audio.finish(); // p-1 -> p-2
    expect(engine.getState().segment?.id).toBe("p-2");
    audio.finish(); // end of chain
    const state = engine.getState();
    expect(state.status).toBe("checkpoint");
    expect(state.visited).toEqual(["proj"]);
    expect(state.activeProject).toBeNull();
  });

  it("does not record the same project twice", () => {
    toCheckpoint();
    engine.selectProject("proj");
    audio.finish();
    audio.finish();
    engine.selectProject("proj");
    audio.finish();
    audio.finish();
    expect(engine.getState().visited).toEqual(["proj"]);
  });

  it("ignores an unknown project", () => {
    toCheckpoint();
    engine.selectProject("nope");
    expect(engine.getState().status).toBe("checkpoint");
  });
});

describe("interruption", () => {
  it("freezes playback and can resume from the same position", () => {
    engine.start();
    audio.position = 420;
    engine.interrupt();

    const state = engine.getState();
    expect(state.status).toBe("interrupted");
    expect(state.positionMs).toBe(420);
    expect(audio.playing).toBe(false);

    engine.resume();
    expect(engine.getState().status).toBe("playing");
    expect(audio.playing).toBe(true);
    // Resuming must not restart the clip.
    expect(audio.loads).toEqual(["/tour/audio/greeting.mp3"]);
  });

  it("distinguishes pause from interrupt", () => {
    engine.start();
    engine.pause();
    expect(engine.getState().status).toBe("paused");
    engine.resume();
    expect(engine.getState().status).toBe("playing");
  });

  it("can be interrupted at a checkpoint without losing the checkpoint", () => {
    engine.start();
    audio.finish();
    audio.finish();
    audio.finish();
    audio.finish();
    engine.interrupt();
    expect(engine.getState().status).toBe("interrupted");
    expect(engine.getState().segment?.id).toBe("checkpoint");
  });

  it("ignores resume when nothing is paused", () => {
    engine.start();
    engine.resume();
    expect(engine.getState().status).toBe("playing");
  });
});

describe("skip", () => {
  it("moves to the next segment immediately", () => {
    engine.start();
    engine.skip();
    expect(engine.getState().segment?.id).toBe("intro");
  });

  it("does nothing at a checkpoint", () => {
    engine.start();
    audio.finish();
    audio.finish();
    audio.finish();
    audio.finish();
    engine.skip();
    expect(engine.getState().status).toBe("checkpoint");
  });
});

describe("finish", () => {
  it("plays the closing segment", () => {
    engine.start();
    audio.finish();
    audio.finish();
    audio.finish();
    audio.finish();
    engine.finish();
    expect(engine.getState().segment?.id).toBe("closing");
    audio.finish();
    expect(engine.getState().status).toBe("ended");
  });
});

describe("status report", () => {
  it("describes where the visitor is, for the assistant", () => {
    engine.start();
    audio.finish(); // greeting narrated

    const report = engine.getStatusReport();
    expect(report.mode).toBe("experience");
    expect(report.currentSegmentId).toBe("intro");
    expect(report.narratedSoFar).toEqual(["text of greeting"]);
    expect(report.progressPct).toBeGreaterThan(0);
  });

  it("names the project being explored", () => {
    engine.start();
    audio.finish();
    audio.finish();
    audio.finish();
    audio.finish();
    engine.selectProject("proj");
    expect(engine.getStatusReport().activeProject).toBe("proj");
  });

  it("reports visited projects", () => {
    engine.start();
    audio.finish();
    audio.finish();
    audio.finish();
    audio.finish();
    engine.selectProject("proj");
    audio.finish();
    audio.finish();
    expect(engine.getStatusReport().visitedProjects).toEqual(["proj"]);
  });
});

describe("subscription", () => {
  it("emits the current state immediately and on change", () => {
    const seen: string[] = [];
    const unsubscribe = engine.subscribe((s) => seen.push(s.status));
    expect(seen).toEqual(["idle"]);

    engine.start();
    expect(seen).toContain("playing");

    unsubscribe();
    const before = seen.length;
    engine.pause();
    expect(seen.length).toBe(before);
  });

  it("tick only updates position while playing", () => {
    engine.start();
    audio.position = 250;
    engine.tick();
    expect(engine.getState().positionMs).toBe(250);

    engine.pause();
    audio.position = 900;
    engine.tick();
    expect(engine.getState().positionMs).toBe(250);
  });
});

describe("lifecycle", () => {
  it("destroys the audio port and drops listeners", () => {
    const seen: string[] = [];
    engine.subscribe((s) => seen.push(s.status));
    engine.destroy();
    expect(audio.destroyed).toBe(true);

    const before = seen.length;
    engine.start();
    expect(seen.length).toBe(before);
  });

  it("forwards mute", () => {
    engine.setMuted(true);
    expect(audio.muted).toBe(true);
  });
});
