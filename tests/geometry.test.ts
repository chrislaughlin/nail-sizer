/**
 * lib/geometry — affine math and the mm measurement seam.
 *
 * Acceptance-critical: nail widths are read via mmDistance(cardQuad.affine,
 * p1, p2); a 150 px guide along the long edge (10 px/mm) must read 15 mm, and
 * every reading is the exact card-plane distance — each axis scales by its own
 * px/mm, and tilt never over-reads.
 */
import { describe, expect, it } from "vitest";
import {
  affineInverse,
  affineSingularValues,
  applyAffine,
  dist,
  fitAffine,
  longEdgePxPerMm,
  mmDistance,
  perp,
  unit,
} from "../lib/geometry";
import type { Affine, Point } from "../lib/types";

const CORNERS: Point[] = [
  { x: 0, y: 0 },
  { x: 856, y: 0 },
  { x: 856, y: 540 },
  { x: 0, y: 540 },
];
const NOMINAL: Point[] = [
  { x: 0, y: 0 },
  { x: 85.6, y: 0 },
  { x: 85.6, y: 53.98 },
  { x: 0, y: 53.98 },
];

describe("vector helpers", () => {
  it("dist / unit / perp", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 10);
    const u = unit({ x: 0, y: 0 }, { x: 2, y: 0 });
    expect(u.x).toBeCloseTo(1, 10);
    expect(u.y).toBeCloseTo(0, 10);
    const p = perp({ x: 1, y: 2 });
    expect(p).toEqual({ x: -2, y: 1 });
    // Zero-length direction must not divide by zero.
    const z = unit({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(Number.isFinite(z.x) && Number.isFinite(z.y)).toBe(true);
  });
});

describe("fitAffine", () => {
  it("returns null for degenerate inputs", () => {
    expect(fitAffine([{ x: 0, y: 0 }, { x: 1, y: 0 }], NOMINAL.slice(0, 2))).toBeNull();
    expect(fitAffine(CORNERS, NOMINAL.slice(0, 3))).toBeNull();
  });

  it("maps the card corners to nominal mm (translation included)", () => {
    // The affine produced for calibration must map the four corner pixels to
    // their nominal mm positions — any downstream point mapping depends on it.
    const m = fitAffine(CORNERS, NOMINAL) as Affine;
    const mapped = CORNERS.map((c) => applyAffine(m, c));
    for (let i = 0; i < 4; i++) {
      expect(mapped[i].x).toBeCloseTo(NOMINAL[i].x, 6);
      expect(mapped[i].y).toBeCloseTo(NOMINAL[i].y, 6);
    }
  });
});

describe("affineSingularValues / affineInverse", () => {
  it("σ1 >= σ2 and σ1·σ2 = |det|", () => {
    const m = fitAffine(CORNERS, NOMINAL) as Affine;
    const { s1, s2 } = affineSingularValues(m);
    expect(s1).toBeGreaterThanOrEqual(s2);
    expect(s1 * s2).toBeCloseTo(Math.abs(m.a * m.d - m.b * m.c), 6);
  });

  it("inverse round-trips through the linear part", () => {
    const m = fitAffine(CORNERS, NOMINAL) as Affine;
    const inv = affineInverse(m) as Affine;
    const p = { x: 123, y: 456 };
    const rt = applyAffine(inv, applyAffine(m, p));
    expect(rt.x).toBeCloseTo(p.x, 6);
    expect(rt.y).toBeCloseTo(p.y, 6);
  });

  it("returns null for singular transforms", () => {
    expect(affineInverse({ a: 1, b: 2, c: 2, d: 4, tx: 0, ty: 0 })).toBeNull();
  });
});

describe("mmDistance — the width measurement seam", () => {
  // 856 px card → 10 px/mm; a 150 px guide is a 15 mm nail.
  const m = fitAffine(CORNERS, NOMINAL) as Affine;

  it("reads a 150 px segment as 15 mm (10 px/mm card)", () => {
    const mm = mmDistance(m, { x: 100, y: 100 }, { x: 250, y: 100 });
    expect(mm).toBeCloseTo(15, 6);
  });

  it("is orientation-invariant: a 150 px segment reads its exact card-plane distance on any axis", () => {
    // True axis scales: 856 px → 85.6 mm (0.1 mm/px) and 540 px → 53.98 mm.
    // A vertical 150 px segment now reads the y-axis scale — 53.98/540 × 150 ≈
    // 14.9944 mm — NOT the old isotropic long-edge 15.0.
    expect(mmDistance(m, { x: 100, y: 100 }, { x: 100, y: 250 })).toBeCloseTo(
      150 * (53.98 / 540),
      6
    );
    // Diagonal 150 px (3-4-5: 90 px across, 120 px down): each axis contributes
    // its own exact px/mm scale → ≈ 14.996 mm, not the isotropic 15.0.
    expect(mmDistance(m, { x: 100, y: 100 }, { x: 190, y: 220 })).toBeCloseTo(
      Math.hypot(90 * (85.6 / 856), 120 * (53.98 / 540)),
      6
    );
  });

  it("reads EXACTLY 15 mm at tilt — long-axis 25° and short-axis 20° (no over-read)", () => {
    // The tilt warning is decoupled from mmDistance: isTilted + TILT_WARN_RATIO
    // drive the calibration-step warning (covered in card.test.ts "tilt warning
    // threshold"). Both tilts exceed TILT_WARN_RATIO (cos 25° ≈ 0.9063,
    // cos 20° ≈ 0.9397 < 0.967) and used to over-read by ~1/cos(tilt); the exact
    // card-plane mapping must now return 15.0 exactly.
    // Long-axis tilt: long edge compressed by cos(25°).
    const c = Math.cos((25 * Math.PI) / 180);
    const tilted = CORNERS.map((p, i) => ({
      x: i === 1 || i === 2 ? p.x * c : p.x,
      y: p.y,
    }));
    const mt = fitAffine(tilted, NOMINAL) as Affine;
    // True 15 mm nail lies along the compressed (long) axis.
    expect(mmDistance(mt, { x: 100, y: 200 }, { x: 100 + 150 * c, y: 200 })).toBeCloseTo(15, 6);

    // Short-axis tilt: short edge compressed by cos(20°).
    const cs = Math.cos((20 * Math.PI) / 180);
    const tiltedS = CORNERS.map((p, i) => ({
      x: p.x,
      y: i === 2 || i === 3 ? p.y * cs : p.y,
    }));
    const ms = fitAffine(tiltedS, NOMINAL) as Affine;
    // True 15 mm nail along the compressed (short) axis; the short-edge scale
    // is 540/53.98 px/mm, so the nail spans 15 × 540/53.98 px before compression.
    const shortPxPerMm = 540 / 53.98;
    expect(
      mmDistance(ms, { x: 200, y: 100 }, { x: 200, y: 100 + 15 * shortPxPerMm * cs })
    ).toBeCloseTo(15, 6);
  });
});

describe("longEdgePxPerMm", () => {
  it("reports px per mm along the long edge (10 for a 856 px card)", () => {
    const m = fitAffine(CORNERS, NOMINAL) as Affine;
    expect(longEdgePxPerMm(m)).toBeCloseTo(10, 6);
  });
});