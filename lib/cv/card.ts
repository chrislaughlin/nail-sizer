import {
  BIZCARD_ASPECT_MAX,
  BIZCARD_ASPECT_MIN,
  CARD_ASPECT_MAX,
  CARD_ASPECT_MIN,
  CARD_LONG_MM,
  CARD_SHORT_MM,
  TILT_WARN_RATIO,
} from "../constants";
import {
  affineSingularValues,
  dist,
  fitAffine,
} from "../geometry";
import type { CardQuad, Point } from "../types";
import {
  boxBlur,
  close,
  componentBoundary,
  connectedComponents,
  convexHull,
  grayscale,
  simplifyPath,
  sobel,
  type WorkingImage,
} from "./image";

export type CardDetection =
  | { kind: "ok"; quad: CardQuad }
  | { kind: "business-card"; detectedAspect: number }
  | { kind: "unknown"; detectedAspect: number }
  | { kind: "not-found" };

export interface CardDetectOptions {
  /** Minimum quad area as a fraction of image area. */
  minAreaFraction?: number;
  /** Epsilon for Douglas–Peucker as a fraction of max dimension. */
  dpEpsilonFraction?: number;
}

const NOISE_EPSILON = 1e-6;

/**
 * Detect an ID-1 (bank/ID) card quadrilateral in a photo.
 * Pipeline: grayscale → blur → Sobel → threshold → close → connected
 * components → boundary → Douglas–Peucker → 4-corner candidates →
 * affine-fit validation (aspect ratio, business-card refusal, tilt ratio).
 * All client-side; scale is computed from the card's LONG edge (85.60 mm).
 */
export function detectCard(
  img: WorkingImage,
  opts: CardDetectOptions = {}
): CardDetection {
  const { width: w, height: h } = img;
  const minAreaFraction = opts.minAreaFraction ?? 0.015;
  const dpEpsilonFraction = opts.dpEpsilonFraction ?? 0.012;

  const gray = grayscale(img);
  const blurred = boxBlur(gray, w, h, 2);
  const { magnitude } = sobel(blurred, w, h);
  const edgeMask = close(magnitude, w, h, 2);

  const { labels, count, areas } = connectedComponents(edgeMask, w, h);
  const minArea = w * h * minAreaFraction;
  const maxDim = Math.max(w, h);
  const dpEpsilon = maxDim * dpEpsilonFraction;

  let best: { quad: CardQuad; score: number } | null = null;
  let bestScore = 0;

  for (let label = 0; label < count; label++) {
    if (areas[label] < minArea) continue;
    const boundary = componentBoundary(labels, edgeMask, w, h, label);
    if (boundary.points.length < 20) continue;
    const hull = convexHull(boundary.points);
    if (hull.length < 4) continue;

    // Order hull points by angle around the centroid to get a cyclic polygon.
    const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
    const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
    const ordered = hull
      .slice()
      .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));

    const simplified = simplifyPath(ordered, dpEpsilon);
    if (simplified.length !== 4) continue;

    const corners = simplified;
    const quadArea = shoelaceArea(corners);
    if (quadArea < minArea * 0.8) continue;
    if (quadArea > w * h * 0.95) continue;

    // Sides in cyclic order.
    const sides = [0, 1, 2, 3].map((i) => dist(corners[i], corners[(i + 1) % 4]));
    const minSide = Math.min(...sides);
    if (minSide < w * 0.04) continue;

    const long0 = sides[0] + sides[2];
    const long1 = sides[1] + sides[3];

    // Build nominal (mm) correspondences with the long axis along x.
    const nominal: Point[] = [
      { x: 0, y: 0 },
      { x: CARD_LONG_MM, y: 0 },
      { x: CARD_LONG_MM, y: CARD_SHORT_MM },
      { x: 0, y: CARD_SHORT_MM },
    ];
    let source: Point[];
    if (long0 >= long1) {
      source = [corners[0], corners[1], corners[2], corners[3]];
    } else {
      source = [corners[1], corners[2], corners[3], corners[0]];
    }

    const affine = fitAffine(source, nominal);
    if (!affine) continue;

    const { s1, s2 } = affineSingularValues(affine);
    const tiltRatio = s1 > NOISE_EPSILON ? s2 / s1 : 1;
    if (tiltRatio < 0.45) continue; // too tilted to be usable at all

    const pxLong = Math.hypot(affine.a, affine.c);
    const pxShort = Math.hypot(affine.b, affine.d);
    const measuredAspect = (pxLong * CARD_LONG_MM) / (pxShort * CARD_SHORT_MM);

    // Tilt-corrected aspect: the compressed axis is the one with the smaller
    // px-per-mm; divide the measured aspect by the compression factor.
    let trueAspect: number;
    if (pxLong < pxShort) {
      trueAspect = measuredAspect / tiltRatio; // long axis compressed
    } else {
      trueAspect = measuredAspect * tiltRatio; // short axis compressed
    }

    if (trueAspect < 1.3 || trueAspect > 2.1) continue;

    // Edge quality: mean Sobel magnitude along the four edges.
    const edgeQuality = meanEdgeStrength(magnitude, w, h, corners);

    // Score: prefer larger, cleaner, aspect-near-nominal quads.
    const aspectPenalty = Math.abs(trueAspect - CARD_LONG_MM / CARD_SHORT_MM);
    const score = quadArea * (1 - aspectPenalty * 0.5) * (0.5 + edgeQuality * 0.5);
    if (score > bestScore) {
      bestScore = score;
      const longEdgePx = Math.max(...sides);
      const shortEdgePx = Math.min(...sides);
      best = {
        quad: {
          corners,
          affine,
          longEdgePx,
          shortEdgePx,
          tiltRatio,
          pxPerMm: longEdgePx / CARD_LONG_MM,
        },
        score,
      };
    }
  }

  if (!best) return { kind: "not-found" };

  const q = best.quad;
  const trueAspect = correctedAspect(q);
  if (trueAspect >= CARD_ASPECT_MIN && trueAspect <= CARD_ASPECT_MAX) {
    return { kind: "ok", quad: q };
  }
  if (trueAspect >= BIZCARD_ASPECT_MIN && trueAspect <= BIZCARD_ASPECT_MAX) {
    return { kind: "business-card", detectedAspect: trueAspect };
  }
  return { kind: "unknown", detectedAspect: trueAspect };
}

