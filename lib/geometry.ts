import type { Affine, Point, Vec2 } from "./types";

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function sub(a: Point, b: Point): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function addPoints(a: Point, v: Vec2): Point {
  return { x: a.x + v.x, y: a.y + v.y };
}

/** Direction vector from a to b, normalized. */
export function unit(a: Point, b: Point): Vec2 {
  const d = sub(b, a);
  const len = Math.hypot(d.x, d.y) || 1;
  return { x: d.x / len, y: d.y / len };
}

/** Perpendicular of a vector. */
export function perp(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

/**
 * Least-squares affine fit mapping source points to target points:
 *   target = A·source + t.
 * Solve the normal equations for a 2x2 linear part + translation.
 * Returns null when the source points are degenerate.
 */
export function fitAffine(source: Point[], target: Point[]): Affine | null {
  if (source.length < 3 || source.length !== target.length) return null;

  const n = source.length;
  const cx = source.reduce((s, p) => s + p.x, 0) / n;
  const cy = source.reduce((s, p) => s + p.y, 0) / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sxxtx = 0;
  let sxyty = 0;
  let sxxty = 0;
  let syytx = 0;

  for (let i = 0; i < n; i++) {
    const px = source[i].x - cx;
    const py = source[i].y - cy;
    const tx = target[i].x;
    const ty = target[i].y;
    sxx += px * px;
    sxy += px * py;
    syy += py * py;
    sxxtx += px * tx;
    sxyty += px * ty;
    sxxty += py * tx;
    syytx += py * ty;
  }

  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-9) return null;

  const a = (sxxtx * syy - sxy * sxxty) / det;
  const b = (sxx * sxxty - sxy * sxxtx) / det;
  const c = (sxyty * syy - sxy * syytx) / det;
  const d = (sxx * syytx - sxy * sxyty) / det;

  const tcx = target.reduce((s, p) => s + p.x, 0) / n;
  const tcy = target.reduce((s, p) => s + p.y, 0) / n;

  return {
    a,
    b,
    c,
    d,
    tx: tcx - (a * cx + b * cy),
    ty: tcy - (c * cx + d * cy),
  };
}

export function applyAffine(m: Affine, p: Point): Point {
  return {
    x: m.a * p.x + m.b * p.y + m.tx,
    y: m.c * p.x + m.d * p.y + m.ty,
  };
}

export function affineInverse(m: Affine): Affine | null {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return null;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    tx: (m.b * m.ty - m.d * m.tx) / det,
    ty: (m.c * m.tx - m.a * m.ty) / det,
  };
}

/**
 * Singular values of the linear part of an affine transform, ordered σ1 >= σ2.
 * Closed form: σ1·σ2 = |det| and σ1²+σ2² = trace(AᵀA).
 */
export function affineSingularValues(m: Affine): { s1: number; s2: number } {
  const a = m.a;
  const b = m.b;
  const c = m.c;
  const d = m.d;
  const det = a * d - b * c;
  const trace = a * a + b * b + c * c + d * d;
  const adet = Math.abs(det);
  const disc = Math.max(0, trace * trace - 4 * adet * adet);
  const s1 = Math.sqrt((trace + Math.sqrt(disc)) / 2);
  const s2 = Math.sqrt((trace - Math.sqrt(disc)) / 2);
  return { s1, s2 };
}

/**
 * Distance in mm between two image points under the card-plane affine.
 * Both endpoints are mapped into card-plane mm coordinates (px→mm) and the
 * Euclidean distance taken — exact card-plane distance for every tilt axis.
 */
export function mmDistance(m: Affine, p1: Point, p2: Point): number {
  return dist(applyAffine(m, p1), applyAffine(m, p2));
}

/** Long-edge px-per-mm from the affine (for display). */
export function longEdgePxPerMm(m: Affine): number {
  return 1 / Math.hypot(m.a, m.c);
}