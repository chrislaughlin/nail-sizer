"use client";

import { useCallback, useState } from "react";
import {
  CURVE_CLASS_THRESHOLDS,
  CURVE_CLASS_LABELS,
  CURVE_RADIUS_SANE,
  FINGERS,
  FINGER_LABELS,
  HAND_LABELS,
} from "@/lib/constants";
import { detectNailArcs } from "@/lib/cv/curve";
import type { CurveClass, Finger, Hand, NailCurve, NailWidth } from "@/lib/types";
import CaptureView, { type CaptureMode, type FrozenFrame } from "../capture";
import { CanvasHost } from "../guides";
import { PoseEndOn } from "../poses";

interface CurveStepProps {
  hand: Hand;
  widths: Partial<Record<Finger, NailWidth>>;
  attempts: number;
  onAttempt: () => void;
  onComplete: (
    curves: Partial<Record<Finger, NailCurve>>,
    unmeasuredAll: boolean
  ) => void;
}

/** Same leftmost → rightmost ordering as the width step. */
const RANK_ORDER: Record<Hand, Finger[]> = {
  left: ["pinky", "ring", "middle", "index", "thumb"],
  right: ["thumb", "index", "middle", "ring", "pinky"],
};

interface CurveCandidate {
  finger: Finger;
  radiusMm: number;
  chordMm: number;
  class: CurveClass;
  chordFromArc: boolean;
}

