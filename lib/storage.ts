import { STORAGE_KEY, STORAGE_VERSION } from "./constants";
import type { ProgressState } from "./types";

/** Load persisted progress for a session, or null when absent/incompatible. */
export function loadProgress(sessionId: string): ProgressState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    if (
      parsed.version !== STORAGE_VERSION ||
      parsed.sessionId !== sessionId ||
      typeof parsed.techName !== "string"
    ) {
      return null;
    }
    return parsed as ProgressState;
  } catch {
    return null;
  }
}

export function saveProgress(state: ProgressState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, version: STORAGE_VERSION, updatedAt: Date.now() })
    );
  } catch {
    // Storage full / private mode — measurement continues in-memory only.
  }
}

export function clearProgress(sessionId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const current = loadProgress(sessionId);
    if (current && current.sessionId === sessionId) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function createProgressState(input: {
  sessionId: string;
  techName: string;
  contactHint?: string;
  step?: ProgressState["step"];
}): ProgressState {
  return {
    version: STORAGE_VERSION,
    sessionId: input.sessionId,
    techName: input.techName,
    contactHint: input.contactHint,
    step: input.step ?? "welcome",
    widths: { left: {}, right: {} },
    curves: { left: {}, right: {} },
    curveAttempts: { left: 0, right: 0 },
    updatedAt: Date.now(),
  };
}