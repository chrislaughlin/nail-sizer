"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { readImagePixels, drawWorkingImage, type WorkingImage } from "@/lib/cv/image";

export type CaptureMode = "live" | "upload";

export interface FrozenFrame {
  image: WorkingImage;
  /** Canvas sized to the analysis resolution, for overlay drawing. */
  canvas: HTMLCanvasElement;
}

interface CaptureViewProps {
  label: string;
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  onFrozen: (frame: FrozenFrame) => void;
  onLiveTick: (image: WorkingImage) => void;
  onCameraUnavailable: () => void;
  captureButtonLabel?: string;
  /** Overlay drawn above the live video (framing guides, detection overlay). */
  liveOverlay?: ReactNode;
}

const ANALYSIS_MAX_DIM = 1000;
const LIVE_DIM = 640;

export default function CaptureView({
  label,
  mode,
  onModeChange,
  onFrozen,
  onLiveTick,
  onCameraUnavailable,
  captureButtonLabel = "Use this photo",
  liveOverlay,
}: CaptureViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [frozenUrl, setFrozenUrl] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLiveReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();
      setLiveReady(true);
    } catch {
      onCameraUnavailable();
    } finally {
      setStarting(false);
    }
  }, [onCameraUnavailable]);

  useEffect(() => {
    // Defer past the effect so camera startup/shutdown state changes
    // don't cascade into the render triggered by `mode` itself.
    const t = setTimeout(() => {
      if (mode === "live") {
        void startCamera();
      } else {
        stopStream();
      }
    }, 0);
    return () => {
      clearTimeout(t);
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Live detection loop (throttled).
  useEffect(() => {
    if (mode !== "live" || !liveReady) return;
    const video = videoRef.current;
    if (!video) return;
    let frame = 0;
    let lastTick = 0;

    const tick = (now: number) => {
      if (video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      frame++;
      if (frame % 3 === 0 && now - lastTick > 220) {
        const image = readImagePixels(video, video.videoWidth, video.videoHeight, LIVE_DIM);
        onLiveTick(image);
        lastTick = now;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [mode, liveReady, onLiveTick]);

  const freeze = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const image = readImagePixels(video, video.videoWidth, video.videoHeight, ANALYSIS_MAX_DIM);
    const canvas = document.createElement("canvas");
    drawWorkingImage(canvas, image);
    setFrozenUrl(canvas.toDataURL("image/png"));
    stopStream();
    onFrozen({ image, canvas });
  }, [onFrozen, stopStream]);

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const bitmap = await createImageBitmap(file);
        const image = readImagePixels(bitmap, bitmap.width, bitmap.height, ANALYSIS_MAX_DIM);
        const canvas = document.createElement("canvas");
        drawWorkingImage(canvas, image);
        setFrozenUrl(canvas.toDataURL("image/png"));
        onFrozen({ image, canvas });
        bitmap.close();
      } catch {
        // Unreadable image — nothing to do; user can pick again.
      }
    },
    [onFrozen]
  );

  return (
    <div>
      <div className="relative overflow-hidden rounded-3xl border-2 border-rose bg-cream-deep shadow-inner">
        {mode === "live" ? (
          <video
            ref={videoRef}
            className="aspect-[3/4] w-full object-cover"
            autoPlay
            muted
            playsInline
            aria-label={label}
          />
        ) : (
          <div className="flex aspect-[3/4] w-full items-center justify-center bg-cream-deep">
            {frozenUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- client-side data URL preview
              <img
                src={frozenUrl}
                alt="The photo you picked"
                className="h-full w-full object-contain"
              />
            ) : (
              <p className="px-8 text-center text-plum-soft">
                Pick a clear, flat-on photo of {label.toLowerCase()} with the
                card in frame.
              </p>
            )}
          </div>
        )}

        {/* live overlay (framing guide / detection) */}
        {mode === "live" && liveOverlay}

        {mode === "live" && starting && !liveReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-cream/80">
            <p className="text-plum-soft">Starting camera…</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col items-stretch gap-3">
        {mode === "live" ? (
          <button
            type="button"
            onClick={freeze}
            disabled={!liveReady}
            className="rounded-full bg-plum px-6 py-3 text-base font-semibold text-cream transition hover:bg-plum-soft disabled:opacity-50 min-h-11"
          >
            {captureButtonLabel}
          </button>
        ) : (
          <>
            <label className="cursor-pointer rounded-full bg-plum px-6 py-3 text-center text-base font-semibold text-cream transition hover:bg-plum-soft min-h-11 flex items-center justify-center">
              Choose a photo
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.currentTarget.value = "";
                }}
                aria-label="Choose a photo of your hand and card"
              />
            </label>
            {frozenUrl && (
              <button
                type="button"
                onClick={() => setFrozenUrl(null)}
                className="rounded-full border-2 border-plum/20 px-6 py-2.5 text-sm font-medium text-plum min-h-11"
              >
                Pick a different photo
              </button>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => onModeChange(mode === "live" ? "upload" : "live")}
          className="self-center text-sm text-plum-soft underline underline-offset-4 hover:text-plum min-h-11 flex items-center px-2"
        >
          {mode === "live"
            ? "Use a photo instead"
            : "Use the live camera instead"}
        </button>
      </div>
    </div>
  );
}