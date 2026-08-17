import type { Point, Vec2 } from "../types";
import { close, connectedComponents, type WorkingImage } from "./image";

export interface NailProposal {
  id: number;
  tip: Point;
  /** Guide segment endpoints (widest cross-section of the fingertip). */
  p1: Point;
  p2: Point;
}

const MIN_BLOB_FRACTION = 0.012;
const MAX_TIPS = 6;

/** YCbCr skin mask (generous rule so dark/light skin and mixed lighting
 *  still register; the proposals are assisted, never silently trusted). */
export function skinMask(img: WorkingImage): Uint8ClampedArray {
  const { width: w, height: h, data } = img;
  const mask = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 + (-0.168736 * r - 0.331264 * g + 0.5 * b);
    const cr = 128 + (0.5 * r - 0.418688 * g - 0.081312 * b);
    if (y > 55 && cb >= 78 && cb <= 142 && cr >= 128 && cr <= 182) {
      mask[i] = 255;
    }
  }
  return mask;
}

/**
 * Propose a width guide per visible nail from a top-down hand photo.
 * Approach: skin segmentation → largest hand blob → local minima of the
 * blob's top boundary are fingertips → per tip, PCA finger axis → widest
 * cross-section just below the tip = nail-bed width guide.
 */
export function proposeNailGuides(img: WorkingImage): NailProposal[] {
  const { width: w, height: h } = img;
  const raw = skinMask(img);
  const mask = close(raw, w, h, 2);

  const { labels, count, areas } = connectedComponents(mask, w, h);
  const minArea = w * h * MIN_BLOB_FRACTION;

  // Find the largest blob that looks like a hand (wide, tall).
  let handLabel = -1;
  let handArea = 0;
  for (let label = 0; label < count; label++) {
    if (areas[label] < minArea) continue;
    if (areas[label] > handArea) {
      handArea = areas[label];
      handLabel = label;
    }
  }
  if (handLabel < 0) return [];

  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (labels[y * w + x] === handLabel) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const blobHeight = maxY - minY;
  const blobWidth = maxX - minX;
  if (blobHeight < w * 0.15 || blobWidth < w * 0.2) return [];

  // Top boundary per column (smooth with a small moving average).
  const topY = new Int32Array(w).fill(-1);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      if (labels[y * w + x] === handLabel) {
        topY[x] = y;
        break;
      }
    }
  }
  const smoothTop = topY.slice();
  for (let x = minX + 1; x < maxX; x++) {
    const a = topY[x - 1];
    const b = topY[x];
    const c = topY[x + 1];
    if (a >= 0 && b >= 0 && c >= 0) {
      smoothTop[x] = Math.round((a + b + c) / 3);
    }
  }

  // Peak-pick fingertips: local minima of the top boundary with enough
  // prominence, deduped by minimum separation.
  const tipXs: number[] = [];
  for (let x = minX + 3; x < maxX - 3; x++) {
    const y0 = smoothTop[x];
    if (y0 < 0) continue;
    if (smoothTop[x - 1] < 0 || smoothTop[x + 1] < 0) continue;
    if (y0 > smoothTop[x - 1] || y0 > smoothTop[x + 1]) continue;
    // prominence: must rise by at least 7px within 18px on both sides
    let leftMin = y0;
    let rightMin = y0;
    for (let d = 1; d <= 18; d++) {
      const yl = smoothTop[x - d];
      const yr = smoothTop[x + d];
      if (yl >= 0) leftMin = Math.min(leftMin, yl);
      if (yr >= 0) rightMin = Math.min(rightMin, yr);
    }
    if (leftMin - y0 >= 7 && rightMin - y0 >= 7) {
      tipXs.push(x);
    }
  }
  // Dedupe: keep the lowest (min y) tip within 26px windows.
  tipXs.sort((a, b) => a - b);
  const tips: { x: number; y: number }[] = [];
  for (const x of tipXs) {
    const last = tips[tips.length - 1];
    if (last && x - last.x < 26) {
      if (smoothTop[x] < last.y) {
        tips[tips.length - 1] = { x, y: smoothTop[x] };
      }
    } else {
      tips.push({ x, y: smoothTop[x] });
    }
  }
  tips.sort((a, b) => a.x - b.x);
  const selected = tips.slice(0, MAX_TIPS);

  const proposals: NailProposal[] = [];
  selected.forEach((tip, idx) => {
    const guide = crossSectionAtTip(mask, labels, w, h, handLabel, tip, blobHeight);
    if (!guide) return;
    proposals.push({ id: idx, tip, p1: guide.p1, p2: guide.p2 });
  });
  return proposals;
}

