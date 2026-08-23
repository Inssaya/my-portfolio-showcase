import { describe, expect, it } from "vitest";
import {
  activeBeatIndex,
  activeCues,
  captionBeats,
  revealedCharCount,
  spineDurationMs,
  tourProgress,
} from "../timing";
import { TourSegment, VisualCue } from "../types";

/** Evenly spaced timings, one per character. */
const timings = (count: number, step = 100) =>
  Array.from({ length: count }, (_, i) => i * step);

describe("revealedCharCount", () => {
  it("reveals nothing before the first character is due", () => {
    expect(revealedCharCount(timings(5), -10)).toBe(0);
  });

  it("reveals the first character the moment its timing is reached", () => {
    expect(revealedCharCount(timings(5), 0)).toBe(1);
  });

  it("reveals everything once past the last timing", () => {
    expect(revealedCharCount(timings(5), 400)).toBe(5);
    expect(revealedCharCount(timings(5), 99999)).toBe(5);
  });

  it("reveals characters progressively", () => {
    const t = timings(5); // 0, 100, 200, 300, 400
    expect(revealedCharCount(t, 50)).toBe(1);
    expect(revealedCharCount(t, 100)).toBe(2);
    expect(revealedCharCount(t, 150)).toBe(2);
    expect(revealedCharCount(t, 250)).toBe(3);
  });

  it("never goes backwards as time advances", () => {
    const t = timings(200, 7);
    let previous = 0;
    for (let ms = 0; ms < 1500; ms += 3) {
      const count = revealedCharCount(t, ms);
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
  });

  it("handles an empty segment", () => {
    expect(revealedCharCount([], 500)).toBe(0);
  });

  it("agrees with a linear scan", () => {
    const t = timings(64, 13);
    for (let ms = -5; ms < 900; ms += 1) {
      const scan = t.filter((v) => v <= ms).length;
      expect(revealedCharCount(t, ms)).toBe(scan);
    }
  });
});

describe("activeCues", () => {
  const cues: VisualCue[] = [
    { atMs: 0, outMs: 500, type: "title", label: "a" },
    { atMs: 200, type: "image", src: "/x.jpg" },
    { atMs: 800, outMs: 1000, type: "fact", label: "b" },
  ];

  it("includes a cue from its start time", () => {
    expect(activeCues(cues, 0).map((c) => c.type)).toEqual(["title"]);
    expect(activeCues(cues, 200).map((c) => c.type)).toEqual(["title", "image"]);
  });

  it("drops a cue once its out time is reached", () => {
    expect(activeCues(cues, 500).map((c) => c.type)).toEqual(["image"]);
  });

  it("keeps cues without an out time until the end", () => {
    expect(activeCues(cues, 5000).map((c) => c.type)).toEqual(["image"]);
  });

  it("returns nothing for an empty list", () => {
    expect(activeCues([], 100)).toEqual([]);
  });
});

const segment = (over: Partial<TourSegment> & { id: string }): TourSegment => ({
  kind: "narration",
  text: "",
  audio: "",
  durationMs: 1000,
  charTimingsMs: [],
  cues: [],
  next: null,
  ...over,
});

describe("tourProgress", () => {
  const segments = [
    segment({ id: "a" }),
    segment({ id: "b" }),
    segment({ id: "c", kind: "checkpoint" }),
    segment({ id: "p1", projectSlug: "proj" }),
  ];

  it("advances across the linear spine", () => {
    expect(tourProgress(segments, "a", 0)).toBeCloseTo(0);
    expect(tourProgress(segments, "a", 1000)).toBeCloseTo(1 / 3);
    expect(tourProgress(segments, "b", 0)).toBeCloseTo(1 / 3);
  });

  it("holds at the checkpoint during a project detour, rather than jumping back", () => {
    // "p1" is not on the spine, so progress parks at the checkpoint position.
    expect(tourProgress(segments, "p1", 500)).toBeCloseTo(2 / 3);
  });

  it("never exceeds one", () => {
    expect(tourProgress(segments, "c", 999999)).toBeLessThanOrEqual(1);
  });

  it("copes with no segments", () => {
    expect(tourProgress([], null, 0)).toBe(0);
  });
});

describe("captionBeats", () => {
  it("returns nothing for empty text", () => {
    expect(captionBeats("")).toEqual([]);
  });

  it("keeps a short single sentence as one beat", () => {
    const text = "Pick the one that catches your curiosity, and I'll walk you through it.";
    const beats = captionBeats(text);
    expect(beats).toEqual([{ start: 0, end: text.length }]);
  });

  it("gives each short sentence its own beat", () => {
    const text = "This one replaced a spreadsheet. It was tracked in Excel, by hand.";
    const beats = captionBeats(text);
    expect(beats.map((b) => text.slice(b.start, b.end))).toEqual([
      "This one replaced a spreadsheet. ",
      "It was tracked in Excel, by hand.",
    ]);
  });

  it("splits a sentence longer than the limit at a comma", () => {
    // One sentence, no natural break except commas, well past 90 characters.
    const text =
      "I like taking ideas and turning them into real-world projects, that are stable, useful, " +
      "and built to succeed in today's competitive world, no matter what it takes to get there.";
    const beats = captionBeats(text);
    expect(beats.length).toBeGreaterThan(1);
    for (const beat of beats) {
      expect(beat.end - beat.start).toBeLessThanOrEqual(110); // some slack past MAX_BEAT_CHARS for the tail
    }
  });

  it("keeps a long sentence with no comma as a single beat rather than cutting mid-word", () => {
    const text = "Supercalifragilisticexpialidocious ".repeat(6).trim() + ".";
    const beats = captionBeats(text);
    expect(beats).toEqual([{ start: 0, end: text.length }]);
  });

  it("covers the whole text contiguously with no gaps or overlaps", () => {
    const text =
      "Hey, I'm Yassine — a final-year engineering student in AI & Data Science. I like taking " +
      "ideas and turning them into real-world projects that are stable, useful, and built to " +
      "succeed in today's competitive world, and I'm looking for a 6-month PFE internship in " +
      "Morocco or abroad, ideally with a company where I can grow, contribute, and hopefully " +
      "continue working together after the internship, while also being open to freelance work.";
    const beats = captionBeats(text);
    expect(beats[0].start).toBe(0);
    expect(beats[beats.length - 1].end).toBe(text.length);
    for (let i = 0; i < beats.length - 1; i++) {
      expect(beats[i].end).toBe(beats[i + 1].start);
    }
    // The real intro text — multiple readable beats, not one wall of text.
    expect(beats.length).toBeGreaterThan(1);
  });
});

describe("activeBeatIndex", () => {
  const beats = [
    { start: 0, end: 10 },
    { start: 10, end: 20 },
    { start: 20, end: 30 },
  ];
  // Character i is revealed at 10ms * i.
  const charTimings = timings(30, 10);

  it("starts at the first beat", () => {
    expect(activeBeatIndex(beats, charTimings, 0)).toBe(0);
  });

  it("advances once the next beat's first character is reached", () => {
    expect(activeBeatIndex(beats, charTimings, 99)).toBe(0);
    expect(activeBeatIndex(beats, charTimings, 100)).toBe(1);
    expect(activeBeatIndex(beats, charTimings, 200)).toBe(2);
  });

  it("never goes backwards as time advances", () => {
    let previous = 0;
    for (let ms = 0; ms < 400; ms += 5) {
      const index = activeBeatIndex(beats, charTimings, ms);
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
  });

  it("returns 0 for no beats", () => {
    expect(activeBeatIndex([], charTimings, 500)).toBe(0);
  });
});

describe("spineDurationMs", () => {
  it("excludes project segments", () => {
    const segments = [
      segment({ id: "a", durationMs: 1000 }),
      segment({ id: "b", durationMs: 2000 }),
      segment({ id: "p", durationMs: 9000, projectSlug: "proj" }),
    ];
    expect(spineDurationMs(segments)).toBe(3000);
  });
});
