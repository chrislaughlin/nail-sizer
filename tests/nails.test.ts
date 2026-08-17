/**
 * lib/cv/nails — skin mask and width-guide proposals.
 *
 * Acceptance-critical: a top-down hand photo should yield one width guide
 * per visible nail (proposals are assisted, never silently trusted).
 */
import { describe, expect, it } from "vitest";
import { proposeNailGuides, skinMask } from "../lib/cv/nails";
import { handImage, makeImage, SKIN, DARK_BG } from "./helpers";

describe("skinMask", () => {
  it("labels skin pixels and rejects background", () => {
    const img = makeImage(3, 1, (x) => (x === 1 ? SKIN : DARK_BG));
    expect(Array.from(skinMask(img))).toEqual([0, 255, 0]);
  });

  it("rejects clearly non-skin colors (blue, near-black, bright green)", () => {
    const img = makeImage(3, 1, (x) =>
      x === 0 ? [0, 0, 255] : x === 1 ? [8, 8, 8] : [0, 255, 60]
    );
    expect(Array.from(skinMask(img))).toEqual([0, 0, 0]);
  });

  it("registers darker skin tones", () => {
    const img = makeImage(1, 1, () => [80, 55, 45]);
    expect(Array.from(skinMask(img))).toEqual([255]);
  });
});

describe("proposeNailGuides", () => {
  it("returns nothing on an empty scene", () => {
    const img = makeImage(320, 240, () => DARK_BG);
    expect(proposeNailGuides(img)).toEqual([]);
  });

  it("proposes one width guide per visible fingertip", () => {
    const img = handImage(640, 480);
    const proposals = proposeNailGuides(img);
    expect(proposals.length).toBeGreaterThanOrEqual(1);
    for (const p of proposals) {
      expect(p.p1).toBeDefined();
      expect(p.p2).toBeDefined();
      // Guides are non-degenerate segments.
      expect(Math.hypot(p.p2.x - p.p1.x, p.p2.y - p.p1.y)).toBeGreaterThan(8);
      expect(p.id).toBeGreaterThanOrEqual(0);
    }
  });
});