/** Recompute the tilt-corrected aspect ratio from a fitted quad. */
export function correctedAspect(q: CardQuad): number {
  const { a, b, c, d } = q.affine;
  const pxLong = Math.hypot(a, c);
  const pxShort = Math.hypot(b, d);
  const measured = (pxLong * CARD_LONG_MM) / (pxShort * CARD_SHORT_MM);
  if (pxLong < pxShort) return measured / q.tiltRatio;
  return measured * q.tiltRatio;
}

/** Build a CardQuad from user-supplied corners (manual calibration). */
export function quadFromCorners(corners: Point[]): CardQuad | null {
  if (corners.length !== 4) return null;
  const sides = [0, 1, 2, 3].map((i) => dist(corners[i], corners[(i + 1) % 4]));
  const long0 = sides[0] + sides[2];
  const nominal: Point[] = [
    { x: 0, y: 0 },
    { x: CARD_LONG_MM, y: 0 },
    { x: CARD_LONG_MM, y: CARD_SHORT_MM },
    { x: 0, y: CARD_SHORT_MM },
  ];
  const source =
    long0 >= long1(sides)
      ? corners
      : [corners[1], corners[2], corners[3], corners[0]];
  const affine = fitAffine(source, nominal);
  if (!affine) return null;
  const { s1, s2 } = affineSingularValues(affine);
  const tiltRatio = s1 > NOISE_EPSILON ? s2 / s1 : 1;
  return {
    corners,
    affine,
    longEdgePx: Math.max(...sides),
    shortEdgePx: Math.min(...sides),
    tiltRatio,
    pxPerMm: Math.max(...sides) / CARD_LONG_MM,
  };
}

function long1(sides: number[]): number {
  return sides[1] + sides[3];
}

export function shoelaceArea(pts: Point[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function meanEdgeStrength(
  magnitude: Uint8ClampedArray,
  w: number,
  h: number,
  corners: Point[]
): number {
  let total = 0;
  let samples = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const steps = 24;
    for (let t = 1; t < steps; t++) {
      const x = Math.round(a.x + ((b.x - a.x) * t) / steps);
      const y = Math.round(a.y + ((b.y - a.y) * t) / steps);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      total += magnitude[y * w + x] / 255;
      samples++;
    }
  }
  return samples > 0 ? total / samples : 0;
}

export function isTilted(q: CardQuad): boolean {
  return q.tiltRatio < TILT_WARN_RATIO;
}