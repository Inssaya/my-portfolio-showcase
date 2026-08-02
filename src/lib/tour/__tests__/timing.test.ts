import { describe, expect, it } from "vitest";
import { activeCues, revealedCharCount, spineDurationMs, tourProgress } from "../timing";
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
