"use client";

import { useState } from "react";
import type { ProgressState } from "@/lib/types";

interface WelcomeStepProps {
  techName: string;
  contactHint?: string;
  onStart: () => void;
}

export default function WelcomeStep({ techName, contactHint, onStart }: WelcomeStepProps) {
  const [showNoCard, setShowNoCard] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <header className="text-center">
        <p className="text-lg text-plum-soft">You&apos;ve been invited by</p>
        <h1 className="font-display text-4xl text-plum">{techName}</h1>
        {contactHint && (
          <p className="mt-2 text-sm text-plum-soft">{contactHint}</p>
        )}
      </header>

      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="font-display text-2xl text-plum">What you&apos;ll need</h2>
        <ul className="mt-3 space-y-2 text-plum">
          <li className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose text-lg">
              💳
            </span>
            <span>
              A <strong>bank card or ID card</strong> — it&apos;s the measuring
              stick
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose text-lg">
              🙌
            </span>
            <span>Your hands, clean of polish if possible</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose text-lg">
              📱
            </span>
            <span>About 4 minutes — photos, not rulers</span>
          </li>
        </ul>
      </div>

      <div className="rounded-3xl border border-rose/60 bg-rose/20 p-5 text-sm text-plum">
        <p>
          <strong>Take it slow and keep the phone flat above your hands.</strong>{" "}
          The numbers are a guide that helps {techName} build press-ons that
          fit — your nail tech has the final say.
        </p>
        <p className="mt-2">
          <strong>Private by design:</strong> photos are measured on your
          phone and never uploaded. Nothing is stored on a server.
        </p>
      </div>

      {showNoCard && (
        <div className="rounded-3xl bg-cream-deep p-5 text-sm text-plum" role="note">
          <p>
            <strong>You&apos;ll need that card.</strong> A bank, credit, or ID
            card is the measuring stick the app measures against — the
            measurements can&apos;t be trusted without it. Grab it and come
            right back.
          </p>
          <button
            type="button"
            onClick={() => setShowNoCard(false)}
            className="mt-3 text-sm font-medium text-plum underline underline-offset-4"
          >
            I have it, let&apos;s go
          </button>
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          className="w-full rounded-full bg-plum px-8 py-4 text-lg font-semibold text-cream transition hover:bg-plum-soft"
        >
          Get started →
        </button>
        {!showNoCard && (
          <button
            type="button"
            onClick={() => setShowNoCard(true)}
            className="min-h-11 px-4 text-sm text-plum-soft underline underline-offset-4 hover:text-plum"
          >
            I don&apos;t have a card with me
          </button>
        )}
      </div>
    </div>
  );
}

export function StepDots({ step }: { step: ProgressState["step"] }) {
  const steps: ProgressState["step"][] = [
    "calibration",
    "width-left",
    "width-right",
    "curve-left",
    "curve-right",
    "review",
  ];
  const idx = steps.indexOf(step);
  return (
    <ol className="flex items-center justify-center gap-2" aria-label="Progress">
      {steps.map((s, i) => (
        <li
          key={s}
          className={`h-2.5 rounded-full transition-all ${
            i < idx
              ? "w-2.5 bg-rose-deep"
              : i === idx
                ? "w-8 bg-gradient-to-r from-rose via-peach to-lilac"
                : "w-2.5 bg-rose/50"
          }`}
          aria-hidden="true"
        />
      ))}
    </ol>
  );
}