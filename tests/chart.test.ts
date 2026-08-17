/**
 * lib/chart — chart data assembly and rendering output.
 *
 * Acceptance-critical: 10 nails (L/R × thumb…pinky), labels, 1-decimal mm
 * formatting, convention-labelled sizes, accuracy caveat, out-of-range and
 * unmeasured rows without fabricated numbers.
 */
import { describe, expect, it } from "vitest";
import { ACCURACY_CAVEAT, WIDTH_CONVENTION_NOTE } from "../lib/constants";
import { buildTextSummary, chartDataFromProgress, renderChart } from "../lib/chart";
import { fullProgress, installCanvasStub, type CanvasStub } from "./helpers";

describe("chartDataFromProgress", () => {
  it("passes through tech details and all 10 nails", () => {
    const p = fullProgress();
    const chart = chartDataFromProgress(p);
    expect(chart.techName).toBe("Maya");
    expect(chart.contactHint).toBe("IG @maya.nails");
    expect(chart.measuredAt.getTime()).toBe(p.updatedAt);
    const widths = Object.values(chart.widths).flatMap((h) => Object.values(h));
    expect(widths).toHaveLength(10);
    const curves = Object.values(chart.curves).flatMap((h) => Object.values(h));
    expect(curves).toHaveLength(10);
  });

  it("flags a hand as curve-unmeasured only when all five fingers are unmeasured", () => {
    expect(chartDataFromProgress(fullProgress()).curveUnmeasuredHands).toEqual(["right"]);
    const partial = fullProgress();
    partial.curves.right.thumb = { status: "measured", class: "flat", radiusMm: 11 };
    expect(chartDataFromProgress(partial).curveUnmeasuredHands).toEqual([]);
  });
});

describe("buildTextSummary", () => {
  it("lists all 10 nails in hand/finger order with 1-decimal mm", () => {
    const text = buildTextSummary(fullProgress());
    const lines = text.split("\n");
    for (const label of [
      "Left Thumb", "Left Index", "Left Middle", "Left Ring", "Left Pinky",
      "Right Thumb", "Right Index", "Right Middle", "Right Ring", "Right Pinky",
    ]) {
      expect(lines.some((l) => l.startsWith(label + " — "))).toBe(true);
    }
    expect(text).toContain("Left Index — 15.3 mm"); // 15.25 → "15.3"
    expect(text).toContain("Right Pinky — 11.9 mm");
    expect(text).toContain("Left Thumb — 16.4 mm");
  });

  it("renders out-of-range widths without a fake number", () => {
    const text = buildTextSummary(fullProgress());
    expect(text).toContain("Left Pinky — width out of range (unmeasurable here)");
    expect(text).not.toContain("0.0 mm");
  });

  it("renders measured curves with class and ~radius, unmeasured otherwise", () => {
    const text = buildTextSummary(fullProgress());
    expect(text).toContain("Left Index — 15.3 mm · curve medium (~8.4 mm)");
    expect(text).toContain("Left Pinky — width out of range (unmeasurable here) · curvature unmeasured");
    expect(text).toContain("Left Thumb — 16.4 mm · curve deep (~6.2 mm)");
  });

  it("includes the width convention and accuracy caveat", () => {
    const text = buildTextSummary(fullProgress());
    expect(text).toContain(WIDTH_CONVENTION_NOTE);
    expect(text).toContain(ACCURACY_CAVEAT);
    expect(text).toContain("sizes for Maya");
  });
});

describe("renderChart", () => {
  it("draws the full 10-row canvas with labels, mm values and caveats", () => {
    const stub: CanvasStub = installCanvasStub();
    const canvas = renderChart(chartDataFromProgress(fullProgress()));
    const texts = stub.calls.map((c) => c.text);

    expect(canvas.width).toBe(1100);
    expect(canvas.height).toBe(168 + 10 * 64 + 56 + 210);

    // 10 nail labels.
    for (const label of [
      "Left Thumb", "Left Index", "Left Middle", "Left Ring", "Left Pinky",
      "Right Thumb", "Right Index", "Right Middle", "Right Ring", "Right Pinky",
    ]) {
      expect(texts).toContain(label);
    }

    // Widths: 1-decimal mm; out-of-range row shows no number.
    expect(texts).toContain("15.3 mm");
    expect(texts).toContain("11.9 mm");
    expect(texts).toContain("out of range");

    // Curves: class label + radius; unmeasured rows.
    expect(texts).toContain("Medium · 8.4 mm");
    expect(texts).toContain("Deep · 6.2 mm");
    expect(texts).toContain("unmeasured");

    // Footer: convention note, caveat, unmeasured-hand footnote, date.
    expect(texts).toContain(WIDTH_CONVENTION_NOTE);
    expect(texts).toContain(ACCURACY_CAVEAT);
    expect(texts).toContain("Right hand: curvature unmeasured — customer could not pose.");
    expect(texts.some((t) => t.includes("2025"))).toBe(true);
    expect(texts).toContain("Nail Sizer");
  });

  it("throws when canvas 2D context is unavailable", () => {
    installCanvasStub();
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => null }),
    };
    expect(() => renderChart(chartDataFromProgress(fullProgress()))).toThrow(/canvas unavailable/);
  });
});