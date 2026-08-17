/**
 * Test-only helpers: synthetic image builders, localStorage stub, canvas stub,
 * and a full 10-nail progress fixture. Never imported by production code.
 */
import { createWorkingImage, type WorkingImage } from "../lib/cv/image";
import type { ProgressState } from "../lib/types";

// ---------------------------------------------------------------------------
// Synthetic images
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

export function makeImage(
  w: number,
  h: number,
  paint: (x: number, y: number) => RGB
): WorkingImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const o = (y * w + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return createWorkingImage(w, h, data);
}

export const SKIN: RGB = [224, 172, 148]; // passes the YCbCr skin mask
export const DARK_BG: RGB = [30, 30, 30];
export const CARD_WHITE: RGB = [230, 230, 230];

export interface CardImageOpts {
  w: number;
  h: number;
  cardW: number;
  cardH: number;
  /** Corner radius in px (0 = sharp corners). */
  radius?: number;
  /** Perspective foreshortening: long-edge compression factor at top/bottom. */
  tiltTop?: number;
  tiltBottom?: number;
  cardRGB?: RGB;
  bgRGB?: RGB;
}

/** Axis-aligned card rectangle (optionally rounded corners, optionally a
 *  perspective trapezoid when tiltTop/tiltBottom < 1). */
export function cardImage(o: CardImageOpts): WorkingImage {
  const {
    w,
    h,
    cardW,
    cardH,
    radius = 0,
    tiltTop = 1,
    tiltBottom = 1,
    cardRGB = CARD_WHITE,
    bgRGB = DARK_BG,
  } = o;
  const cx = w / 2;
  const cy = h / 2;
  const r = radius;
  const topHalf = (cardH * tiltTop) / 2;
  const botHalf = (cardH * tiltBottom) / 2;
  return makeImage(w, h, (x, y) => {
    const topY = cy - topHalf;
    const botY = cy + botHalf;
    if (y < topY || y > botY) return bgRGB;
    const t = (y - topY) / (botY - topY); // 0 at top edge, 1 at bottom
    const halfW = (cardW * (tiltTop + t * (tiltBottom - tiltTop))) / 2;
    const left = cx - halfW;
    const right = cx + halfW;
    if (x < left || x > right) return bgRGB;
    if (r > 0) {
      // Honest rounded rect: point inside the card box and within the corner
      // radius of the nearest corner center (clamped SDF-style test).
      const ccx = Math.max(left + r, Math.min(x, right - r));
      const ccy = Math.max(topY + r, Math.min(y, botY - r));
      const dx = x - ccx;
      const dy = y - ccy;
      if (dx * dx + dy * dy > r * r) return bgRGB;
    }
    return cardRGB;
  });
}

/** Synthetic palm-down hand: 5 capsule fingers (rounded domes) + palm. */
export function handImage(w: number, h: number): WorkingImage {
  const fingers = [
    { cx: 170, r: 25, tip: 80, base: 300 },
    { cx: 240, r: 23, tip: 80, base: 300 },
    { cx: 310, r: 22, tip: 80, base: 300 },
    { cx: 380, r: 22, tip: 80, base: 300 },
    { cx: 450, r: 20, tip: 80, base: 300 },
  ];
  return makeImage(w, h, (x, y) => {
    for (const f of fingers) {
      const dx = Math.abs(x - f.cx);
      if (dx > f.r) continue;
      if (y < f.tip || y > f.base) continue;
      // Dome: circle of radius r centered at (cx, tip + r).
      const domeY = f.tip + f.r;
      if (y <= domeY) {
        const dy = y - domeY;
        if (dx * dx + dy * dy <= f.r * f.r) return SKIN;
        continue;
      }
      // Shaft: capsule body.
      return SKIN;
    }
    // Palm.
    if (y >= 300 && y <= 460 && x >= 120 && x <= 520) return SKIN;
    return DARK_BG;
  });
}

/** Synthetic end-on nails: filled discs (fingertip blobs). */
export function discImage(
  w: number,
  h: number,
  discs: { cx: number; cy: number; r: number }[]
): WorkingImage {
  return makeImage(w, h, (x, y) => {
    for (const d of discs) {
      const dx = x - d.cx;
      const dy = y - d.cy;
      if (dx * dx + dy * dy <= d.r * d.r) return SKIN;
    }
    return DARK_BG;
  });
}

