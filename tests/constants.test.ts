/**
 * lib/constants — shared domain constants used across calibration, width
 * gating, curvature, and the chart. Pins the approved plan's numbers.
 */
import { describe, expect, it } from "vitest";
import {
  ACCURACY_CAVEAT,
  BIZCARD_ASPECT_MAX,
  BIZCARD_ASPECT_MIN,
  CARD_ASPECT,
  CARD_ASPECT_MAX,
  CARD_ASPECT_MIN,
  CARD_LONG_MM,
  CARD_SHORT_MM,
  HAND_LABELS,
  MAX_CONTACT_HINT_LENGTH,
  MAX_NAIL_MM,
  MAX_TECH_NAME_LENGTH,
  MIN_NAIL_MM,
  nailLabel,
  relativeSize,
  STORAGE_KEY,
  STORAGE_VERSION,
} from "../lib/constants";

describe("card reference constants", () => {
  it("ID-1 card is 85.6 × 53.98 mm, aspect ≈ 1.586", () => {
    expect(CARD_LONG_MM).toBe(85.6);
    expect(CARD_SHORT_MM).toBe(53.98);
    expect(CARD_ASPECT).toBeCloseTo(1.586, 3);
  });

  it("ID-1 acceptance band covers corner-radius variance; business-card band sits above it", () => {
    expect(CARD_ASPECT_MIN).toBe(1.5);
    expect(CARD_ASPECT_MAX).toBe(1.66);
    expect(BIZCARD_ASPECT_MIN).toBe(1.67);
    expect(BIZCARD_ASPECT_MAX).toBe(1.86);
    expect(BIZCARD_ASPECT_MIN).toBeGreaterThan(CARD_ASPECT_MAX);
    expect(1.75).toBeGreaterThanOrEqual(BIZCARD_ASPECT_MIN);
    expect(1.75).toBeLessThanOrEqual(BIZCARD_ASPECT_MAX);
  });
});

describe("nail width gate", () => {
  it("rejects widths outside 7–23 mm", () => {
    expect(MIN_NAIL_MM).toBe(7);
    expect(MAX_NAIL_MM).toBe(23);
  });
});

describe("labels", () => {
  it("nailLabel composes hand + finger labels", () => {
    expect(HAND_LABELS).toEqual({ left: "Left", right: "Right" });
    expect(nailLabel("left", "thumb")).toBe("Left Thumb");
    expect(nailLabel("right", "pinky")).toBe("Right Pinky");
  });
});

describe("relativeSize (convention-labelled sizes)", () => {
  it("maps S/M/L bands with half-open boundaries", () => {
    expect(relativeSize(6.99)).toBe("—");
    expect(relativeSize(7)).toBe("S");
    expect(relativeSize(9.49)).toBe("S");
    expect(relativeSize(9.5)).toBe("M");
    expect(relativeSize(12.49)).toBe("M");
    expect(relativeSize(12.5)).toBe("L");
    expect(relativeSize(22.99)).toBe("L");
    expect(relativeSize(23)).toBe("—");
  });
});

describe("caps and caveats", () => {
  it("caps tech name at 28 and contact hint at 80", () => {
    expect(MAX_TECH_NAME_LENGTH).toBe(28);
    expect(MAX_CONTACT_HINT_LENGTH).toBe(80);
  });

  it("storage key is versioned", () => {
    expect(STORAGE_KEY).toBe("nail-sizer:progress:v1");
    expect(STORAGE_VERSION).toBe(1);
  });

  it("accuracy caveat tells the customer to share mm, not sizes", () => {
    expect(ACCURACY_CAVEAT).toContain("sizes differ by brand");
    expect(ACCURACY_CAVEAT).toContain("share the mm readings");
  });
});