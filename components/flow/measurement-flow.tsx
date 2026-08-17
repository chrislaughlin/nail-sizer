"use client";

import { useCallback, useState } from "react";
import { FINGERS } from "@/lib/constants";
import { createProgressState, loadProgress, saveProgress, clearProgress } from "@/lib/storage";
import type {
  Finger,
  Hand,
  NailCurve,
  NailWidth,
  ProgressState,
  StepId,
} from "@/lib/types";
import WelcomeStep, { StepDots } from "./steps/welcome-step";
import CalibrationStep from "./steps/calibration-step";
import WidthStep from "./steps/width-step";
import CurveStep from "./steps/curve-step";
import ReviewStep from "./steps/review-step";

interface MeasurementFlowProps {
  sessionId: string;
  techName: string;
  contactHint?: string;
}

const STEP_ORDER: StepId[] = [
  "welcome",
  "calibration",
  "width-left",
  "width-right",
  "curve-left",
  "curve-right",
  "review",
];

export default function MeasurementFlow({
  sessionId,
  techName,
  contactHint,
}: MeasurementFlowProps) {
  const [progress, setProgress] = useState<ProgressState>(() => {
    const saved = loadProgress(sessionId);
    if (saved) return saved;
    return createProgressState({ sessionId, techName, contactHint });
  });
  const [resumed, setResumed] = useState(() => {
    const saved = loadProgress(sessionId);
    return saved !== null && saved.step !== "welcome";
  });
  const [step, setStep] = useState<StepId>(() => {
    const saved = loadProgress(sessionId);
    return saved?.step ?? "welcome";
  });
  const [showPrivacyNote, setShowPrivacyNote] = useState(false);

  const commit = useCallback(
    (patch: Partial<ProgressState>) => {
      setProgress((prev) => {
        const next = { ...prev, ...patch, updatedAt: Date.now() };
        saveProgress(next);
        return next;
      });
    },
    []
  );

  const goTo = useCallback(
    (next: StepId) => {
      commit({ step: next });
      setStep(next);
    },
    [commit]
  );

  const onWidthComplete = useCallback(
    (hand: Hand) => (widths: Partial<Record<Finger, NailWidth>>) => {
      commit({
        widths: { ...progress.widths, [hand]: widths },
        step: hand === "left" ? "width-right" : "curve-left",
      });
      setStep(hand === "left" ? "width-right" : "curve-left");
    },
    [commit, progress.widths]
  );

  const onCurveAttempt = useCallback(
    (hand: Hand) => () => {
      commit({ curveAttempts: { ...progress.curveAttempts, [hand]: progress.curveAttempts[hand] + 1 } });
    },
    [commit, progress.curveAttempts]
  );

  const onCurveComplete = useCallback(
    (hand: Hand) => (curves: Partial<Record<Finger, NailCurve>>) => {
      // Fill any fingers without a result as unmeasured (never fabricate).
      const full: Partial<Record<Finger, NailCurve>> = { ...curves };
      for (const f of FINGERS) {
        if (!full[f]) full[f] = { status: "unmeasured" };
      }
      const next = hand === "left" ? "curve-right" : "review";
      commit({
        curves: { ...progress.curves, [hand]: full },
        step: next,
      });
      setStep(next);
    },
    [commit, progress.curves]
  );

  const onRestart = useCallback(() => {
    clearProgress(sessionId);
    setProgress(createProgressState({ sessionId, techName, contactHint }));
    setResumed(false);
    setStep("welcome");
  }, [sessionId, techName, contactHint]);

  const current = STEP_ORDER.indexOf(step);
  const pct = Math.round((current / (STEP_ORDER.length - 1)) * 100);

  return (
    <div className="flex flex-col gap-6">
      {/* Wordmark */}
      <div className="flex items-center justify-between">
        <span className="font-display text-2xl text-plum">Nail Sizer</span>
        <span className="rounded-full bg-rose/60 px-4 py-1.5 text-sm font-semibold text-plum">
          {techName}
        </span>
      </div>

      {/* Progress */}
      {step !== "welcome" && (
        <div className="flex flex-col gap-2">
          <div className="h-2 overflow-hidden rounded-full bg-rose/40" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Flow progress">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose via-peach to-lilac transition-all duration-500"
              style={{ width: `${Math.max(4, pct)}%` }}
            />
          </div>
          <StepDots step={step} />
        </div>
      )}

      {resumed && (
        <div className="flex items-center justify-between gap-3 rounded-3xl border border-peach bg-peach/25 px-5 py-3 text-sm text-plum">
          <span>
            Picked up where you left off — your measurements are saved on this
            device.
          </span>
          <button
            type="button"
            onClick={onRestart}
            className="shrink-0 font-medium underline underline-offset-4"
          >
            Start over
          </button>
        </div>
      )}

      <main className="mx-auto w-full max-w-xl flex-1">
        {step === "welcome" && (
          <WelcomeStep
            techName={techName}
            contactHint={contactHint}
            onStart={() => goTo("calibration")}
          />
        )}

        {step === "calibration" && <CalibrationStep onCalibrated={() => goTo("width-left")} />}

        {step === "width-left" && (
          <WidthStep hand="left" onComplete={onWidthComplete("left")} />
        )}

        {step === "width-right" && (
          <WidthStep hand="right" onComplete={onWidthComplete("right")} />
        )}

        {step === "curve-left" && (
          <CurveStep
            hand="left"
            widths={progress.widths.left}
            attempts={progress.curveAttempts.left}
            onAttempt={onCurveAttempt("left")}
            onComplete={onCurveComplete("left")}
          />
        )}

        {step === "curve-right" && (
          <CurveStep
            hand="right"
            widths={progress.widths.right}
            attempts={progress.curveAttempts.right}
            onAttempt={onCurveAttempt("right")}
            onComplete={onCurveComplete("right")}
          />
        )}

        {step === "review" && <ReviewStep progress={progress} onRestart={onRestart} />}

        {step === "welcome" && (
          <button
            type="button"
            onClick={() => setShowPrivacyNote((v) => !v)}
            className="mx-auto mt-10 block min-h-11 px-4 text-sm text-plum-soft underline underline-offset-4 hover:text-plum"
          >
            How is my data handled?
          </button>
        )}
        {showPrivacyNote && (
          <p className="mx-auto mt-2 max-w-md text-center text-xs text-plum-soft">
            Everything runs in your browser. Photos and measurements never
            leave your phone; the only network requests are the app&apos;s
            static files. No accounts, no tracking.
          </p>
        )}
      </main>
    </div>
  );
}