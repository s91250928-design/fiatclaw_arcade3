/**
 * Synchronous re-entrancy lock for DROP / startAttempt.
 * Client must acquire before any async start; release after animation or error.
 *
 * 3-click PULL: lock only for first click (server arm+resolve). Steps 2–3
 * (grab/lift) are local phase advances and do not re-acquire.
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

/**
 * Whether buy/start async paths should block.
 * During drop/close the player must still click PULL for grab/lift.
 */
export function isDropUiBusy(status: string, phase: string): boolean {
  if (status === "buying" || status === "starting") {
    return true;
  }
  // Auto-recovery after lift: no more PULL clicks
  if (["lift", "hold", "slip", "return", "win", "lose"].includes(phase)) {
    return true;
  }
  // Mid 3-step pull (drop/close): PULL still clickable; status may be "playing"
  if (phase === "drop" || phase === "close") {
    return false;
  }
  if (status === "playing") {
    return true;
  }
  return false;
}