// ---------------------------------------------------------------------------
// localStorage stub (node env has none)
// ---------------------------------------------------------------------------

export interface StorageStub {
  store: Map<string, string>;
  storage: Storage;
}

export function installLocalStorage(failOnSet = false): StorageStub {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      if (failOnSet) throw new Error("QuotaExceededError");
      store.set(k, String(v));
    },
  };
  (globalThis as { localStorage?: Storage }).localStorage = storage;
  return { store, storage };
}

export function removeLocalStorage(): void {
  delete (globalThis as { localStorage?: Storage }).localStorage;
}

// ---------------------------------------------------------------------------
// Canvas stub (node has no canvas): records fillText calls so renderChart
// output can be asserted.
// ---------------------------------------------------------------------------

export interface CanvasStub {
  calls: { text: string; x: number; y: number }[];
  ctx: Record<string, unknown>;
  canvas: {
    width: number;
    height: number;
    getContext: () => Record<string, unknown>;
    toBlob: (cb: (b: Blob | null) => void) => void;
  };
}

export function installCanvasStub(): CanvasStub {
  const calls: { text: string; x: number; y: number }[] = [];
  const ctx: Record<string, unknown> = {
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    fillRect: () => undefined,
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    beginPath: () => undefined,
    moveTo: () => undefined,
    arcTo: () => undefined,
    arc: () => undefined,
    closePath: () => undefined,
    fill: () => undefined,
    measureText: (t: string) => ({ width: String(t).length * 10 }),
    fillText: (text: string, x: number, y: number) => {
      calls.push({ text: String(text), x: Number(x), y: Number(y) });
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob | null) => void) =>
      cb(new Uint8Array([1, 2, 3]) as unknown as Blob),
  };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === "canvas" ? canvas : {}),
  };
  return { calls, ctx, canvas };
}

// ---------------------------------------------------------------------------
// Progress fixtures
// ---------------------------------------------------------------------------

export function fullProgress(over: Partial<ProgressState> = {}): ProgressState {
  return {
    version: 1,
    sessionId: "8f14e45f-ceea-4671-9e3a-0f1a2b3c4d5e",
    techName: "Maya",
    contactHint: "IG @maya.nails",
    step: "review",
    widths: {
      left: {
        thumb: { mm: 16.4, status: "confirmed" },
        index: { mm: 15.25, status: "confirmed" },
        middle: { mm: 14.8, status: "confirmed" },
        ring: { mm: 13.6, status: "confirmed" },
        pinky: { mm: 0, status: "out-of-range" },
      },
      right: {
        thumb: { mm: 17.1, status: "confirmed" },
        index: { mm: 15.7, status: "confirmed" },
        middle: { mm: 15.0, status: "confirmed" },
        ring: { mm: 14.2, status: "confirmed" },
        pinky: { mm: 11.9, status: "confirmed" },
      },
    },
    curves: {
      left: {
        thumb: { status: "measured", class: "deep", radiusMm: 6.2 },
        index: { status: "measured", class: "medium", radiusMm: 8.4 },
        middle: { status: "measured", class: "medium", radiusMm: 9.1 },
        ring: { status: "measured", class: "flat", radiusMm: 11.3 },
        pinky: { status: "unmeasured" },
      },
      right: {
        thumb: { status: "unmeasured" },
        index: { status: "unmeasured" },
        middle: { status: "unmeasured" },
        ring: { status: "unmeasured" },
        pinky: { status: "unmeasured" },
      },
    },
    curveAttempts: { left: 2, right: 0 },
    updatedAt: 1750000000000,
    ...over,
  };
}

export function freshProgress(
  over: Partial<ProgressState> = {}
): ProgressState {
  return {
    version: 1,
    sessionId: "8f14e45f-ceea-4671-9e3a-0f1a2b3c4d5e",
    techName: "Maya",
    step: "welcome",
    widths: { left: {}, right: {} },
    curves: { left: {}, right: {} },
    curveAttempts: { left: 0, right: 0 },
    updatedAt: 1750000000000,
    ...over,
  };
}