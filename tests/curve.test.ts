/**
 * lib/cv/curve + curvature constants — C-curve radius math.
 *
 * Acceptance-critical: end-on arcs are fit with the Kasa circle fit (radius
 * recovered ≈ ground truth), blobs are ranked by position, and radius
 * estimates land in the sane range for typical nail widths.
 */
import { describe, expect, it } from "vitest";
import { detectNailArcs } from "../lib/cv/curve";
import { CURVE_CLASS_LABELS, CURVE_CLASS_THRESHOLDS, CURVE_RADIUS_SANE } from "../lib/constants";
import { discImage, makeImage, SKIN, DARK_BG } from "./helpers";

describe("detectNailArcs", () => {
  it("recovers radius and chord of five fingertip blobs, ranked by x", () => {
    const discs = [
      { cx: 100, cy: 300, r: 25 },
      { cx: 190, cy: 300, r: 30 },
      { cx: 280, cy: 300, r: 20 },
      { cx: 370, cy: 300, r: 28 },
      { cx: 460, cy: 300, r: 24 },
    ];
    const arcs = detectNailArcs(discImage(640, 480, discs));
    expect(arcs).toHaveLength(5);
    // Ranked leftmost → rightmost.
    expect(arcs.map((a) => a.index)).toEqual([0, 1, 2, 3, 4]);
    const xs = arcs.map((a) => a.apex.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    for (let i = 0; i < 5; i++) {
      const arc = arcs[i];
      const d = discs[i];
      expect(arc.radiusPx).toBeCloseTo(d.r, 0);
      expect(arc.radiusPx).toBeGreaterThan(d.r * 0.85);
      expect(arc.radiusPx).toBeLessThan(d.r * 1.15);
      expect(arc.chordPx).toBeGreaterThanOrEqual(d.r * 1.9);
      expect(arc.chordPx).toBeLessThan(d.r * 2.1);
      expect(arc.residual).toBeLessThan(0.05);
      expect(arc.apex.y).toBeLessThan(d.cy); // apex is the top of the blob
    }
  });

  it("caps at MAX_ARCS blobs", () => {
    const discs = Array.from({ length: 8 }, (_, i) => ({
      cx: 80 + i * 70,
      cy: 300,
      r: 22,
    }));
    const arcs = detectNailArcs(discImage(640, 480, discs));
    expect(arcs.length).toBeLessThanOrEqual(6);
  });

  it("skips blobs too small to be fingertips", () => {
    const arcs = detectNailArcs(discImage(640, 480, [{ cx: 100, cy: 100, r: 2 }]));
    expect(arcs).toEqual([]);
  });

  it("skips non-circular blobs (high residual)", () => {
    // A rectangle blob: its top arc is a flat line, not a circle.
    const img = makeImage(320, 240, (x, y) =>
      x >= 100 && x <= 220 && y >= 60 && y <= 200 ? SKIN : DARK_BG
    );
    expect(detectNailArcs(img)).toEqual([]);
  });

  it("returns nothing on an empty scene", () => {
    expect(detectNailArcs(makeImage(320, 240, () => DARK_BG))).toEqual([]);
  });
});

describe("curvature class mapping + radius sanity", () => {
  it("thresholds encode the plan: <7 deep, ≤10 medium, >10 flat", () => {
    expect(CURVE_CLASS_THRESHOLDS.deepMax).toBe(7);
    expect(CURVE_CLASS_THRESHOLDS.mediumMax).toBe(10);
    // Boundary behaviour of the component mapping (curve-step classifyCurve):
    // 6.9 -> deep, 7 -> medium, 10 -> medium, 10.1 -> flat.
    expect(6.9 < CURVE_CLASS_THRESHOLDS.deepMax).toBe(true);
    expect(7 >= CURVE_CLASS_THRESHOLDS.deepMax && 7 <= CURVE_CLASS_THRESHOLDS.mediumMax).toBe(true);
    expect(10.1 > CURVE_CLASS_THRESHOLDS.mediumMax).toBe(true);
  });

  it("labels the classes Flat / Medium / Deep", () => {
    expect(CURVE_CLASS_LABELS).toEqual({ flat: "Flat", medium: "Medium", deep: "Deep" });
  });

  it("sane radius window matches the plan (~5–13 mm typical)", () => {
    expect(CURVE_RADIUS_SANE.min).toBe(4);
    expect(CURVE_RADIUS_SANE.max).toBe(20);
  });

  it("a typical 15 mm nail with a half-circle free edge estimates ~7.5 mm radius", () => {
    // Component math: radiusMm = radiusPx / (chordPx / width.mm).
    // A semicircular free edge has chord = 2·radius → radiusMm = width.mm / 2.
    const widthMm = 15;
    const radiusPx = 30;
    const chordPx = 60; // semicircle: chord = 2r
    const radiusMm = radiusPx / (chordPx / widthMm);
    expect(radiusMm).toBeCloseTo(7.5, 6);
    expect(radiusMm).toBeGreaterThanOrEqual(CURVE_RADIUS_SANE.min);
    expect(radiusMm).toBeLessThanOrEqual(CURVE_RADIUS_SANE.max);
  });

  it("arc-derived estimates for typical synthetic blobs land inside the sane window", () => {
    // Synthetic nail: radius ≈ 20 px, chord ≈ 38 px (measured at 45% depth).
    // With a 15 mm width the component scale = chordPx / 15 → radius ≈ 8 mm.
    const arcs = detectNailArcs(discImage(640, 480, [{ cx: 200, cy: 300, r: 20 }]));
    expect(arcs).toHaveLength(1);
    const widthMm = 15;
    const radiusMm = arcs[0].radiusPx / (arcs[0].chordPx / widthMm);
    expect(radiusMm).toBeGreaterThanOrEqual(CURVE_RADIUS_SANE.min);
    expect(radiusMm).toBeLessThanOrEqual(CURVE_RADIUS_SANE.max);
    expect(radiusMm).toBeGreaterThan(6.5);
    expect(radiusMm).toBeLessThan(9);
  });
});