/**
 * Place a width guide at a manually-tapped point (falls back to the nearest
 * finger axis when the point is not inside the hand blob).
 */
export function placeGuideAt(
  img: WorkingImage,
  point: Point
): { p1: Point; p2: Point } | null {
  const { width: w, height: h } = img;
  const raw = skinMask(img);
  const mask = close(raw, w, h, 2);
  const { labels, areas } = connectedComponents(mask, w, h);
  const minArea = w * h * MIN_BLOB_FRACTION;

  const px = Math.round(Math.min(w - 1, Math.max(0, point.x)));
  const py = Math.round(Math.min(h - 1, Math.max(0, point.y)));
  const label = labels[py * w + px];
  if (label < 0 || areas[label] < minArea) return null;

  // Bounds of the blob.
  let minY = h;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (labels[y * w + x] === label) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const blobHeight = maxY - minY;
  return crossSectionAtTip(mask, labels, w, h, label, { x: px, y: py }, blobHeight);
}

/** Compute the widest skin cross-section below a fingertip. */
function crossSectionAtTip(
  mask: Uint8ClampedArray,
  labels: Int32Array,
  w: number,
  h: number,
  label: number,
  tip: Point,
  blobHeight: number
): { p1: Point; p2: Point } | null {
  // Finger axis from PCA of blob pixels near the tip.
  const r = 14;
  let sx = 0;
  let sy = 0;
  let n = 0;
  const pts: Vec2[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = Math.round(tip.x + dx);
      const y = Math.round(tip.y + dy);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (labels[y * w + x] !== label) continue;
      pts.push({ x, y });
      sx += x;
      sy += y;
      n++;
    }
  }
  if (n < 8) return null;
  const cx = sx / n;
  const cy = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of pts) {
    sxx += (p.x - cx) * (p.x - cx);
    sxy += (p.x - cx) * (p.y - cy);
    syy += (p.y - cy) * (p.y - cy);
  }
  // Eigenvector of the covariance with the largest eigenvalue.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let axis: Vec2 = { x: Math.cos(theta), y: Math.sin(theta) };
  if (axis.y < 0) axis = { x: -axis.x, y: -axis.y }; // point into the blob (down)
  const u: Vec2 = { x: -axis.y, y: axis.x }; // perpendicular

  // Scan cross-sections below the tip; keep the widest.
  const span = Math.min(blobHeight * 0.45, 90);
  let best: { p1: Point; p2: Point; width: number } | null = null;
  for (let t = 4; t <= span; t += 2) {
    const px = tip.x + axis.x * t;
    const py = tip.y + axis.y * t;
    const seg = crossSection(mask, labels, w, h, label, px, py, u);
    if (seg && (!best || seg.width > best.width)) {
      best = seg;
    }
  }
  if (!best || best.width < 8) return null;
  return { p1: best.p1, p2: best.p2 };
}

/** Width of the blob along a line through (px, py) in direction u. */
function crossSection(
  mask: Uint8ClampedArray,
  labels: Int32Array,
  w: number,
  h: number,
  label: number,
  px: number,
  py: number,
  u: Vec2
): { p1: Point; p2: Point; width: number } | null {
  let kPos = 0;
  while (kPos < 120) {
    const x = Math.round(px + u.x * kPos);
    const y = Math.round(py + u.y * kPos);
    if (x < 0 || y < 0 || x >= w || y >= h) break;
    if (labels[y * w + x] !== label) break;
    kPos++;
  }
  let kNeg = 0;
  while (kNeg < 120) {
    const x = Math.round(px - u.x * kNeg);
    const y = Math.round(py - u.y * kNeg);
    if (x < 0 || y < 0 || x >= w || y >= h) break;
    if (labels[y * w + x] !== label) break;
    kNeg++;
  }
  if (kPos < 4 || kNeg < 4) return null;
  return {
    p1: { x: px + u.x * kPos, y: py + u.y * kPos },
    p2: { x: px - u.x * kNeg, y: py - u.y * kNeg },
    width: kPos + kNeg,
  };
}