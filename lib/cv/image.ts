/**
 * Minimal client-side image processing helpers (vanilla canvas — no deps).
 * All operations run on an offscreen canvas at a capped working resolution.
 */

export interface WorkingImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

export function createWorkingImage(
  width: number,
  height: number,
  data: Uint8ClampedArray
): WorkingImage {
  return { width, height, data };
}

/** Draw an ImageBitmap/HTMLImageElement onto an offscreen canvas, capped to
 *  `maxDim`, and read back its RGBA pixels. */
export function readImagePixels(
  image: CanvasImageSource,
  width: number,
  height: number,
  maxDim = 1000
): WorkingImage {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  return createWorkingImage(w, h, data);
}

/** Copy a working image into a visible canvas (stretched to fit). */
export function drawWorkingImage(
  canvas: HTMLCanvasElement,
  img: WorkingImage
): void {
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const imageData = new ImageData(
    new Uint8ClampedArray(img.data),
    img.width,
    img.height
  );
  ctx.putImageData(imageData, 0, 0);
}

export function grayscale(img: WorkingImage): Uint8ClampedArray {
  const { width, height, data } = img;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    out[i] = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114) | 0;
  }
  return out;
}

export function boxBlur(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  if (r <= 0) return src.slice();
  const tmp = new Uint8ClampedArray(src.length);
  const out = new Uint8ClampedArray(src.length);
  // horizontal pass
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / (2 * r + 1);
      const removeX = x - r;
      const addX = x + r + 1;
      acc -= src[row + Math.min(w - 1, Math.max(0, removeX))];
      acc += src[row + Math.min(w - 1, Math.max(0, addX))];
    }
  }
  // vertical pass
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      const removeY = y - r;
      const addY = y + r + 1;
      acc -= tmp[Math.min(h - 1, Math.max(0, removeY)) * w + x];
      acc += tmp[Math.min(h - 1, Math.max(0, addY)) * w + x];
    }
  }
  return out;
}

export interface EdgeMap {
  magnitude: Uint8ClampedArray;
  direction: Uint8ClampedArray; // 0 = horizontal edge, 1 = vertical edge
}

/** Sobel edge magnitude + dominant orientation. */
export function sobel(gray: Uint8ClampedArray, w: number, h: number): EdgeMap {
  const magnitude = new Uint8ClampedArray(w * h);
  const direction = new Uint8ClampedArray(w * h);
  let max = 1;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[(y - 1) * w + x - 1] + gray[(y - 1) * w + x + 1] -
        2 * gray[y * w + x - 1] + 2 * gray[y * w + x + 1] -
        gray[(y + 1) * w + x - 1] + gray[(y + 1) * w + x + 1];
      const gy =
        -gray[(y - 1) * w + x - 1] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + x + 1] +
        gray[(y + 1) * w + x - 1] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + x + 1];
      const m = Math.hypot(gx, gy);
      magnitude[i] = m > 255 ? 255 : m;
      if (m > max) max = m;
      direction[i] = Math.abs(gy) > Math.abs(gx) ? 1 : 0;
    }
  }
  const thr = max * 0.18;
  for (let i = 0; i < w * h; i++) {
    magnitude[i] = magnitude[i] >= thr ? 255 : 0;
  }
  return { magnitude, direction };
}

/** Binary morphological close (dilate then erode) with a square kernel. */
export function close(mask: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const dil = new Uint8ClampedArray(w * h);
  const ero = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] === 0) continue;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          dil[yy * w + xx] = 255;
        }
      }
    }
  }
  const kr = r;
  for (let y = kr; y < h - kr; y++) {
    for (let x = kr; x < w - kr; x++) {
      let hit = true;
      for (let dy = -kr; dy <= kr && hit; dy++) {
        for (let dx = -kr; dx <= kr && hit; dx++) {
          if (dil[(y + dy) * w + x + dx] === 0) hit = false;
        }
      }
      if (hit) ero[y * w + x] = 255;
    }
  }
  return ero;
}

/** Label connected components (4-neighbour BFS) on a binary mask. */
export function connectedComponents(
  mask: Uint8ClampedArray,
  w: number,
  h: number
): { labels: Int32Array; count: number; areas: number[] } {
  const labels = new Int32Array(w * h).fill(-1);
  const areas: number[] = [];
  const stack: number[] = [];
  let label = 0;
  for (let i = 0; i < w * h; i++) {
    if (mask[i] === 0 || labels[i] !== -1) continue;
    stack.push(i);
    labels[i] = label;
    let area = 0;
    while (stack.length > 0) {
      const p = stack.pop()!;
      area++;
      const x = p % w;
      const y = (p / w) | 0;
      if (x > 0 && labels[p - 1] === -1 && mask[p - 1] !== 0) {
        labels[p - 1] = label;
        stack.push(p - 1);
      }
      if (x < w - 1 && labels[p + 1] === -1 && mask[p + 1] !== 0) {
        labels[p + 1] = label;
        stack.push(p + 1);
      }
      if (y > 0 && labels[p - w] === -1 && mask[p - w] !== 0) {
        labels[p - w] = label;
        stack.push(p - w);
      }
      if (y < h - 1 && labels[p + w] === -1 && mask[p + w] !== 0) {
        labels[p + w] = label;
        stack.push(p + w);
      }
    }
    areas.push(area);
    label++;
  }
  return { labels, count: label, areas };
}

export interface Boundary {
  points: { x: number; y: number }[];
}

/** Extract boundary pixels of a connected component (pixels with a
 *  non-masked 4-neighbour). */
export function componentBoundary(
  labels: Int32Array,
  mask: Uint8ClampedArray,
  w: number,
  h: number,
  label: number
): Boundary {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < w * h; i++) {
    if (labels[i] !== label) continue;
    const x = i % w;
    const y = (i / w) | 0;
    const onEdge =
      x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
      labels[i - 1] !== label || labels[i + 1] !== label ||
      labels[i - w] !== label || labels[i + w] !== label;
    if (onEdge) points.push({ x, y });
  }
  return { points };
}

/**
 * Douglas–Peucker polyline simplification. Returns the simplified path
 * (always keeps the first and last point).
 */
export function simplifyPath(
  pts: { x: number; y: number }[],
  epsilon: number
): { x: number; y: number }[] {
  if (pts.length <= 2) return pts.slice();
  let maxDist = 0;
  let index = 0;
  const first = pts[0];
  const last = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointLineDist(pts[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyPath(pts.slice(0, index + 1), epsilon);
    const right = simplifyPath(pts.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function pointLineDist(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Simple convex-hull cross product test. */
export function convexHull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const sorted = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: { x: number; y: number }[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}