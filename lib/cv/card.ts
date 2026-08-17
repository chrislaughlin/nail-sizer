import {
  BIZCARD_ASPECT_MAX,
  BIZCARD_ASPECT_MIN,
  CARD_ASPECT,
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
import type { CardQuad, Point, Vec2 } from "../types";
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

/** A quad whose fitted px axes are within this anisotropy of each other is an
 *  ID-1 card seen near-nadir: report the nominal aspect (tilt/perspective
 *  variance folds in). Beyond it, the measured aspect is the card's own
 *  (business cards, 2:1 rectangles, …). */
const ASPECT_ISOTROPY_LIMIT = 0.05;

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
    const boundary = componentBoundary(labels, w, h, label);
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
    let corners: Point[] | null = null;
    if (simplified.length === 4) {
      corners = simplified;
    } else {
      // Rounded corners and perspective trapezoids leave 5–8 hull points;
      // fit a quad to the full hull instead of skipping the component.
      corners = fitQuadFromHull(ordered);
    }
    if (!corners) continue;

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
    const sigmaRatio = s1 > NOISE_EPSILON ? s2 / s1 : 1;
    const tiltRatio = perspectiveTiltRatio(sigmaRatio, sides);
    if (tiltRatio < 0.45) continue; // too tilted to be usable at all

    const longEdgePx = Math.max(...sides);
    const shortEdgePx = Math.min(...sides);
    const quad: CardQuad = {
      corners,
      affine,
      longEdgePx,
      shortEdgePx,
      tiltRatio,
      pxPerMm: longEdgePx / CARD_LONG_MM,
    };
    const trueAspect = correctedAspect(quad);
    if (trueAspect < 1.3 || trueAspect > 2.1) continue;

    // Edge quality: mean Sobel magnitude along the four edges.
    const edgeQuality = meanEdgeStrength(magnitude, w, h, corners);

    // Score: prefer larger, cleaner, aspect-near-nominal quads.
    const aspectPenalty = Math.abs(trueAspect - CARD_LONG_MM / CARD_SHORT_MM);
    const score = quadArea * (1 - aspectPenalty * 0.5) * (0.5 + edgeQuality * 0.5);
    if (score > bestScore) {
      bestScore = score;
      best = { quad, score };
    }
  }

  if (!best) return { kind: "not-found" };

  const q = best.quad;
  const trueAspect = correctedAspect(q);
  const kind = classifyAspect(trueAspect);
  if (kind === "ok") return { kind: "ok", quad: q };
  if (kind === "business-card") {
    return { kind: "business-card", detectedAspect: trueAspect };
  }
  return { kind: "unknown", detectedAspect: trueAspect };
}

/**
 * Classify a card aspect ratio against the constants' ID-1 and business-card
 * bands. Single source of truth for the auto-detect and manual-corner paths.
 */
export function classifyAspect(aspect: number): "ok" | "business-card" | "unknown" {
  if (aspect >= CARD_ASPECT_MIN && aspect <= CARD_ASPECT_MAX) return "ok";
  if (aspect >= BIZCARD_ASPECT_MIN && aspect <= BIZCARD_ASPECT_MAX) return "business-card";
  return "unknown";
}

/**
 * Aspect ratio of the card in the photo. Near-nadir quads (fitted axes within
 * ASPECT_ISOTROPY_LIMIT of isotropic) are ID-1 cards: their measured aspect is
 * the nominal one up to tilt/perspective variance, so report CARD_ASPECT
 * exactly. Otherwise the affine's long-edge scale (85.6 mm) anchors the long
 * axis and the pixel proportions give the card's true aspect.
 */
export function correctedAspect(q: CardQuad): number {
  const { a, b, c, d } = q.affine;
  const pxLong = Math.hypot(a, c);
  const pxShort = Math.hypot(b, d);
  if (pxLong <= NOISE_EPSILON || pxShort <= NOISE_EPSILON) return CARD_ASPECT;
  if (Math.abs(pxLong / pxShort - 1) <= ASPECT_ISOTROPY_LIMIT) return CARD_ASPECT;
  return (CARD_ASPECT * pxShort) / pxLong;
}

