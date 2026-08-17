/**
 * lib/cv/card — card calibration acceptance criteria:
 *  - scale computed from the long edge only (85.6 mm),
 *  - business-card (1.75:1) refused,
 *  - near-nadir tilt warning (~±0.5 mm on a 15 mm nail ≈ 3.3% scale error),
 *  - corner-radius variance tolerated (CR80 cards have ~3 mm radii).
 */
import { describe, expect, it } from "vitest";
import {
  BIZCARD_ASPECT_MAX,
  BIZCARD_ASPECT_MIN,
  CARD_ASPECT,
  CARD_ASPECT_MAX,
  CARD_ASPECT_MIN,
  TILT_WARN_RATIO,
} from "../lib/constants";
import { correctedAspect, detectCard, isTilted, quadFromCorners } from "../lib/cv/card";
import type { CardQuad } from "../lib/types";
import { cardImage, DARK_BG, CARD_WHITE, makeImage } from "./helpers";

function flatQuad(w: number, h: number): CardQuad {
  return quadFromCorners([
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]) as CardQuad;
}

describe("scale from the long edge only (85.6 mm)", () => {
  it("pxPerMm = long edge / 85.6, landscape", () => {
    const q = flatQuad(856, 540);
    expect(q.pxPerMm).toBeCloseTo(10, 6);
    expect(q.longEdgePx).toBe(856);
  });

  it("pxPerMm uses the long edge even when the card is portrait", () => {
    const q = quadFromCorners([
      { x: 0, y: 0 },
      { x: 540, y: 0 },
      { x: 540, y: 856 },
      { x: 0, y: 856 },
    ]) as CardQuad;
    expect(q.pxPerMm).toBeCloseTo(10, 6);
    expect(q.longEdgePx).toBe(856);
  });

  it("scale is independent of corner placement order", () => {
    const q = quadFromCorners([
      { x: 0, y: 540 },
      { x: 856, y: 540 },
      { x: 856, y: 0 },
      { x: 0, y: 0 },
    ]) as CardQuad;
    expect(q.pxPerMm).toBeCloseTo(10, 6);
  });

  it("rejects quads without exactly 4 corners", () => {
    expect(quadFromCorners([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBeNull();
  });
});

describe("aspect classification (ID-1 vs business card)", () => {
  it("flat ID-1 quad corrects to the nominal aspect", () => {
    const q = flatQuad(856, 540);
    expect(correctedAspect(q)).toBeCloseTo(CARD_ASPECT, 4);
    expect(correctedAspect(q)).toBeGreaterThanOrEqual(CARD_ASPECT_MIN);
    expect(correctedAspect(q)).toBeLessThanOrEqual(CARD_ASPECT_MAX);
  });

  it("refuses a 1.75:1 business-card quad (manual path)", () => {
    const q = flatQuad(875, 500);
    const aspect = correctedAspect(q);
    expect(aspect).toBeGreaterThanOrEqual(BIZCARD_ASPECT_MIN);
    expect(aspect).toBeLessThanOrEqual(BIZCARD_ASPECT_MAX);
  });

  it("refuses a 1.75:1 business card photo (automatic path)", () => {
    const img = cardImage({ w: 640, h: 480, cardW: 525, cardH: 300 });
    const det = detectCard(img);
    expect(det.kind).toBe("business-card");
  });

  it("still refuses a business card with rounded corners (quad fit + aspect together)", () => {
    // Rounded corners route through fitQuadFromHull; the fitted quad must
    // still classify as business-card, not drift into the ID-1 band.
    const img = cardImage({ w: 640, h: 480, cardW: 525, cardH: 300, radius: 19 });
    const det = detectCard(img);
    expect(det.kind).toBe("business-card");
    if (det.kind === "unknown") {
      // Diagnostic: even a misclassification should see the ~1.75 aspect.
      expect(det.detectedAspect).toBeGreaterThanOrEqual(1.7);
    }
  });

  it("accepts an ID-1 card photo automatically", () => {
    const img = cardImage({ w: 640, h: 480, cardW: 540, cardH: 340 });
    const det = detectCard(img);
    expect(det.kind).toBe("ok");
    if (det.kind === "ok") {
      expect(correctedAspect(det.quad)).toBeCloseTo(CARD_ASPECT, 3);
      expect(det.quad.pxPerMm).toBeGreaterThan(6);
      expect(det.quad.pxPerMm).toBeLessThan(7);
    }
  });

  it("flags a clearly non-card shape as unknown (2:1 rectangle)", () => {
    const img = cardImage({ w: 640, h: 480, cardW: 600, cardH: 300 });
    const det = detectCard(img);
    expect(det.kind).toBe("unknown");
  });

  it("reports not-found on an empty scene", () => {
    const img = makeImage(320, 240, () => DARK_BG);
    expect(detectCard(img).kind).toBe("not-found");
  });
});

describe("tilt warning threshold", () => {
  it("TILT_WARN_RATIO implies ~±0.5 mm error on a 15 mm nail", () => {
    // Scale error at the warning threshold: 1/cos(tilt) - 1 ≈ 3.3%,
    // which is ±0.5 mm on a 15 mm nail.
    const scaleError = 1 / TILT_WARN_RATIO - 1;
    expect(scaleError).toBeCloseTo(0.033, 2);
    expect(scaleError * 15).toBeCloseTo(0.5, 1);
  });

  it("a flat card is not tilted", () => {
    expect(isTilted(flatQuad(856, 540))).toBe(false);
  });

  it("10° tilt (cos ≈ 0.985) is below the warning; 15° (cos ≈ 0.966) warns", () => {
    const c10 = Math.cos((10 * Math.PI) / 180);
    const c15 = Math.cos((15 * Math.PI) / 180);
    expect(c10).toBeGreaterThanOrEqual(TILT_WARN_RATIO);
    expect(c15).toBeLessThan(TILT_WARN_RATIO);
    // Exact-aspect card (856 × 539.8 px at 10 px/mm) so tiltRatio = cos(tilt).
    const q10 = quadFromCorners([
      { x: 0, y: 0 },
      { x: 856 * c10, y: 0 },
      { x: 856 * c10, y: 539.8 },
      { x: 0, y: 539.8 },
    ]) as CardQuad;
    const q15 = quadFromCorners([
      { x: 0, y: 0 },
      { x: 856 * c15, y: 0 },
      { x: 856 * c15, y: 539.8 },
      { x: 0, y: 539.8 },
    ]) as CardQuad;
    expect(q10.tiltRatio).toBeCloseTo(c10, 4);
    expect(q15.tiltRatio).toBeCloseTo(c15, 4);
    expect(isTilted(q10)).toBe(false);
    expect(isTilted(q15)).toBe(true);
  });

  it("detects a mildly tilted card photo and warns on it", () => {
    const img = cardImage({ w: 640, h: 480, cardW: 540, cardH: 340, tiltTop: 0.92, tiltBottom: 0.94 });
    const det = detectCard(img);
    expect(det.kind).toBe("ok");
    if (det.kind === "ok") expect(isTilted(det.quad)).toBe(true);
  });

  it("rejects an unusably tilted card (tilt ratio < 0.45)", () => {
    const img = cardImage({ w: 640, h: 480, cardW: 540, cardH: 340, tiltTop: 0.4, tiltBottom: 0.45 });
    expect(detectCard(img).kind).toBe("not-found");
  });
});

describe("corner-radius variance", () => {
  it("accepts cards with realistic CR80 corner radius (~3 mm ≈ 19 px @6.3 px/mm)", () => {
    const img = cardImage({ w: 640, h: 480, cardW: 540, cardH: 340, radius: 19, cardRGB: CARD_WHITE, bgRGB: DARK_BG });
    const det = detectCard(img);
    expect(det.kind).toBe("ok");
    if (det.kind === "ok") {
      expect(correctedAspect(det.quad)).toBeGreaterThanOrEqual(CARD_ASPECT_MIN);
      expect(correctedAspect(det.quad)).toBeLessThanOrEqual(CARD_ASPECT_MAX);
    }
  });

  it("accepts modest corner radii (≈1.3 mm)", () => {
    const img = cardImage({ w: 640, h: 480, cardW: 540, cardH: 340, radius: 8 });
    expect(detectCard(img).kind).toBe("ok");
  });
});