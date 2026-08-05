/**
 * Pure claw cabinet phase helpers — status vocabulary + sequence rules.
 * Used by ClawMachine chrome and unit-tested without React.
 *
 * Player PULL is 3 clicks: drop → close/grab → lift, then auto win/lose recovery.
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

/** Single claw has three blades (ref claw). */
export const CLAW_FINGER_COUNT = 3 as const;

/**
 * Phases where the full pull animation is auto-running (no extra PULL click).
 * Player may still click PULL during drop/close to advance the 3-step machine.
 */
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

/** Joystick only while waiting to arm a pull. */
export function canMoveClaw(phase: ClawPhase): boolean {
  return phase === "idle" || phase === "ready";
}

/**
 * Player can click PULL to advance one of the 3 manual steps:
 * ready/idle → drop, drop → close, close → lift.
 */
export function canClickPull(phase: ClawPhase): boolean {
  return (
    phase === "idle" ||
    phase === "ready" ||
    phase === "drop" ||
    phase === "close"
  );
}

/**
 * Advance one player PULL click.
 * 1st → drop (DESCENDING), 2nd → close (LOCKING/grab), 3rd → lift (RETRACTING).
 */
export function advancePullClick(phase: ClawPhase): ClawPhase | null {
  if (phase === "idle" || phase === "ready") return "drop";
  if (phase === "drop") return "close";
  if (phase === "close") return "lift";
  return null;
}

/** Which player step index (1–3) the phase is on, or 0 if not mid-pull. */
export function pullClickStep(phase: ClawPhase): 0 | 1 | 2 | 3 {
  if (phase === "drop") return 1;
  if (phase === "close") return 2;
  if (phase === "lift") return 3;
  return 0;
}

/**
 * After the 3rd click reaches `lift`, auto recovery (win/lose).
 * Parent drives timeouts; pure ordered list for tests.
 */
export function pullRecoverySequence(won: boolean): ClawPhase[] {
  if (won) return ["hold", "return", "win", "ready"];
  return ["slip", "return", "lose", "ready"];
}

/**
 * Full timeline including the 3 player steps + recovery.
 * Used by docs/tests; UI advances first 3 via clicks, rest via timers.
 */
export function clawPullSequence(won: boolean): ClawPhase[] {
  return ["drop", "close", "lift", ...pullRecoverySequence(won)];
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
  if (phase === "idle" || phase === "ready") return "drop";
  const seq = clawPullSequence(won);
  const idx = seq.indexOf(phase);
  if (idx < 0) return "drop";
  if (idx >= seq.length - 1) return seq[seq.length - 1]!;
  return seq[idx + 1]!;
}

/**
 * Whether the claw should display a held prize for this phase.
 * Win path: keep prize through close → lift → hold → return → win.
 * Lose path: after slip, prize is not held (falls).
 */
export function clawShouldHoldPrize(
  phase: ClawPhase,
  slippedThisPull: boolean
): boolean {
  if (phase === "close" || phase === "lift" || phase === "hold" || phase === "win") {
    return true;
  }
  if (phase === "return" && !slippedThisPull) return true;
  return false;
}

/**
 * Whether claw fingers are open. Closed whenever holding a prize;
 * open on idle/ready/drop and after a slip/lose.
 */
export function clawFingersOpen(
  phase: ClawPhase,
  slippedThisPull: boolean
): boolean {
  if (clawShouldHoldPrize(phase, slippedThisPull)) return false;
  if (phase === "idle" || phase === "ready" || phase === "drop") return true;
  if (phase === "slip" || phase === "lose") return true;
  if (phase === "return" && slippedThisPull) return true;
  return true;
}

/** Track slip latch across the pull (pure step for tests / UI). */
export function updateSlippedLatch(
  phase: ClawPhase,
  prevSlipped: boolean
): boolean {
  if (phase === "drop" || phase === "idle" || phase === "ready") return false;
  if (phase === "slip") return true;
  return prevSlipped;
}
