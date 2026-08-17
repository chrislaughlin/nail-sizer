import {
  ACCURACY_CAVEAT,
  CURVE_CLASS_LABELS,
  FINGERS,
  HAND_LABELS,
  nailLabel,
  relativeSize,
  WIDTH_CONVENTION_NOTE,
} from "./constants";
import type { Finger, Hand, ProgressState } from "./types";

const W = 1100;
const PAD = 48;
const ROW_H = 64;
const HEADER_H = 168;
const FOOTER_H = 210;

export const CHART_TITLE = "Nail Sizer";

const PLUM = "#5C3A3A";
const PLUM_SOFT = "#8A6A6A";
const CREAM = "#FAF6F2";
const WHITE = "#FFFFFF";
const ROSE = "#DDC0BF";
const ROSE_DEEP = "#C9A3A2";
const PEACH = "#F3CFC3";
const LILAC = "#D9CFE8";

export interface ChartData {
  techName: string;
  contactHint?: string;
  widths: Record<Hand, Partial<Record<Finger, { mm: number; status: string }>>>;
  curves: Record<Hand, Partial<Record<Finger, { status: string; class?: string; radiusMm?: number }>>>;
  curveUnmeasuredHands: Hand[];
  measuredAt: Date;
}

export function chartDataFromProgress(p: ProgressState): ChartData {
  return {
    techName: p.techName,
    contactHint: p.contactHint,
    widths: p.widths,
    curves: p.curves,
    curveUnmeasuredHands: (["left", "right"] as Hand[]).filter(
      (h) => FINGERS.every((f) => p.curves[h][f]?.status === "unmeasured")
    ),
    measuredAt: new Date(p.updatedAt),
  };
}

/**
 * Render the share chart to a canvas: tech-branded header band, 10 per-nail
 * rows (mm width, curve class + radius, relative guide), conventions footer.
 * Contains no card pixels and no photos.
 */
export function renderChart(data: ChartData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = HEADER_H + 10 * ROW_H + 56 + FOOTER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  // Background
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, canvas.height);

  // Header gradient band (rose → peach → lilac)
  const gradient = ctx.createLinearGradient(0, 0, W, HEADER_H);
  gradient.addColorStop(0, ROSE);
  gradient.addColorStop(0.5, PEACH);
  gradient.addColorStop(1, LILAC);
  roundRect(ctx, PAD - 24, 24, W - 2 * (PAD - 24), HEADER_H - 24, 28);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Wordmark + tech badge
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = PLUM;
  ctx.font = '700 44px Fraunces, Georgia, "Times New Roman", serif';
  ctx.fillText(CHART_TITLE, PAD + 8, 92);
  ctx.font = '500 22px Geist, system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText("Measurements for your nail tech", PAD + 8, 124);

  // Tech badge pill
  const badgeText = data.techName;
  ctx.font = '600 24px Geist, system-ui, -apple-system, "Segoe UI", sans-serif';
  const badgeW = ctx.measureText(badgeText).width + 56;
  roundRect(ctx, W - PAD - badgeW + 8, 52, badgeW, 52, 26);
  ctx.fillStyle = WHITE;
  ctx.fill();
  ctx.fillStyle = PLUM;
  ctx.textAlign = "center";
  ctx.fillText(badgeText, W - PAD + 8 - badgeW / 2, 87);
  ctx.textAlign = "left";

  if (data.contactHint) {
    ctx.fillStyle = PLUM;
    ctx.font = '500 18px Geist, system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillText(data.contactHint, W - PAD + 8 - badgeW + 8, 126);
  }

  // Table header
  const y = HEADER_H + 14;
  ctx.font = '600 18px Geist, system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = PLUM_SOFT;
  ctx.fillText("Nail", PAD, y + 24);
  ctx.fillText("Width", PAD + 300, y + 24);
  ctx.fillText("Curve", PAD + 560, y + 24);
  ctx.fillText("Guide", PAD + 880, y + 24);

  // Rows: 5 left + 5 right, thumb first
  const hands: Hand[] = ["left", "right"];
  let row = 0;
  for (const hand of hands) {
    for (const finger of FINGERS) {
      const rowY = y + 46 + row * ROW_H;
      const fill = row % 2 === 0 ? WHITE : CREAM;
      ctx.fillStyle = fill;
      roundRect(ctx, PAD - 20, rowY - 8, W - 2 * (PAD - 20), ROW_H - 10, 14);
      ctx.fill();

      ctx.fillStyle = PLUM;
      ctx.font = '600 24px Geist, system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillText(nailLabel(hand, finger), PAD, rowY + 30);

      drawHandGlyph(ctx, hand, finger, PAD + 170, rowY - 4, 26);

      // Width
      const width = data.widths[hand][finger];
      ctx.font = '600 24px Geist, system-ui, -apple-system, "Segoe UI", sans-serif';
      if (width && width.status === "confirmed") {
        ctx.fillText(`${width.mm.toFixed(1)} mm`, PAD + 300, rowY + 30);
        const rel = relativeSize(width.mm);
        ctx.font = '500 22px Geist, system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.fillStyle = PLUM_SOFT;
        ctx.fillText(rel === "—" ? "—" : `${rel} (relative)`, PAD + 880, rowY + 30);
        ctx.fillStyle = PLUM;
      } else if (width && width.status === "out-of-range") {
        ctx.fillStyle = "#A0634E";
        ctx.fillText("out of range", PAD + 300, rowY + 30);
        ctx.fillStyle = PLUM;
      } else {
        ctx.fillStyle = PLUM_SOFT;
        ctx.fillText("—", PAD + 300, rowY + 30);
        ctx.fillStyle = PLUM;
      }

      // Curve
      const curve = data.curves[hand][finger];
      ctx.font = '500 22px Geist, system-ui, -apple-system, "Segoe UI", sans-serif';
      if (curve && curve.status === "measured" && curve.class) {
        const cls = CURVE_CLASS_LABELS[curve.class as keyof typeof CURVE_CLASS_LABELS];
        const radius =
          typeof curve.radiusMm === "number"
            ? ` · ${curve.radiusMm.toFixed(1)} mm`
            : "";
        ctx.fillText(`${cls}${radius}`, PAD + 560, rowY + 30);
      } else {
        ctx.fillStyle = PLUM_SOFT;
        ctx.fillText("unmeasured", PAD + 560, rowY + 30);
        ctx.fillStyle = PLUM;
      }
      row++;
    }
  }

  // Footer notes
  const footerY = y + 46 + 10 * ROW_H + 34;
  ctx.fillStyle = PLUM;
  ctx.font = '600 18px Geist, system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText(WIDTH_CONVENTION_NOTE, PAD, footerY);
  ctx.font = '400 18px Geist, system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = PLUM_SOFT;
  let fy = footerY + 32;
  ctx.fillText(
    "Sizes differ by brand — share these mm readings with your tech.",
    PAD,
    fy
  );
  fy += 30;
  ctx.fillText(
    "Curve radius is estimated from photos. Chord/projected width convention.",
    PAD,
    fy
  );
  fy += 30;
  ctx.fillText(ACCURACY_CAVEAT, PAD, fy);
  for (const hand of data.curveUnmeasuredHands) {
    fy += 30;
    ctx.fillText(
      `${HAND_LABELS[hand]} hand: curvature unmeasured — customer could not pose.`,
      PAD,
      fy
    );
  }
  fy += 30;
  ctx.fillText(
    data.measuredAt.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    PAD,
    fy
  );
  ctx.fillStyle = PLUM;
  ctx.font = '600 18px Geist, system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = "right";
  ctx.fillText(CHART_TITLE, W - PAD, fy);
  ctx.textAlign = "left";

  return canvas;
}