/**
 * Foreshortening ratio (<= 1) for a fitted quad: the affine's singular-value
 * ratio captures uniform compression, while perspective convergence between
 * the opposite long edges (a homothetic trapezoid hides its compression from
 * the affine — both axes shrink together) exposes the remaining tilt.
 */
function perspectiveTiltRatio(sigmaRatio: number, sides: number[]): number {
  const conv = Math.min(sides[0], sides[2]) / Math.max(sides[0], sides[2]);
  return sigmaRatio * conv * conv;
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
  const sigmaRatio = s1 > NOISE_EPSILON ? s2 / s1 : 1;
  const tiltRatio = perspectiveTiltRatio(sigmaRatio, sides);
  return {
    corners,
    affine,
    longEdgePx: Math.max(...sides),
    shortEdgePx: Math.min(...sides),
    tiltRatio,
    pxPerMm: Math.max(...sides) / CARD_LONG_MM,
  };
}

/**
 * Fit a quadrilateral to a cyclic hull (for components whose Douglas–Peucker
 * simplification leaves more than four vertices, e.g. rounded corners or a
 * perspective trapezoid). Corner seeds are the hull points farthest from the
 * centroid, greedily picked with a minimum cyclic separation; each side is a
 * least-squares (PCA) line through the middle of the chain between two seeds,
 * and adjacent lines are intersected to recover the four corners.
 */
function fitQuadFromHull(ordered: Point[]): Point[] | null {
  const n = ordered.length;
  if (n < 10) return null;

  const cx = ordered.reduce((s, p) => s + p.x, 0) / n;
  const cy = ordered.reduce((s, p) => s + p.y, 0) / n;
  const dists = ordered.map((p) => Math.hypot(p.x - cx, p.y - cy));

  const seeds: number[] = [];
  const radius = Math.max(2, Math.floor(n / 8));
  while (seeds.length < 4) {
    let best = -1;
    let bestD = -1;
    for (let i = 0; i < n; i++) {
      if (seeds.some((s) => Math.min(Math.abs(s - i), n - Math.abs(s - i)) <= radius)) continue;
      if (dists[i] > bestD) {
        bestD = dists[i];
        best = i;
      }
    }
    if (best < 0) break;
    seeds.push(best);
  }
  if (seeds.length !== 4) return null;
  seeds.sort((x, y) => x - y);

  const lines: { p: Point; u: Vec2 }[] = [];
  for (let k = 0; k < 4; k++) {
    const start = seeds[k];
    const end = seeds[(k + 1) % 4];
    const length = (end + (k === 3 ? n : 0) - start + n) % n;
    const chain: Point[] = [];
    for (let i = 1; i < length; i++) chain.push(ordered[(start + i) % n]);
    if (chain.length < 2) return null;
    // The corner arcs live near the seeds; fit through the middle of the side.
    const trim = Math.min(6, Math.max(0, Math.floor(chain.length / 5)));
    const mid = chain.slice(trim, chain.length - trim);
    const line = fitLine(mid.length >= 2 ? mid : chain);
    if (!line) return null;
    lines.push(line);
  }

  const corners: Point[] = [];
  for (let k = 0; k < 4; k++) {
    const corner = lineIntersect(lines[(k + 3) % 4], lines[k]);
    if (!corner) return null;
    corners.push(corner);
  }
  return corners;
}

/** Least-squares line through points: anchor + unit direction (PCA). */
function fitLine(pts: Point[]): { p: Point; u: Vec2 } | null {
  if (pts.length < 2) return null;
  const n = pts.length;
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of pts) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { p: { x: mx, y: my }, u: { x: Math.cos(theta), y: Math.sin(theta) } };
}

/** Intersection of two lines (anchor + direction); null when near-parallel. */
function lineIntersect(
  a: { p: Point; u: Vec2 },
  b: { p: Point; u: Vec2 }
): Point | null {
  const denom = a.u.x * b.u.y - a.u.y * b.u.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b.p.x - a.p.x) * b.u.y - (b.p.y - a.p.y) * b.u.x) / denom;
  return { x: a.p.x + a.u.x * t, y: a.p.y + a.u.y * t };
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