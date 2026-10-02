import type { BehaviourProfile } from './BehaviourTracker';
import type { PlayerSamplePayload } from '../events/GameEvents';

export type PredictedAction = 'LEFT' | 'RIGHT' | 'JUMP' | 'IDLE';

export interface ActionPrediction {
  LEFT: number;
  RIGHT: number;
  JUMP: number;
  IDLE: number;
  /** Highest-probability action. */
  likely: PredictedAction;
  /** Confidence in `likely` (margin over runner-up, 0..1). */
  confidence: number;
}

/**
 * Local weighted prediction from the behaviour profile + short-term samples.
 * Tracks hit rate so the reveal screen can show "AI PREDICTION ACCURACY".
 *
 * Swap `predictNextAction` for an ML model later without rewriting callers.
 */
export class PredictionEngine {
  private locked: ActionPrediction | null = null;
  private lockMs = 0;
  private hits = 0;
  private checks = 0;
  private sampleAccum = { left: 0, right: 0, jump: 0, idle: 0, ms: 0 };

  reset(): void {
    this.locked = null;
    this.lockMs = 0;
    this.hits = 0;
    this.checks = 0;
    this.sampleAccum = { left: 0, right: 0, jump: 0, idle: 0, ms: 0 };
  }

  /** Soft reset between runs — keep accuracy memory for the session. */
  beginRun(): void {
    this.locked = null;
    this.lockMs = 0;
    this.sampleAccum = { left: 0, right: 0, jump: 0, idle: 0, ms: 0 };
  }

  /** Feed live samples to blend short-term intent into predictions. */
  observeSample(s: PlayerSamplePayload): void {
    const dt = Math.max(0, s.deltaMs);
    this.sampleAccum.ms += dt;
    if (s.moveIntent === 'left') this.sampleAccum.left += dt;
    else if (s.moveIntent === 'right') this.sampleAccum.right += dt;
    else if (s.idle) this.sampleAccum.idle += dt;

    if (!s.grounded) this.sampleAccum.jump += dt * 0.35;

    // Rolling window ~2.5s
    if (this.sampleAccum.ms > 2500) {
      const scale = 2000 / this.sampleAccum.ms;
      this.sampleAccum.left *= scale;
      this.sampleAccum.right *= scale;
      this.sampleAccum.jump *= scale;
      this.sampleAccum.idle *= scale;
      this.sampleAccum.ms = 2000;
    }
  }

  observeJump(): void {
    this.sampleAccum.jump += 400;
  }

  /**
   * Lock a prediction for a short window, then score whether the player matched it.
   * Call from the Director when firing a PREDICTION adaptation.
   */
  lockPrediction(prediction: ActionPrediction, windowMs = 1800): void {
    this.locked = prediction;
    this.lockMs = windowMs;
  }

  /** Per-frame: count down lock and score accuracy once. */
  tick(delta: number, current: PredictedAction): void {
    if (!this.locked) return;
    this.lockMs -= delta;
    if (this.lockMs > 0) return;

    this.checks += 1;
    if (current === this.locked.likely) this.hits += 1;
    this.locked = null;
  }

  /** 0..1 — defaults to 0.5 before enough samples so UI isn't empty. */
  getAccuracy(): number {
    if (this.checks < 2) return 0.5;
    return this.hits / this.checks;
  }

  getChecks(): number {
    return this.checks;
  }

  predictNextAction(profile: BehaviourProfile): ActionPrediction {
    // Long-term profile priors.
    let left = profile.leftMovementRatio * 0.5;
    let right = profile.rightMovementRatio * 0.5;
    let jump = profile.jumpRate * 0.45 + (profile.repeatedJumpPattern ? 0.18 : 0);
    let idle = profile.idleTimeRatio * 0.65;

    if (profile.preferredDirection === 'right') right += 0.2;
    if (profile.preferredDirection === 'left') left += 0.2;

    jump += profile.airTimeRatio * 0.18;

    // Short-term blend (recent 2s of play).
    const recent = this.sampleAccum.ms > 200 ? this.sampleAccum.ms : 1;
    left += (this.sampleAccum.left / recent) * 0.35;
    right += (this.sampleAccum.right / recent) * 0.35;
    jump += (this.sampleAccum.jump / recent) * 0.4;
    idle += (this.sampleAccum.idle / recent) * 0.35;

    if (profile.predictabilityScore > 0.55) {
      const peak = Math.max(left, right, jump, idle);
      const sharpen = 1 + profile.predictabilityScore * 0.7;
      left = left === peak ? left * sharpen : left * 0.8;
      right = right === peak ? right * sharpen : right * 0.8;
      jump = jump === peak ? jump * sharpen : jump * 0.8;
      idle = idle === peak ? idle * sharpen : idle * 0.8;
    }

    left = Math.max(0.02, left);
    right = Math.max(0.02, right);
    jump = Math.max(0.02, jump);
    idle = Math.max(0.02, idle);

    const sum = left + right + jump + idle;
    const probs: ActionPrediction = {
      LEFT: left / sum,
      RIGHT: right / sum,
      JUMP: jump / sum,
      IDLE: idle / sum,
      likely: 'RIGHT',
      confidence: 0,
    };

    const entries: [PredictedAction, number][] = [
      ['LEFT', probs.LEFT],
      ['RIGHT', probs.RIGHT],
      ['JUMP', probs.JUMP],
      ['IDLE', probs.IDLE],
    ];
    entries.sort((a, b) => b[1] - a[1]);
    probs.likely = entries[0][0];
    probs.confidence = Math.min(1, Math.max(0, entries[0][1] - entries[1][1]) * 2.4);

    return probs;
  }

  /** Infer discrete action from a live sample (for accuracy scoring). */
  static actionFromSample(s: PlayerSamplePayload): PredictedAction {
    if (!s.grounded) return 'JUMP';
    if (s.moveIntent === 'left') return 'LEFT';
    if (s.moveIntent === 'right') return 'RIGHT';
    if (s.idle) return 'IDLE';
    return 'IDLE';
  }
}
