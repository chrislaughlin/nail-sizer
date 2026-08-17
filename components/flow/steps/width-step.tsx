"use client";

import { useCallback, useState } from "react";
import {
  MAX_NAIL_MM,
  MIN_NAIL_MM,
  FINGERS,
  FINGER_LABELS,
  HAND_LABELS,
} from "@/lib/constants";
import { detectCard, quadFromCorners } from "@/lib/cv/card";
import { proposeNailGuides, placeGuideAt } from "@/lib/cv/nails";
import { mmDistance } from "@/lib/geometry";
import type {
  CardQuad,
  Finger,
  Hand,
  NailWidth,
  Point,
} from "@/lib/types";
import CaptureView, { type CaptureMode, type FrozenFrame } from "../capture";
import { CornerOverlay, GuideOverlay, type Guide2D } from "../guides";
import { PoseWidthHand } from "../poses";

interface WidthStepProps {
  hand: Hand;
  onComplete: (widths: Partial<Record<Finger, NailWidth>>) => void;
}

type CardStatus = "ok" | "business-card" | "not-found" | "manual";

/** Finger ordering leftmost → rightmost in a palm-down, fingers-up photo. */
const RANK_ORDER: Record<Hand, Finger[]> = {
  left: ["pinky", "ring", "middle", "index", "thumb"],
  right: ["thumb", "index", "middle", "ring", "pinky"],
};

const TILE_LABELS: Record<Finger, string> = FINGER_LABELS;

