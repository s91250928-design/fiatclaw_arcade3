/**
 * Pure claw cabinet phase helpers — status vocabulary + sequence rules.
 * Used by ClawMachine chrome and unit-tested without React.
 */

export type ClawPhase =
  | "idle"
  | "ready"
  | "drop"
  | "close"
  | "lift"
  | "hold"
  | "slip"
  | "return"
  | "win"
  | "lose";

/** Player-facing status cycle (no odds / percentages). */
export type ClawStatusLabel =
  | "STANDBY"
  | "ARMED"
  | "DESCENDING"
  | "LOCKING"
  | "RETRACTING"
  | "WIN"
  | "MISS";

export const CLAW_BUSY_PHASES: readonly ClawPhase[] = [
  "drop",
  "close",
  "lift",
  "hold",
  "slip",
  "return",
] as const;

/** Map internal phase → required chrome vocabulary. */
export function clawStatusLabel(phase: ClawPhase): ClawStatusLabel {
  switch (phase) {
    case "idle":
      return "STANDBY";
    case "ready":
      return "ARMED";
    case "drop":
      return "DESCENDING";
    case "close":
      return "LOCKING";
    case "lift":
    case "hold":
    case "return":
      return "RETRACTING";
    case "slip":
      return "MISS";
    case "win":
      return "WIN";
    case "lose":
      return "MISS";
    default:
      return "STANDBY";
  }
}

export function isClawBusyPhase(phase: ClawPhase): boolean {
  return (CLAW_BUSY_PHASES as readonly string[]).includes(phase);
}

/**
 * Canonical animation timeline after PULL given server win/lose.
 * Parent drives timeouts; this is the ordered phase list for tests + docs.
 */
export function clawPullSequence(won: boolean): ClawPhase[] {
  if (won) {
    return ["drop", "close", "lift", "hold", "return", "win", "ready"];
  }
  return ["drop", "close", "lift", "slip", "return", "lose", "ready"];
}

/** Overlay text inside the glass (win flash / miss). */
export function clawOverlayText(phase: ClawPhase): "SECURED" | "MISS" | null {
  if (phase === "win") return "SECURED";
  if (phase === "lose") return "MISS";
  return null;
}

/**
 * Step the sequence: given current phase and win flag, return next phase
 * along the pull timeline (or stay if terminal recover).
 */
export function nextClawPhase(phase: ClawPhase, won: boolean): ClawPhase {
  // ARMED/STANDBY always begins a pull at DESCENDING (seq also ends in ready).
  if (phase === "idle" || phase === "ready") return "drop";
  const seq = clawPullSequence(won);
  const idx = seq.indexOf(phase);
  if (idx < 0) return "drop";
  if (idx >= seq.length - 1) return seq[seq.length - 1]!;
  return seq[idx + 1]!;
}
