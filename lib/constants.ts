import type { Finger, Hand } from "./types";

export const CARD_LONG_MM = 85.6;
export const CARD_SHORT_MM = 53.98;
export const CARD_ASPECT = CARD_LONG_MM / CARD_SHORT_MM; // ≈ 1.586 (ISO/IEC 7810 ID-1 / CR80)
export const BUSINESS_CARD_ASPECT = 1.75;

/** Accept a quadrilateral as an ID-1 card when its tilt-corrected aspect
 *  ratio falls in this band (covers corner-radius variance and mild
 *  perspective distortion). */
export const CARD_ASPECT_MIN = 1.5;
export const CARD_ASPECT_MAX = 1.66;
/** Refuse rectangles in the 1.75:1 business-card band. */
export const BIZCARD_ASPECT_MIN = 1.67;
export const BIZCARD_ASPECT_MAX = 1.86;

/** Warn (not block) when projected scale error would exceed ~3.3%
 *  (±0.5 mm on a 15 mm nail) — i.e. cos(tilt) below this value. */
export const TILT_WARN_RATIO = 0.967;

export const MIN_NAIL_MM = 7;
export const MAX_NAIL_MM = 23;

export const CURVE_CLASS_THRESHOLDS = {
  deepMax: 7,
  mediumMax: 10,
} as const;
export const CURVE_RADIUS_SANE = { min: 4, max: 20 } as const;

/** Chart-relative size brackets, labelled "relative guide" (sizes differ by brand). */
export const RELATIVE_SIZE = [
  { label: "S", min: 7, max: 9.5 },
  { label: "M", min: 9.5, max: 12.5 },
  { label: "L", min: 12.5, max: 23 },
] as const;

export const FINGERS: Finger[] = ["thumb", "index", "middle", "ring", "pinky"];

export const FINGER_LABELS: Record<Finger, string> = {
  thumb: "Thumb",
  index: "Index",
  middle: "Middle",
  ring: "Ring",
  pinky: "Pinky",
};

export const HAND_LABELS: Record<Hand, string> = {
  left: "Left",
  right: "Right",
};

export function nailLabel(hand: Hand, finger: Finger): string {
  return `${HAND_LABELS[hand]} ${FINGER_LABELS[finger]}`;
}

export const CURVE_CLASS_LABELS: Record<"flat" | "medium" | "deep", string> = {
  flat: "Flat",
  medium: "Medium",
  deep: "Deep",
};

export const MAX_TECH_NAME_LENGTH = 28;
export const MAX_CONTACT_HINT_LENGTH = 80;

export const STORAGE_KEY = "nail-sizer:progress:v1";
export const STORAGE_VERSION = 1;

export const ACCURACY_CAVEAT =
  "This chart is a guide to share with your nail tech — sizes differ by brand, so share the mm readings.";

export const WIDTH_CONVENTION_NOTE =
  "Measured at the widest point of the nail bed";

export const CURVE_CONVENTION_NOTE =
  "Curve: radius of curvature in mm — smaller means deeper";

export function relativeSize(mm: number): string {
  if (mm < RELATIVE_SIZE[0].min || mm >= RELATIVE_SIZE[2].max) return "—";
  for (const band of RELATIVE_SIZE) {
    if (mm >= band.min && mm < band.max) return band.label;
  }
  return "—";
}