export default function WidthStep({ hand, onComplete }: WidthStepProps) {
  const [mode, setMode] = useState<CaptureMode>("live");
  const [frozen, setFrozen] = useState<FrozenFrame | null>(null);
  const [cardQuad, setCardQuad] = useState<CardQuad | null>(null);
  const [cardStatus, setCardStatus] = useState<CardStatus | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const [manualQuad, setManualQuad] = useState<CardQuad | null>(null);
  const [manualAspectBad, setManualAspectBad] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guide2D[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [placingFinger, setPlacingFinger] = useState<Finger | null>(null);
  const [confirmed, setConfirmed] = useState<Partial<Record<Finger, NailWidth>>>({});
  const handWord = HAND_LABELS[hand].toLowerCase();

  const onFrozen = useCallback(
    (frame: FrozenFrame) => {
      setFrozen(frame);
      setSelectedId(null);
      setPlacingFinger(null);
      setCardStatus(null);
      setCardQuad(null);
      setCorners([]);
      setManualQuad(null);
      setManualAspectBad(null);
      setGuides([]);

      const card = detectCard(frame.image);
      if (card.kind === "ok") {
        setCardQuad(card.quad);
        setCardStatus("ok");
      } else if (card.kind === "business-card") {
        setCardStatus("business-card");
        return;
      } else {
        setCardStatus("not-found");
      }

      const proposals = proposeNailGuides(frame.image);
      const order = RANK_ORDER[hand];
      const list: Guide2D[] = proposals.map((p, i) => {
        const finger = order[i];
        return { id: p.id, p1: p.p1, p2: p.p2, finger };
      });
      setGuides(list);
    },
    [hand]
  );

  const onCameraUnavailable = useCallback(() => setMode("upload"), []);

  const mmFor = useCallback(
    (g: Guide2D): number | null => {
      if (!cardQuad) return null;
      return mmDistance(cardQuad.affine, g.p1, g.p2);
    },
    [cardQuad]
  );

  const allDone =
    FINGERS.every(
      (f) =>
        confirmed[f]?.status === "confirmed" || confirmed[f]?.status === "out-of-range"
    ) && cardQuad !== null;

  const onGuidesChange = useCallback((next: Guide2D[]) => {
    setGuides(next);
  }, []);

  const onPlaced = useCallback(
    (point: Point) => {
      if (!placingFinger || !frozen) return;
      const seg = placeGuideAt(frozen.image, point);
      if (!seg) return;
      const id = guides.length;
      const next = [...guides, { id, p1: seg.p1, p2: seg.p2, finger: placingFinger }];
      setGuides(next);
      setSelectedId(id);
      setPlacingFinger(null);
    },
    [placingFinger, frozen, guides]
  );

  const confirmNail = useCallback(
    (finger: Finger) => {
      const g = guides.find((x) => x.finger === finger);
      if (!g) return;
      const mm = mmFor(g);
      if (mm === null) return;
      if (mm < MIN_NAIL_MM || mm > MAX_NAIL_MM) return;
      setConfirmed((prev) => ({ ...prev, [finger]: { mm, status: "confirmed" } }));
      setSelectedId(null);
    },
    [guides, mmFor]
  );

  const markUnmeasurable = useCallback(
    (finger: Finger) => {
      setConfirmed((prev) => ({ ...prev, [finger]: { mm: 0, status: "out-of-range" } }));
    },
    []
  );

  const startManual = useCallback(() => {
    if (!frozen) return;
    const w = frozen.image.width;
    const h = frozen.image.height;
    setCorners([
      { x: w * 0.22, y: h * 0.3 },
      { x: w * 0.78, y: h * 0.3 },
      { x: w * 0.78, y: h * 0.72 },
      { x: w * 0.22, y: h * 0.72 },
    ]);
    setManualQuad(null);
    setManualAspectBad(null);
    setCardStatus("manual");
  }, [frozen]);

  const onCornersChange = useCallback((next: Point[]) => {
    setCorners(next);
    const q = quadFromCorners(next);
    if (!q) return;
    const aspect = correctedAspect(q);
    if (aspect >= 1.67 && aspect <= 1.86) {
      setManualQuad(null);
      setManualAspectBad("business-card");
    } else if (aspect >= 1.5 && aspect <= 1.66) {
      setManualQuad(q);
      setManualAspectBad(null);
      setCardQuad(q);
    } else {
      setManualQuad(null);
      setManualAspectBad("unknown");
    }
  }, []);

  const reshoot = useCallback(() => {
    setFrozen(null);
    setCardQuad(null);
    setCardStatus(null);
    setCorners([]);
    setManualQuad(null);
    setManualAspectBad(null);
    setGuides([]);
    setSelectedId(null);
    setPlacingFinger(null);
    setConfirmed({});
  }, []);

  const finish = useCallback(() => {
    onComplete(confirmed);
  }, [confirmed, onComplete]);

  const captureVisible =
    !frozen || cardStatus === "not-found" || cardStatus === "business-card";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-3xl text-plum">
          Measure your {handWord} hand
        </h2>
        <p className="mt-1 text-plum-soft">
          Place your {handWord} hand flat, palm down, nails facing the camera —
          with the card beside it. Fingers slightly apart.
        </p>
      </div>

      <PoseWidthHand caption="Flat hand, nails up, card beside it" />

      {captureVisible && (
        <CaptureView
          label={`your ${handWord} hand and card`}
          mode={mode}
          onModeChange={setMode}
          onFrozen={onFrozen}
          onLiveTick={() => {}}
          onCameraUnavailable={onCameraUnavailable}
          captureButtonLabel="Use this photo"
          liveOverlay={
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-8 top-[10%] bottom-[22%] rounded-2xl border-2 border-dashed border-plum/40" />
              <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-plum-soft">
                Hand and card, both fully in frame
              </p>
            </div>
          }
        />
      )}

      {cardStatus === "business-card" && (
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-lg text-plum">
            That looks like a <strong>business card</strong> — we need a bank
            or ID card.
          </p>
          <p className="mt-2 text-sm text-plum-soft">
            Business cards aren&apos;t a standard size, so they can&apos;t be
            the measuring stick. Use your bank, credit, or ID card.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={reshoot}
              className="rounded-full bg-plum px-6 py-3 font-semibold text-cream hover:bg-plum-soft"
            >
              Take another photo
            </button>
            <button
              type="button"
              onClick={startManual}
              className="rounded-full border-2 border-plum/20 px-6 py-2.5 text-sm font-medium text-plum"
            >
              Draw the card&apos;s corners myself
            </button>
          </div>
        </div>
      )}

      {cardStatus === "not-found" && frozen && (
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-lg text-plum">We can&apos;t see the card.</p>
          <p className="mt-2 text-sm text-plum-soft">
            The card is the measuring stick — it needs to be fully in frame,
            flat on the table. Take another photo, or trace the card&apos;s
            corners yourself.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={reshoot}
              className="rounded-full bg-plum px-6 py-3 font-semibold text-cream hover:bg-plum-soft"
            >
              Take another photo
            </button>
            <button
              type="button"
              onClick={startManual}
              className="rounded-full border-2 border-plum/20 px-6 py-2.5 text-sm font-medium text-plum"
            >
              Draw the card&apos;s corners myself
            </button>
          </div>
        </div>
      )}

      {cardStatus === "manual" && frozen && (
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
            </div>
          )}
          {manualAspectBad === "unknown" && (
            <div className="rounded-3xl border border-peach bg-peach/30 p-4 text-sm text-plum">
              Nudge the corners until they trace your card&apos;s edges.
            </div>
          )}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled={!manualQuad}
              onClick={() => setCardStatus("ok")}
              className="rounded-full bg-plum px-6 py-3 font-semibold text-cream hover:bg-plum-soft disabled:opacity-40"
            >
              Use these corners →
            </button>
            <button
              type="button"
              onClick={reshoot}
              className="min-h-11 rounded-full border-2 border-plum/20 px-4 text-sm font-medium text-plum"
            >
              Retake
            </button>
          </div>
        </div>
      )}

      {cardStatus === "ok" && frozen && cardQuad && (
        <div className="flex flex-col gap-5">
          <div className="relative rounded-3xl overflow-hidden border-2 border-rose">
            <GuideOverlay
              canvas={frozen.canvas}
              image={frozen.image}
              guides={guides}
              selectedId={selectedId}
              placing={placingFinger !== null}
              outOfRangeIds={guides
                .filter((g) => {
                  const mm = mmFor(g);
                  return mm !== null && (mm < MIN_NAIL_MM || mm > MAX_NAIL_MM);
                })
                .map((g) => g.id)}
              onGuidesChange={onGuidesChange}
              onSelect={(id) => {
                setSelectedId(id);
                if (id !== null) setPlacingFinger(null);
              }}
              onPlaced={onPlaced}
            />
          </div>
          <p className="text-center text-sm text-plum-soft">
            Drag the ends of a line to adjust it · tap a nail below to lock it
          </p>

          <div className="grid grid-cols-1 gap-3">
            {FINGERS.map((finger) => {
              const guide = guides.find((g) => g.finger === finger);
              const result = confirmed[finger];
              const mm = guide ? mmFor(guide) : null;
              const outOfRange =
                mm !== null && (mm < MIN_NAIL_MM || mm > MAX_NAIL_MM);
              const placing = placingFinger === finger;

              return (
                <div
                  key={finger}
                  className={`rounded-3xl border-2 p-4 transition ${
                    result
                      ? "border-rose bg-rose/25"
                      : placing
                        ? "border-peach bg-peach/30"
                        : "border-plum/15 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-semibold ${
                          result
                            ? "pop-check bg-rose-deep text-cream"
                            : "bg-rose text-plum"
                        }`}
                        aria-hidden="true"
                      >
                        {result ? "✓" : guide ? guide.id + 1 : "·"}
                      </span>
                      <div>
                        <p className="font-semibold text-plum">
                          {TILE_LABELS[finger]}
                        </p>
                        <p className="text-sm text-plum-soft">
                          {result
                            ? result.status === "confirmed"
                              ? `${result.mm.toFixed(1)} mm — locked`
                              : "Out of range — marked unmeasurable"
                            : mm !== null
                              ? outOfRange
                                ? "Line outside the measurable range"
                                : `${mm.toFixed(1)} mm — drag to adjust`
                              : guide
                                ? "Adjust the line to read it"
                                : "No line yet"}
                        </p>
                      </div>
                    </div>

                    {!result && guide && mm !== null && !outOfRange && (
                      <button
                        type="button"
                        onClick={() => confirmNail(finger)}
                        className="shrink-0 rounded-full bg-plum px-5 py-2.5 text-sm font-semibold text-cream hover:bg-plum-soft"
                      >
                        Lock
                      </button>
                    )}
                    {!result && guide && mm !== null && outOfRange && (
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-xs font-semibold text-[#A0634E]">
                          {mm.toFixed(1)} mm — outside 7–23 mm
                        </span>
                        <button
                          type="button"
                          onClick={() => markUnmeasurable(finger)}
                          className="text-xs font-medium text-plum underline underline-offset-2"
                        >
                          This nail can&apos;t be measured — mark it
                        </button>
                      </div>
                    )}
                    {!result && placing && (
                      <span className="shrink-0 text-sm font-medium text-plum">
                        Tap the nail in the photo
                      </span>
                    )}
                    {!result && !guide && !placing && (
                      <button
                        type="button"
                        onClick={() => setPlacingFinger(finger)}
                        className="shrink-0 rounded-full border-2 border-plum/25 px-5 py-2.5 text-sm font-medium text-plum"
                      >
                        Place a line
                      </button>
                    )}
                    {result && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmed((prev) => {
                            const next = { ...prev };
                            delete next[finger];
                            return next;
                          });
                        }}
                        className="shrink-0 text-sm font-medium text-plum-soft underline underline-offset-2"
                      >
                        Adjust
                      </button>
                    )}
                  </div>

                  {!result && mm !== null && outOfRange && (
                    <p className="mt-2 text-xs text-plum-soft">
                      Press-on blanks don&apos;t safely cover nails under 7 mm
                      or over 23 mm — we won&apos;t invent a number for this
                      nail. Adjust the line if it&apos;s off, or mark it
                      unmeasurable and your tech will handle it.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-3">
            {allDone && (
              <button
                type="button"
                onClick={finish}
                className="rounded-full bg-plum px-8 py-4 text-lg font-semibold text-cream hover:bg-plum-soft"
              >
                {hand === "left" ? "Continue — right hand →" : "Continue →"}
              </button>
            )}
            <button
              type="button"
              onClick={reshoot}
              className="min-h-11 self-center px-4 text-sm text-plum-soft underline underline-offset-4 hover:text-plum"
            >
              Re-shoot this photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function correctedAspect(q: CardQuad): number {
  const { a, b, c, d } = q.affine;
  const pxLong = Math.hypot(a, c);
  const pxShort = Math.hypot(b, d);
  const measured = (pxLong * 85.6) / (pxShort * 53.98);
  return pxLong < pxShort ? measured / q.tiltRatio : measured * q.tiltRatio;
}