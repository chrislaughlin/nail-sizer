import type { Point } from "../types";
import { close, connectedComponents, type WorkingImage } from "./image";
import { skinMask } from "./nails";

export interface NailArc {
  /** Rank by x position (ascending) — matched to fingers later by the UI. */
  index: number;
  apex: Point;
  center: Point;
  radiusPx: number;
  chordPx: number;
  /** Mean relative residual of the circle fit (0 = perfect). */
  residual: number;
}

const MIN_ARC_BLOB_FRACTION = 0.004;
const MAX_RESIDUAL = 0.4;
const MIN_CHORD_PX = 8;
const MAX_ARCS = 6;

/**
 * Detect the free-edge arcs of curled fingernails in an end-on photo.
 * Each fingertip blob is fit with a circle (Kasa algebraic least squares);
 * the top arc of the blob is the nail's free edge. The chord of that arc is
 * scaled against the same nail's measured width (mm) from the width step to
 * produce a radius estimate in mm.
 */
export function detectNailArcs(img: WorkingImage): NailArc[] {
  const { width: w, height: h } = img;
  const raw = skinMask(img);
  const mask = close(raw, w, h, 2);

  const { labels, count, areas } = connectedComponents(mask, w, h);
  const minArea = w * h * MIN_ARC_BLOB_FRACTION;

  // Sort blobs by area desc, then by x of centroid asc for deterministic ranking.
  const blobs: { label: number; cx: number }[] = [];
  for (let label = 0; label < count; label++) {
    if (areas[label] < minArea) continue;
    // centroid
    let sx = 0;
    let n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (labels[y * w + x] === label) {
          sx += x;
          n++;
        }
      }
    }
    blobs.push({ label, cx: sx / n });
  }
  blobs.sort((a, b) => b.cx - a.cx); // rightmost first, then reversed below
  blobs.reverse(); // leftmost first

  const arcs: NailArc[] = [];
  let idx = 0;
  for (const blob of blobs.slice(0, MAX_ARCS)) {
    // Bounds + top (apex) of the blob.
    let minY = h;
    let maxY = 0;
    let minX = w;
    let maxX = 0;
    let apex: Point = { x: 0, y: h };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (labels[y * w + x] !== blob.label) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (y < apex.y) apex = { x, y };
      }
    }
    const blobHeight = maxY - minY;
    if (blobHeight < w * 0.04 || blobHeight > h * 0.9) continue;

    // Top-arc boundary points (upper half of the blob).
    const cy = (minY + maxY) / 2;
    const arcPts: Point[] = [];
    for (let y = minY; y < cy; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (labels[y * w + x] !== blob.label) continue;
        const isTop = y === minY || labels[(y - 1) * w + x] !== blob.label;
        if (isTop) arcPts.push({ x, y });
      }
    }
    if (arcPts.length < 12) continue;

    const fit = fitCircle(arcPts);
    if (!fit) continue;
    const { center, radius } = fit;

    // Residual of the fit.
    let resid = 0;
    for (const p of arcPts) {
      resid += Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - radius);
    }
    resid /= arcPts.length * radius;
    if (resid > MAX_RESIDUAL) continue;
    if (radius < 3 || radius > blobHeight * 1.2) continue;

    // Chord: blob width at 45% of the blob height down from the apex.
    const chordY = Math.round(minY + blobHeight * 0.45);
    let xLeft = -1;
    let xRight = -1;
    for (let x = minX; x <= maxX; x++) {
      if (labels[chordY * w + x] === blob.label) {
        if (xLeft < 0) xLeft = x;
        xRight = x;
      }
    }
    if (xLeft < 0 || xRight - xLeft < MIN_CHORD_PX) continue;

    arcs.push({
      index: idx,
      apex,
      center,
      radiusPx: radius,
      chordPx: xRight - xLeft,
      residual: resid,
    });
    idx++;
  }

  arcs.sort((a, b) => a.apex.x - b.apex.x);
  arcs.forEach((a, i) => (a.index = i));
  return arcs;
}

interface CircleFit {
  center: Point;
  radius: number;
}

/** Kasa (algebraic) circle fit: x²+y²+ax+by+c=0, solved via Cramer. */
function fitCircle(pts: Point[]): CircleFit | null {
  const n = pts.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sx = 0;
  let sy = 0;
  let s1 = 0; // Σ x(x²+y²)
  let s2 = 0; // Σ y(x²+y²)
  let s3 = 0; // Σ (x²+y²)
  for (const p of pts) {
    const r2 = p.x * p.x + p.y * p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
    syy += p.y * p.y;
    sx += p.x;
    sy += p.y;
    s1 += p.x * r2;
    s2 += p.y * r2;
    s3 += r2;
  }

  // Solve [sxx sxy sx; sxy syy sy; sx sy n]·[a b c] = [-s1 -s2 -s3]
  const det =
    sxx * (syy * n - sy * sy) - sxy * (sxy * n - sx * sy) + sx * (sxy * sy - sx * syy);
  if (Math.abs(det) < 1e-6) return null;

  const a =
    (-s1 * (syy * n - sy * sy) + sxy * (s2 * n - sy * s3) - sx * (s2 * sy - s3 * syy)) /
    det;
  const b =
    (sxx * (sy * s3 - s2 * n) + s1 * (sxy * n - sx * sy) + sx * (s2 * sx - sxy * s3)) /
    det;
  const c =
    (sxx * (s2 * sy - syy * s3) + sxy * (sxy * s3 - sy * s1) - sx * (sxy * s2 - syy * s1)) /
    det;

  const cx = -a / 2;
  const cy = -b / 2;
  const radiusSq = (a * a + b * b) / 4 - c;
  if (radiusSq <= 0) return null;
  return { center: { x: cx, y: cy }, radius: Math.sqrt(radiusSq) };
}