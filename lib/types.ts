export type Hand = "left" | "right";

export type Finger = "thumb" | "index" | "middle" | "ring" | "pinky";

export type CurveClass = "flat" | "medium" | "deep";

export type StepId =
  | "welcome"
  | "calibration"
  | "width-left"
  | "width-right"
  | "curve-left"
  | "curve-right"
  | "review";

export interface Point {
  x: number;
  y: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** Affine transform: p' = A·p + t (2x2 linear part + translation). */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export interface CardQuad {
  corners: Point[];
  /** Affine mapping nominal card mm coords (long axis = x) -> pixels. */
  affine: Affine;
  /** Long edge length in pixels (85.60 mm reference). */
  longEdgePx: number;
  /** Short edge length in pixels (53.98 mm nominal). */
  shortEdgePx: number;
  /** Foreshortening ratio (singular value ratio) of the affine fit, <= 1. */
  tiltRatio: number;
  /** Pixel-per-mm along the long edge direction. */
  pxPerMm: number;
}

export interface NailWidth {
  mm: number;
  status: "confirmed" | "out-of-range";
}

export interface NailCurve {
  status: "measured" | "unmeasured";
  class?: CurveClass;
  radiusMm?: number;
}

export interface ProgressState {
  version: 1;
  sessionId: string;
  techName: string;
  contactHint?: string;
  step: StepId;
  widths: Record<Hand, Partial<Record<Finger, NailWidth>>>;
  curves: Record<Hand, Partial<Record<Finger, NailCurve>>>;
  /** Number of failed end-on pose attempts per hand (0..2). */
  curveAttempts: Record<Hand, number>;
  updatedAt: number;
}