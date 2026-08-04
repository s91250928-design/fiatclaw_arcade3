/**
 * Synchronous re-entrancy lock for DROP / startAttempt.
 * Client must acquire before any async start; release after animation or error.
 */

export interface DropGuard {
  tryAcquire: () => boolean;
  release: () => void;
  isLocked: () => boolean;
}

export function createDropGuard(): DropGuard {
  let locked = false;
  return {
    tryAcquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
    isLocked() {
      return locked;
    },
  };
}

/** Whether DROP controls should be disabled given UI status/phase. */
export function isDropUiBusy(
  status: string,
  phase: string
): boolean {
  if (
    status === "buying" ||
    status === "starting" ||
    status === "playing"
  ) {
    return true;
  }
  return ["drop", "close", "lift", "hold", "slip", "return"].includes(phase);
}
