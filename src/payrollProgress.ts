import { infoLogger } from "./logging_functions.js";

export const PROGRESS_PREFIX = "__PROGRESS__ ";

export function emitProgress(step: string, detail?: string): void {
  const payload = {
    ts: new Date().toISOString(),
    step,
    ...(detail ? { detail } : {}),
  };
  console.log(`${PROGRESS_PREFIX}${JSON.stringify(payload)}`);
}

export function emitProgressAndInfo(step: string, detail?: string): void {
  emitProgress(step, detail);
  infoLogger.info(detail ? `${step}: ${detail}` : step);
}