export default function CurveStep({
  hand,
  widths,
  attempts,
  onAttempt,
  onComplete,
}: CurveStepProps) {
  const [mode, setMode] = useState<CaptureMode>("live");
  const [frozen, setFrozen] = useState<FrozenFrame | null>(null);
  const [candidates, setCandidates] = useState<CurveCandidate[]>([]);
  const [confirmed, setConfirmed] = useState<Partial<Record<Finger, NailCurve>>>({});
  const [skipped, setSkipped] = useState(false);
  const [failedRead, setFailedRead] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const handWord = HAND_LABELS[hand].toLowerCase();

  const onFrozen = useCallback(
    (frame: FrozenFrame) => {
      setFrozen(frame);
      setFailedRead(false);
      setCandidates([]);
      setDetecting(true);
      // Let the canvas paint before the (possibly slow) analysis runs.
      setTimeout(() => {
        const arcs = detectNailArcs(frame.image);
        setDetecting(false);

        if (arcs.length < 3) {
          setFailedRead(true);
          onAttempt();
          return;
        }

        const order = RANK_ORDER[hand];
        const next: CurveCandidate[] = [];
        const usableScales: number[] = [];

        for (let i = 0; i < Math.min(arcs.length, 5); i++) {
          const finger = order[i];
          const arc = arcs[i];
          const width = widths[finger];
          let scale: number | null = null;
          if (width && width.status === "confirmed" && width.mm > 0) {
            scale = arc.chordPx / width.mm;
            usableScales.push(scale);
          }
          next.push({ finger, radiusMm: 0, chordMm: 0, class: "flat", chordFromArc: false });
          if (scale) {
            const radiusMm = arc.radiusPx / scale;
            next[next.length - 1] = {
              finger,
              radiusMm,
              chordMm: arc.chordPx / scale,
              class: classifyCurve(radiusMm),
              chordFromArc: true,
            };
          }
        }

        // Fall back to the hand median scale for nails without a confirmed width.
        if (usableScales.length > 0) {
          const median = usableScales.sort((a, b) => a - b)[Math.floor(usableScales.length / 2)];
          for (let i = 0; i < next.length; i++) {
            const c = next[i];
            if (c.chordFromArc) continue;
            const arc = arcs[i];
            const radiusMm = arc.radiusPx / median;
            next[i] = {
              finger: c.finger,
              radiusMm,
              chordMm: arc.chordPx / median,
              class: classifyCurve(radiusMm),
              chordFromArc: false,
            };
          }
        }

        // Mark candidates outside the sane radius range as unusable.
        const usable = next.filter(
          (c) =>
            c.radiusMm >= CURVE_RADIUS_SANE.min && c.radiusMm <= CURVE_RADIUS_SANE.max
        );
        setCandidates(usable);
        if (usable.length < 3) {
          setFailedRead(true);
          onAttempt();
        }
      }, 30);
    },
    [hand, widths, onAttempt]
  );

  const onCameraUnavailable = useCallback(() => setMode("upload"), []);

  const reshoot = useCallback(() => {
    setFrozen(null);
    setCandidates([]);
    setConfirmed({});
    setFailedRead(false);
  }, []);

  const confirmAll = useCallback(() => {
    const curves: Partial<Record<Finger, NailCurve>> = { ...confirmed };
    for (const c of candidates) {
      if (!curves[c.finger]) {
        curves[c.finger] = { status: "measured", class: c.class, radiusMm: c.radiusMm };
      }
    }
    onComplete(curves, false);
  }, [candidates, confirmed, onComplete]);

  const skipHand = useCallback(() => {
    setSkipped(true);
    const curves: Partial<Record<Finger, NailCurve>> = {};
    for (const f of FINGERS) {
      curves[f] = { status: "unmeasured" };
    }
    onComplete(curves, true);
  }, [onComplete]);

  const maxAttemptsReached = attempts >= 2;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-3xl text-plum">
          How curved are your nails?
        </h2>
        <p className="mt-1 text-plum-soft">
          Curl the fingers of your {handWord} hand into a loose fist and point
          your fingertips at the camera — we&apos;ll read the curve of each
          nail.
        </p>
      </div>

      <PoseEndOn caption="Loose fist, free edges of the nails facing the camera" />

      {!frozen && (
        <CaptureView
          label={`the ${handWord} hand, curled`}
          mode={mode}
          onModeChange={setMode}
          onFrozen={onFrozen}
          onLiveTick={() => {}}
          onCameraUnavailable={onCameraUnavailable}
          captureButtonLabel="Use this photo"
          liveOverlay={
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-10 top-[16%] bottom-[26%] rounded-[40%] border-2 border-dashed border-plum/40" />
              <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-plum-soft">
                Fingertips inside the circle, facing the camera
              </p>
            </div>
          }
        />
      )}

      {detecting && (
        <div className="rounded-3xl bg-white p-6 text-center text-plum shadow-sm">
          <p className="text-lg">Reading your nails…</p>
        </div>
      )}

      {frozen && !detecting && failedRead && !maxAttemptsReached && (
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-lg text-plum">
            We couldn&apos;t read the curve in that photo.
          </p>
          <p className="mt-2 text-sm text-plum-soft">
            Point your fingertips straight at the camera, spread them a little,
            and keep the phone level with them. Try once more.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={reshoot}
              className="rounded-full bg-plum px-6 py-3 font-semibold text-cream hover:bg-plum-soft"
            >
              Try the pose again
            </button>
          </div>
        </div>
      )}

      {frozen && !detecting && failedRead && maxAttemptsReached && (
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-lg text-plum">That pose is tricky — no problem.</p>
          <p className="mt-2 text-sm text-plum-soft">
            We&apos;ll mark the curve as unmeasured for this hand. Your nail
            tech can ask for this photo later, or use flat-blank press-ons.
          </p>
          <button
            type="button"
            onClick={skipHand}
            className="mt-4 rounded-full bg-plum px-6 py-3 font-semibold text-cream hover:bg-plum-soft"
          >
            Continue with unmeasured curve →
          </button>
        </div>
      )}

      {frozen && !detecting && !failedRead && candidates.length > 0 && (
        <div className="flex flex-col gap-5">
          <div className="rounded-3xl overflow-hidden border-2 border-rose">
            <CanvasHost canvas={frozen.canvas} />
          </div>
          <p className="text-center text-sm text-plum-soft">
            Here&apos;s the curve we read for each nail — smaller radius means
            deeper. Tap to keep, or re-shoot.
          </p>
          <div className="grid grid-cols-1 gap-3">
            {candidates.map((c) => {
              const isConfirmed = confirmed[c.finger];
              return (
                <div
                  key={c.finger}
                  className={`flex items-center justify-between gap-3 rounded-3xl border-2 p-4 ${
                    isConfirmed ? "border-rose bg-rose/25" : "border-plum/15 bg-white"
                  }`}
                >
                  <div>
                    <p className="font-semibold text-plum">{FINGER_LABELS[c.finger]}</p>
                    <p className="text-sm text-plum-soft">
                      {CURVE_CLASS_LABELS[c.class].toLowerCase()} ·{" "}
                      {c.radiusMm.toFixed(1)} mm radius
                      {!c.chordFromArc && " (approx)"}
                    </p>
                  </div>
                  {!isConfirmed && (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmed((prev) => ({
                          ...prev,
                          [c.finger]: {
                            status: "measured",
                            class: c.class,
                            radiusMm: c.radiusMm,
                          },
                        }))
                      }
                      className="shrink-0 rounded-full bg-plum px-5 py-2.5 text-sm font-semibold text-cream hover:bg-plum-soft"
                    >
                      Keep
                    </button>
                  )}
                  {isConfirmed && (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmed((prev) => {
                          const next = { ...prev };
                          delete next[c.finger];
                          return next;
                        })
                      }
                      className="shrink-0 text-sm font-medium text-plum-soft underline underline-offset-2"
                    >
                      Adjust
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {candidates.length > 0 &&
            candidates.every((c) => confirmed[c.finger]?.status === "measured") && (
              <button
                type="button"
                onClick={confirmAll}
                className="rounded-full bg-plum px-8 py-4 text-lg font-semibold text-cream hover:bg-plum-soft"
              >
                {hand === "left" ? "Continue — right hand →" : "Continue →"}
              </button>
            )}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={reshoot}
              className="min-h-11 self-center px-4 text-sm text-plum-soft underline underline-offset-4 hover:text-plum"
            >
              Re-shoot this photo
            </button>
            {maxAttemptsReached && !skipped && (
              <button
                type="button"
                onClick={skipHand}
                className="min-h-11 self-center px-4 text-sm text-plum-soft underline underline-offset-4 hover:text-plum"
              >
                Skip curve for this hand
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function classifyCurve(radiusMm: number): CurveClass {
  if (radiusMm < CURVE_CLASS_THRESHOLDS.deepMax) return "deep";
  if (radiusMm <= CURVE_CLASS_THRESHOLDS.mediumMax) return "medium";
  return "flat";
}