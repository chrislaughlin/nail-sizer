/**
 * lib/storage — versioned localStorage progress (nail-sizer:progress:v1).
 *
 * Acceptance-critical: corrupt/foreign data is rejected; resume state
 * regenerates chart inputs without re-capture.
 */
import { afterEach, describe, expect, it } from "vitest";
import { STORAGE_KEY, STORAGE_VERSION } from "../lib/constants";
import { clearProgress, createProgressState, loadProgress, saveProgress } from "../lib/storage";
import { buildTextSummary, chartDataFromProgress } from "../lib/chart";
import { freshProgress, fullProgress, installLocalStorage, removeLocalStorage } from "./helpers";

afterEach(() => {
  removeLocalStorage();
});

describe("createProgressState", () => {
  it("starts at welcome with empty measurements", () => {
    const s = createProgressState({ sessionId: "s1", techName: "Maya", contactHint: "IG" });
    expect(s.version).toBe(STORAGE_VERSION);
    expect(s.step).toBe("welcome");
    expect(s.widths).toEqual({ left: {}, right: {} });
    expect(s.curves).toEqual({ left: {}, right: {} });
    expect(s.curveAttempts).toEqual({ left: 0, right: 0 });
    expect(s.sessionId).toBe("s1");
    expect(s.techName).toBe("Maya");
    expect(s.contactHint).toBe("IG");
  });

  it("accepts an explicit step", () => {
    expect(createProgressState({ sessionId: "s1", techName: "T", step: "width-left" }).step).toBe("width-left");
  });
});

describe("save / load round trip", () => {
  it("persists and restores a full 10-nail review state", () => {
    installLocalStorage();
    const s = fullProgress();
    saveProgress(s);
    const loaded = loadProgress(s.sessionId);
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual({ ...s, updatedAt: expect.any(Number) });
  });

  it("resumed state regenerates chart inputs without re-capture", () => {
    installLocalStorage();
    saveProgress(fullProgress());
    const resumed = loadProgress("8f14e45f-ceea-4671-9e3a-0f1a2b3c4d5e") as NonNullable<ReturnType<typeof loadProgress>>;
    expect(resumed.step).toBe("review");
    // Chart assembly works directly off the resumed state.
    const chart = chartDataFromProgress(resumed);
    expect(chart.techName).toBe("Maya");
    expect(chart.widths.left.index?.mm).toBe(15.25);
    expect(chart.curves.left.index?.class).toBe("medium");
    const text = buildTextSummary(resumed);
    expect(text).toContain("Left Index — 15.3 mm");
    expect(text).toContain("Right Pinky — 11.9 mm");
  });

  it("writes the version and storage key", () => {
    installLocalStorage();
    const stub = installLocalStorage();
    saveProgress(freshProgress());
    const raw = stub.store.get(STORAGE_KEY) as string;
    expect(JSON.parse(raw).version).toBe(STORAGE_VERSION);
  });
});

describe("corrupt / foreign data rejection", () => {
  it("returns null when nothing is stored", () => {
    installLocalStorage();
    expect(loadProgress("s1")).toBeNull();
  });

  it("returns null on invalid JSON", () => {
    const stub = installLocalStorage();
    stub.store.set(STORAGE_KEY, "{oops");
    expect(loadProgress("s1")).toBeNull();
  });

  it("returns null on non-object payloads", () => {
    const stub = installLocalStorage();
    stub.store.set(STORAGE_KEY, '"just a string"');
    expect(loadProgress("s1")).toBeNull();
  });

  it("rejects a future/foreign schema version", () => {
    const stub = installLocalStorage();
    stub.store.set(
      STORAGE_KEY,
      JSON.stringify({ version: 2, sessionId: "s1", techName: "T" })
    );
    expect(loadProgress("s1")).toBeNull();
  });

  it("rejects data for a different session", () => {
    const stub = installLocalStorage();
    stub.store.set(
      STORAGE_KEY,
      JSON.stringify({ version: 1, sessionId: "other", techName: "T" })
    );
    expect(loadProgress("s1")).toBeNull();
  });

  it("rejects state without a techName", () => {
    const stub = installLocalStorage();
    stub.store.set(
      STORAGE_KEY,
      JSON.stringify({ version: 1, sessionId: "s1" })
    );
    expect(loadProgress("s1")).toBeNull();
  });
});

describe("clearProgress", () => {
  it("removes only the matching session's data", () => {
    const stub = installLocalStorage();
    saveProgress(freshProgress({ sessionId: "mine" }));
    saveProgress(freshProgress({ sessionId: "other" }));
    clearProgress("mine");
    expect(loadProgress("mine")).toBeNull();
    expect(loadProgress("other")).not.toBeNull();
    expect(stub.store.has(STORAGE_KEY)).toBe(true);
  });
});

describe("degraded environments", () => {
  it("loadProgress returns null without localStorage", () => {
    expect(loadProgress("s1")).toBeNull();
  });

  it("saveProgress tolerates quota failures", () => {
    installLocalStorage(true);
    expect(() => saveProgress(freshProgress())).not.toThrow();
    expect(loadProgress("8f14e45f-ceea-4671-9e3a-0f1a2b3c4d5e")).toBeNull();
  });
});