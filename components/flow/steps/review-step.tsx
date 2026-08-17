"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildTextSummary,
  chartDataFromProgress,
  renderChart,
  shareChartPng,
} from "@/lib/chart";
import type { ProgressState } from "@/lib/types";

interface ReviewStepProps {
  progress: ProgressState;
  onRestart: () => void;
}

export default function ReviewStep({ progress, onRestart }: ReviewStepProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const chartData = useMemo(() => chartDataFromProgress(progress), [progress]);
  const summary = useMemo(() => buildTextSummary(progress), [progress]);

  // Render the chart into the preview canvas (waits for fonts).
  useEffect(() => {
    let cancelled = false;
    const draw = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const chart = renderChart(chartData);
        canvas.width = chart.width;
        canvas.height = chart.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(chart, 0, 0);
      } catch {
        // non-fatal preview issue
      }
    };
    if (document.fonts?.ready) {
      void document.fonts.ready.then(draw);
    } else {
      draw();
    }
    return () => {
      cancelled = true;
    };
  }, [chartData]);

  const onShare = useCallback(async () => {
    setShareStatus(null);
    const outcome = await shareChartPng(chartData, summary);
    if (outcome.kind === "shared") {
      setShareStatus("Shared — nice one!");
    } else if (outcome.kind === "downloaded") {
      setShareStatus("Chart downloaded as a PNG");
    } else if (outcome.error === "png render failed") {
      setShareStatus("Couldn't render the chart — try downloading below.");
    } else {
      setShareStatus("Share isn't available here — use Download or Copy below.");
    }
  }, [chartData, summary]);

  const onDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nail-sizer-chart.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
    setShareStatus("Chart downloaded as a PNG");
  }, []);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API unavailable — fall back to a textarea copy.
      const ta = document.createElement("textarea");
      ta.value = summary;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        setShareStatus("Copy isn't available here — try the screenshot trick below.");
      }
      ta.remove();
    }
  }, [summary]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-3xl text-plum">Your nail chart</h2>
        <p className="mt-1 text-plum-soft">
          All 10 nails, measured. Share this with {progress.techName} — the
          numbers are a guide, not a promise, and sizes differ by brand.
        </p>
      </div>

      <div className="rounded-3xl border-2 border-rose bg-cream-deep p-3 shadow-inner">
        <canvas ref={canvasRef} className="h-auto w-full rounded-2xl" aria-label="Your nail chart" />
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onShare}
          className="rounded-full bg-plum px-8 py-4 text-lg font-semibold text-cream hover:bg-plum-soft"
        >
          Share chart →
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onDownload}
            className="min-h-12 rounded-full border-2 border-plum/25 px-4 py-3 text-sm font-semibold text-plum"
          >
            Download PNG
          </button>
          <button
            type="button"
            onClick={onCopy}
            className="min-h-12 rounded-full border-2 border-plum/25 px-4 py-3 text-sm font-semibold text-plum"
          >
            {copied ? "Copied ✓" : "Copy text"}
          </button>
        </div>
        {shareStatus && (
          <p className="text-center text-sm text-plum-soft" role="status">
            {shareStatus}
          </p>
        )}
      </div>

      <div className="rounded-3xl border border-peach bg-peach/25 p-5 text-sm text-plum">
        <p>
          <strong>Can&apos;t share or download?</strong> Take a screenshot of
          this page — the chart is right here. And don&apos;t worry about
          losing it: your measurements stay saved on this device until you
          clear them.
        </p>
        <p className="mt-2">
          <strong>Privacy:</strong> photos never leave your phone, and the
          chart contains no photos or card details.
        </p>
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="min-h-11 self-center px-4 text-sm text-plum-soft underline underline-offset-4 hover:text-plum"
      >
        Start over
      </button>
    </div>
  );
}