/** Compact per-nail spec lines for copy/paste anywhere. */
export function buildTextSummary(p: ProgressState): string {
  const lines: string[] = [];
  lines.push(`Nail Sizer — sizes for ${p.techName}`);
  if (p.contactHint) lines.push(p.contactHint);
  lines.push("");
  lines.push(
    "Measured at the widest point of the nail bed. Sizes differ by brand — share mm with your tech."
  );
  lines.push("");
  for (const hand of ["left", "right"] as Hand[]) {
    for (const finger of FINGERS) {
      const w = p.widths[hand][finger];
      const c = p.curves[hand][finger];
      const label = nailLabel(hand, finger);
      let line = `${label} — `;
      if (w && w.status === "confirmed") {
        line += `${w.mm.toFixed(1)} mm`;
      } else if (w && w.status === "out-of-range") {
        line += "width out of range (unmeasurable here)";
      } else {
        line += "width unmeasured";
      }
      if (c && c.status === "measured" && c.class) {
        const cls = CURVE_CLASS_LABELS[c.class];
        line += ` · curve ${cls.toLowerCase()}${
          typeof c.radiusMm === "number" ? ` (~${c.radiusMm.toFixed(1)} mm)` : ""
        }`;
      } else {
        line += ` · curvature unmeasured`;
      }
      lines.push(line);
    }
  }
  lines.push("");
  lines.push(ACCURACY_CAVEAT);
  return lines.join("\n");
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export interface ShareOutcome {
  kind: "shared" | "downloaded" | "copied" | "none";
  error?: string;
}

/**
 * Share the chart: Web Share API with the PNG file when supported
 * (WhatsApp/Email/iMessage as available on-device); otherwise fall back
 * to download + copy text (handled by the caller UI).
 */
export async function shareChartPng(
  data: ChartData,
  text: string
): Promise<ShareOutcome> {
  const canvas = renderChart(data);
  const blob = await canvasToPngBlob(canvas);
  if (!blob) return { kind: "none", error: "png render failed" };
  if (typeof navigator !== "undefined" && navigator.share) {
    const file = new File([blob], "nail-sizer-chart.png", { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Nail Sizer — ${data.techName}`,
          text,
        });
        return { kind: "shared" };
      }
      await navigator.share({ title: `Nail Sizer — ${data.techName}`, text });
      return { kind: "shared" };
    } catch (err) {
      // Aborted by user or unsupported — fall back silently.
      if (err instanceof DOMException && err.name === "AbortError") {
        return { kind: "none", error: "aborted" };
      }
      return { kind: "none", error: String(err) };
    }
  }
  downloadBlob(blob, "nail-sizer-chart.png");
  return { kind: "downloaded" };
}

function drawHandGlyph(
  ctx: CanvasRenderingContext2D,
  hand: Hand,
  active: Finger,
  x: number,
  y: number,
  size: number
): void {
  // Palm-down, fingers-up glyph: 4 fingers in a row, thumb offset below.
  const fingerIdx = FINGERS.indexOf(active);
  const spacing = size * 0.62;
  const startX = x - spacing * 2;
  const offsets = hand === "left" ? [-1, 0, 1, 2, 3] : [3, 2, 1, 0, -1];
  const dotY = [0, 0, 0, 0, 1];
  for (let i = 0; i < 5; i++) {
    const px = startX + offsets[i] * spacing;
    const py = y + dotY[i] * size * 0.8;
    ctx.beginPath();
    ctx.arc(px, py, i === fingerIdx ? size * 0.34 : size * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = i === fingerIdx ? ROSE_DEEP : ROSE;
    ctx.fill();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}