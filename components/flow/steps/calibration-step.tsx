"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { correctedAspect, detectCard, isTilted, quadFromCorners } from "@/lib/cv/card";
import type { WorkingImage } from "@/lib/cv/image";
import type { CardQuad, Point } from "@/lib/types";
import CaptureView, { type CaptureMode, type FrozenFrame } from "../capture";
import { CanvasHost, CornerOverlay } from "../guides";
import { PoseHandAndCard } from "../poses";

interface CalibrationStepProps {
  onCalibrated: () => void;
}

type Phase =
  | "capture"
  | "confirm"
  | "manual-corners"
  | "business-card"
  | "not-found"
  | "no-card";

const INITIAL_CORNERS = { x: 0.28, y: 0.3 };

export default function CalibrationStep({ onCalibrated }: CalibrationStepProps) {
  const [mode, setMode] = useState<CaptureMode>("live");
  const [phase, setPhase] = useState<Phase>("capture");
  const [frozen, setFrozen] = useState<FrozenFrame | null>(null);
  const [quad, setQuad] = useState<CardQuad | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const [manualQuad, setManualQuad] = useState<CardQuad | null>(null);
  const [manualAspectBad, setManualAspectBad] = useState<string | null>(null);
  const liveOverlayRef = useRef<HTMLCanvasElement>(null);

  const onFrozen = useCallback((frame: FrozenFrame) => {
    setFrozen(frame);
    const detection = detectCard(frame.image);
    if (detection.kind === "ok") {
      setQuad(detection.quad);
      setPhase("confirm");
    } else if (detection.kind === "business-card") {
      setPhase("business-card");
    } else {
      setPhase("not-found");
    }
  }, []);

  const onLiveTick = useCallback((image: WorkingImage) => {
    const detection = detectCard(image, { minAreaFraction: 0.02, dpEpsilonFraction: 0.01 });
    const overlay = liveOverlayRef.current;
    if (!overlay) return;
    const host = overlay.parentElement;
    if (!host) return;
    overlay.width = host.clientWidth;
    overlay.height = host.clientHeight;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (detection.kind !== "ok") return;
    // Map analysis coords -> overlay coords (video uses object-cover).
    const scale = Math.max(
      overlay.width / image.width,
      overlay.height / image.height
    );
    const ox = (overlay.width - image.width * scale) / 2;
    const oy = (overlay.height - image.height * scale) / 2;
    ctx.strokeStyle = "#DDC0BF";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    detection.quad.corners.forEach((c, i) => {
      const x = c.x * scale + ox;
      const y = c.y * scale + oy;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }, []);

  const onCameraUnavailable = useCallback(() => setMode("upload"), []);

  const startManual = useCallback(() => {
    if (!frozen) return;
    const w = frozen.image.width;
    const h = frozen.image.height;
    setCorners([
      { x: w * INITIAL_CORNERS.x, y: h * INITIAL_CORNERS.y },
      { x: w * (1 - INITIAL_CORNERS.x), y: h * INITIAL_CORNERS.y },
      { x: w * (1 - INITIAL_CORNERS.x), y: h * (1 - INITIAL_CORNERS.y) },
      { x: w * INITIAL_CORNERS.x, y: h * (1 - INITIAL_CORNERS.y) },
    ]);
    setManualQuad(null);
    setManualAspectBad(null);
    setPhase("manual-corners");
  }, [frozen]);

  const onCornersChange = useCallback((next: Point[]) => {
    setCorners(next);
    const q = quadFromCorners(next);
    if (!q) return;
    const aspect = q.corners.length
      ? correctedAspect(q)
      : 0;
    if (aspect >= 1.67 && aspect <= 1.86) {
      setManualQuad(null);
      setManualAspectBad("business-card");
    } else if (aspect >= 1.5 && aspect <= 1.66) {
      setManualQuad(q);
      setManualAspectBad(null);
    } else {
      setManualQuad(null);
      setManualAspectBad("unknown");
    }
  }, []);

  const reset = useCallback(() => {
    setFrozen(null);
    setQuad(null);
    setCorners([]);
    setManualQuad(null);
    setManualAspectBad(null);
    setPhase("capture");
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-3xl text-plum">Find your card</h2>
        <p className="mt-1 text-plum-soft">
          Place your bank card or ID card flat on the table, and hold the phone
          flat above it — we&apos;ll spot it automatically.
        </p>
      </div>

      <PoseHandAndCard caption="Card flat on the table, phone held flat above it" />

      {(phase === "capture" || phase === "business-card" || phase === "not-found" || phase === "no-card") && (
        <CaptureView
          label="your card"
          mode={mode}
          onModeChange={setMode}
          onFrozen={onFrozen}
          onLiveTick={onLiveTick}
          onCameraUnavailable={onCameraUnavailable}
          captureButtonLabel="Use this photo"
          liveOverlay={
            <div className="pointer-events-none absolute inset-0">
              {/* framing guide */}
              <div className="absolute inset-x-8 top-[18%] bottom-[30%] rounded-2xl border-2 border-dashed border-plum/40" />
              <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-plum-soft">
                Keep the whole card inside the frame
              </p>
              <canvas
                ref={liveOverlayRef}
                className="absolute inset-0 h-full w-full"
                aria-hidden="true"
              />
            </div>
          }
        />
      )}

      {phase === "business-card" && (
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-lg text-plum">
            That looks like a <strong>business card</strong> — we need a bank
            or ID card instead.
          </p>
          <p className="mt-2 text-sm text-plum-soft">
            Business cards aren&apos;t a standard size, so they can&apos;t be
            used as the measuring stick. Grab a bank, credit, or ID card.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-full bg-plum px-6 py-3 font-semibold text-cream hover:bg-plum-soft"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => setPhase("capture")}
              className="rounded-full border-2 border-plum/20 px-6 py-2.5 text-sm font-medium text-plum"
            >
              I&apos;ll get a bank card
            </button>
          </div>
        </div>
      )}

      {phase === "not-found" && frozen && (
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-lg text-plum">
            We couldn&apos;t find the card in that photo.
          </p>
          <p className="mt-2 text-sm text-plum-soft">
            Make sure the whole card is in frame, lying flat, with nothing
            covering it. Try again — or outline the card yourself.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-full bg-plum px-6 py-3 font-semibold text-cream hover:bg-plum-soft"
            >
              Take another photo
            </button>
            <button
              type="button"
              onClick={startManual}
              className="rounded-full border-2 border-plum/20 px-6 py-2.5 text-sm font-medium text-plum"
            >
              Draw the corners myself
            </button>
          </div>
        </div>
      )}

      {phase === "no-card" && (
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-lg text-plum">We really do need that card.</p>
          <p className="mt-2 text-sm text-plum-soft">
            The card is the measuring stick — without it the numbers can&apos;t
            be trusted. Grab your bank, credit, or ID card and come back.
          </p>
          <button
            type="button"
            onClick={() => setPhase("capture")}
            className="mt-4 rounded-full bg-plum px-6 py-3 font-semibold text-cream hover:bg-plum-soft"
          >
            I have it now — let&apos;s go
          </button>
        </div>
      )}

      {phase === "confirm" && frozen && quad && (
        <div className="flex flex-col gap-4">
          <div className="relative rounded-3xl overflow-hidden border-2 border-rose">
            <CanvasHost canvas={frozen.canvas} />
            <CardQuadOverlay quad={quad} image={frozen.image} />
          </div>
          {isTilted(quad) && (
            <div className="rounded-3xl border border-peach bg-peach/30 p-4 text-sm text-plum">
              The card looks a little tilted. Hold the phone flat above it for
              the most accurate numbers — but if this photo looks right, go
              ahead.
            </div>
          )}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onCalibrated}
              className="rounded-full bg-plum px-6 py-3 font-semibold text-cream hover:bg-plum-soft"
            >
              That&apos;s my card →
            </button>
            <div className="flex justify-between gap-3">
              <button
                type="button"
                onClick={reset}
                className="min-h-11 flex-1 rounded-full border-2 border-plum/20 px-4 text-sm font-medium text-plum"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={startManual}
                className="min-h-11 flex-1 rounded-full border-2 border-plum/20 px-4 text-sm font-medium text-plum"
              >
                Adjust corners
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "manual-corners" && frozen && (
        <div className="flex flex-col gap-4">
          <div className="relative rounded-3xl overflow-hidden border-2 border-rose">
            <CornerOverlay
              canvas={frozen.canvas}
              image={frozen.image}
              corners={corners}
              onChange={onCornersChange}
            />
          </div>
          {manualAspectBad === "business-card" && (
            <div className="rounded-3xl border border-rose bg-rose/25 p-4 text-sm text-plum">
              That looks like a business card — we need a bank or ID card.
              Adjust the corners so they follow your bank/ID card, or use a
              bank card.
            </div>
          )}
          {manualAspectBad === "unknown" && (
            <div className="rounded-3xl border border-peach bg-peach/30 p-4 text-sm text-plum">
              That shape doesn&apos;t look like a standard card yet — nudge the
              corners until they trace your card&apos;s edges.
            </div>
          )}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled={!manualQuad}
              onClick={onCalibrated}
              className="rounded-full bg-plum px-6 py-3 font-semibold text-cream hover:bg-plum-soft disabled:opacity-40"
            >
              Use these corners →
            </button>
            <div className="flex justify-between gap-3">
              <button
                type="button"
                onClick={reset}
                className="min-h-11 flex-1 rounded-full border-2 border-plum/20 px-4 text-sm font-medium text-plum"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={() => setPhase("capture")}
                className="min-h-11 flex-1 rounded-full border-2 border-plum/20 px-4 text-sm font-medium text-plum"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "capture" && (
        <button
          type="button"
          onClick={() => setPhase("no-card")}
          className="min-h-11 self-center px-4 text-sm text-plum-soft underline underline-offset-4 hover:text-plum"
        >
          I don&apos;t have a card with me
        </button>
      )}
    </div>
  );
}

/** Draws the detected card outline on top of the frozen frame. */
function CardQuadOverlay({ quad, image }: { quad: CardQuad; image: WorkingImage }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#DDC0BF";
    ctx.lineWidth = Math.max(3, image.width / 260);
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    quad.corners.forEach((c, i) => {
      if (i === 0) ctx.moveTo(c.x, c.y);
      else ctx.lineTo(c.x, c.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `600 ${Math.max(13, image.width / 55)}px Geist, system-ui, sans-serif`;
    ctx.fillStyle = "#5C3A3A";
    ctx.textAlign = "center";
    const cx = (quad.corners[0].x + quad.corners[2].x) / 2;
    const cy = (quad.corners[0].y + quad.corners[2].y) / 2;
    ctx.fillText("Card found · 85.6 mm", cx, cy);
  }, [quad, image]);
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}