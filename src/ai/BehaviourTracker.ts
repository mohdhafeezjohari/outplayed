import Phaser from 'phaser';
import type {
  AvoidancePayload,
  DeathPayload,
  JumpPayload,
  LandPayload,
  MoveIntent,
  PlayerSamplePayload,
  SegmentPayload,
} from '../events/GameEvents';

export type PreferredDirection = 'left' | 'right' | 'none';
export type PredictabilityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/** Snapshot consumed by HUD, debug panel, and (later) PredictionEngine. */
export interface BehaviourProfile {
  jumpCount: number;
  /** Fraction of active (non-idle-wait) time spent initiating / being in jump cycles. */
  jumpRate: number;
  jumpsPerMinute: number;
  rightMovementRatio: number;
  leftMovementRatio: number;
  idleTimeRatio: number;
  airTimeRatio: number;
  averageAirTimeMs: number;
  averageIdleBurstMs: number;
  preferredDirection: PreferredDirection;
  repeatedJumpPattern: boolean;
  repeatedRoute: boolean;
  /** Dominant repeated route key, if any. */
  dominantRoute: string | null;
  routeRepetitionCount: number;
  avoidanceAttempts: number;
  preferredEscapeDirection: PreferredDirection;
  deaths: number;
  /** True if early actions after respawn matched the pre-death action signature. */
  repeatsAfterDeath: boolean;
  hazardReactions: number;
  predictability: PredictabilityLevel;
  predictabilityScore: number;
  /** 0..1 confidence that we have enough samples to trust the profile. */
  confidence: number;
  observationMs: number;
}

interface ActionStamp {
  t: number;
  kind: 'left' | 'right' | 'jump' | 'idle' | 'air';
}

interface JumpStamp {
  t: number;
  x: number;
}

const HISTORY_CAP = 240;
const JUMP_HISTORY_CAP = 40;
const ROUTE_LEN = 5;
const SEGMENT_SIZE = 128;
/** Jump intervals under this ms count as a "spam jump" pattern. */
const RAPID_JUMP_MS = 700;
const IDLE_SPEED = 28;

/**
 * Local, frame-instant behaviour profiler.
 * No ML — rolling counters + pattern heuristics only.
 */
export class BehaviourTracker {
  private observationMs = 0;
  private moveLeftMs = 0;
  private moveRightMs = 0;
  private idleMs = 0;
  private airMs = 0;

  private jumpCount = 0;
  private airTimeSumMs = 0;
  private airBurstCount = 0;
  private idleBurstSumMs = 0;
  private idleBurstCount = 0;
  private currentIdleMs = 0;
  private currentAirMs = 0;

  private deaths = 0;
  private avoidanceAttempts = 0;
  private escapeLeft = 0;
  private escapeRight = 0;
  private hazardReactions = 0;

  private readonly recentActions: ActionStamp[] = [];
  private readonly recentJumps: JumpStamp[] = [];
  private readonly routeCounts = new Map<string, number>();
  private currentRoute: number[] = [];
  private lastSegment = -1;

  private preDeathSignature: string | null = null;
  private postDeathWindowMs = 0;
  private postDeathActions: ActionStamp[] = [];
  private repeatsAfterDeath = false;
  private deathRepeatChecks = 0;
  private deathRepeatHits = 0;

  private lastMoveIntent: MoveIntent = 'none';

  reset(): void {
    this.observationMs = 0;
    this.moveLeftMs = 0;
    this.moveRightMs = 0;
    this.idleMs = 0;
    this.airMs = 0;
    this.jumpCount = 0;
    this.airTimeSumMs = 0;
    this.airBurstCount = 0;
    this.idleBurstSumMs = 0;
    this.idleBurstCount = 0;
    this.currentIdleMs = 0;
    this.currentAirMs = 0;
    this.deaths = 0;
    this.avoidanceAttempts = 0;
    this.escapeLeft = 0;
    this.escapeRight = 0;
    this.hazardReactions = 0;
    this.recentActions.length = 0;
    this.recentJumps.length = 0;
    this.routeCounts.clear();
    this.currentRoute = [];
    this.lastSegment = -1;
    this.preDeathSignature = null;
    this.postDeathWindowMs = 0;
    this.postDeathActions = [];
    this.repeatsAfterDeath = false;
    this.deathRepeatChecks = 0;
    this.deathRepeatHits = 0;
    this.lastMoveIntent = 'none';
  }

  /** Soft reset between runs while keeping long-term death / route memory. */
  beginRun(): void {
    this.currentIdleMs = 0;
    this.currentAirMs = 0;
    this.currentRoute = [];
    this.lastSegment = -1;
    this.postDeathWindowMs = this.preDeathSignature ? 3500 : 0;
    this.postDeathActions = [];
  }

  onSample(s: PlayerSamplePayload): void {
    const dt = Math.max(0, s.deltaMs);
    if (dt <= 0) return;

    this.observationMs += dt;
    this.lastMoveIntent = s.moveIntent;

    if (s.grounded) {
      if (s.moveIntent === 'left') {
        this.moveLeftMs += dt;
        this.pushAction('left', this.observationMs);
        this.endIdleBurst();
      } else if (s.moveIntent === 'right') {
        this.moveRightMs += dt;
        this.pushAction('right', this.observationMs);
        this.endIdleBurst();
      } else if (s.idle || Math.abs(s.vx) < IDLE_SPEED) {
        this.idleMs += dt;
        this.currentIdleMs += dt;
        this.pushAction('idle', this.observationMs);
      } else {
        this.endIdleBurst();
      }
    } else {
      this.airMs += dt;
      this.currentAirMs += dt;
      this.pushAction('air', this.observationMs);
      this.endIdleBurst();
    }

    if (this.postDeathWindowMs > 0) {
      this.postDeathWindowMs -= dt;
      if (this.postDeathWindowMs <= 0) {
        this.evaluatePostDeathRepetition();
      }
    }

    // Auto-derive segment from position when GameScene doesn't emit SEGMENT.
    const seg = Math.floor(s.x / SEGMENT_SIZE);
    if (seg !== this.lastSegment) {
      this.onSegment({ segment: seg, x: s.x });
    }
  }

  onJump(payload: JumpPayload): void {
    this.jumpCount += 1;
    this.recentJumps.push({ t: this.observationMs, x: payload.x });
    if (this.recentJumps.length > JUMP_HISTORY_CAP) this.recentJumps.shift();
    this.pushAction('jump', this.observationMs);
    if (this.postDeathWindowMs > 0) {
      this.postDeathActions.push({ t: this.observationMs, kind: 'jump' });
    }
  }

  onLand(payload: LandPayload): void {
    if (payload.airTimeMs > 40) {
      this.airTimeSumMs += payload.airTimeMs;
      this.airBurstCount += 1;
    }
    this.currentAirMs = 0;
  }

  onDeath(payload: DeathPayload): void {
    this.deaths += 1;
    this.preDeathSignature = this.buildSignature(this.recentActions.slice(-12));
    this.postDeathWindowMs = 0;
    this.postDeathActions = [];
    void payload;
  }

  onAvoidance(payload: AvoidancePayload): void {
    this.avoidanceAttempts += 1;
    this.hazardReactions += 1;
    if (payload.direction === 'left') this.escapeLeft += 1;
    else this.escapeRight += 1;
  }

  /** Explicit hazard-reaction bump (near miss, flash, etc.). */
  onHazardReaction(): void {
    this.hazardReactions += 1;
  }

  onSegment(payload: SegmentPayload): void {
    if (payload.segment === this.lastSegment) return;
    this.lastSegment = payload.segment;
    this.currentRoute.push(payload.segment);
    if (this.currentRoute.length > ROUTE_LEN) {
      this.currentRoute.shift();
    }
    if (this.currentRoute.length === ROUTE_LEN) {
      const key = this.currentRoute.join('>');
      this.routeCounts.set(key, (this.routeCounts.get(key) ?? 0) + 1);
    }
  }

  getProfile(): BehaviourProfile {
    const moveTotal = this.moveLeftMs + this.moveRightMs;
    const leftMovementRatio = moveTotal > 0 ? this.moveLeftMs / moveTotal : 0;
    const rightMovementRatio = moveTotal > 0 ? this.moveRightMs / moveTotal : 0;

    const timeDenom = Math.max(1, this.observationMs);
    const idleTimeRatio = this.idleMs / timeDenom;
    const airTimeRatio = this.airMs / timeDenom;

    const minutes = timeDenom / 60000;
    const jumpsPerMinute = minutes > 0.01 ? this.jumpCount / minutes : 0;

    // jumpRate: share of "active" ground time that is interleaved with frequent jumps.
    // Blend jumps-per-minute (normalized) with air ratio so a jumpy player scores high.
    const jumpRate = Phaser.Math.Clamp(
      jumpsPerMinute / 45 + airTimeRatio * 0.55,
      0,
      1,
    );

    const preferredDirection: PreferredDirection =
      rightMovementRatio >= 0.58
        ? 'right'
        : leftMovementRatio >= 0.58
          ? 'left'
          : 'none';

    const repeatedJumpPattern = this.detectRepeatedJumpPattern();
    const { repeatedRoute, dominantRoute, routeRepetitionCount } = this.detectRouteRepetition();

    const preferredEscapeDirection: PreferredDirection =
      this.avoidanceAttempts === 0
        ? 'none'
        : this.escapeRight === this.escapeLeft
          ? 'none'
          : this.escapeRight > this.escapeLeft
            ? 'right'
            : 'left';

    const predictabilityScore = this.computePredictability({
      preferredDirection,
      rightMovementRatio,
      leftMovementRatio,
      jumpRate,
      repeatedJumpPattern,
      repeatedRoute,
      idleTimeRatio,
    });

    const predictability: PredictabilityLevel =
      predictabilityScore >= 0.72 ? 'HIGH' : predictabilityScore >= 0.42 ? 'MEDIUM' : 'LOW';

    const confidence = this.computeConfidence();

    return {
      jumpCount: this.jumpCount,
      jumpRate,
      jumpsPerMinute,
      rightMovementRatio,
      leftMovementRatio,
      idleTimeRatio,
      airTimeRatio,
      averageAirTimeMs:
        this.airBurstCount > 0 ? this.airTimeSumMs / this.airBurstCount : this.currentAirMs,
      averageIdleBurstMs:
        this.idleBurstCount > 0 ? this.idleBurstSumMs / this.idleBurstCount : this.currentIdleMs,
      preferredDirection,
      repeatedJumpPattern,
      repeatedRoute,
      dominantRoute,
      routeRepetitionCount,
      avoidanceAttempts: this.avoidanceAttempts,
      preferredEscapeDirection,
      deaths: this.deaths,
      repeatsAfterDeath: this.repeatsAfterDeath,
      hazardReactions: this.hazardReactions,
      predictability,
      predictabilityScore,
      confidence,
      observationMs: this.observationMs,
    };
  }

  /** Debug / tests: last move intent. */
  getLastMoveIntent(): MoveIntent {
    return this.lastMoveIntent;
  }

  // ---------------------------------------------------------------------------

  private pushAction(kind: ActionStamp['kind'], t: number): void {
    const last = this.recentActions[this.recentActions.length - 1];
    // Coalesce identical contiguous stamps so history stays action-like.
    if (last && last.kind === kind && t - last.t < 90) {
      last.t = t;
      return;
    }
    this.recentActions.push({ t, kind });
    if (this.recentActions.length > HISTORY_CAP) this.recentActions.shift();

    if (this.postDeathWindowMs > 0 && (kind === 'left' || kind === 'right' || kind === 'jump')) {
      this.postDeathActions.push({ t, kind });
    }
  }

  private endIdleBurst(): void {
    if (this.currentIdleMs >= 180) {
      this.idleBurstSumMs += this.currentIdleMs;
      this.idleBurstCount += 1;
    }
    this.currentIdleMs = 0;
  }

  private detectRepeatedJumpPattern(): boolean {
    if (this.recentJumps.length < 5) return false;
    const recent = this.recentJumps.slice(-8);
    const intervals: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      intervals.push(recent[i].t - recent[i - 1].t);
    }
    const rapid = intervals.filter((v) => v < RAPID_JUMP_MS).length;
    if (rapid / intervals.length < 0.6) return false;

    // Low variance in interval ⇒ rhythmic spam.
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance =
      intervals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / intervals.length;
    return Math.sqrt(variance) < mean * 0.45;
  }

  private detectRouteRepetition(): {
    repeatedRoute: boolean;
    dominantRoute: string | null;
    routeRepetitionCount: number;
  } {
    let dominantRoute: string | null = null;
    let routeRepetitionCount = 0;
    for (const [key, count] of this.routeCounts) {
      if (count > routeRepetitionCount) {
        routeRepetitionCount = count;
        dominantRoute = key;
      }
    }
    return {
      repeatedRoute: routeRepetitionCount >= 3,
      dominantRoute,
      routeRepetitionCount,
    };
  }

  private computePredictability(args: {
    preferredDirection: PreferredDirection;
    rightMovementRatio: number;
    leftMovementRatio: number;
    jumpRate: number;
    repeatedJumpPattern: boolean;
    repeatedRoute: boolean;
    idleTimeRatio: number;
  }): number {
    const dirBias = Math.max(args.rightMovementRatio, args.leftMovementRatio);
    let score = 0;
    score += Phaser.Math.Clamp((dirBias - 0.5) * 2, 0, 1) * 0.35;
    score += Phaser.Math.Clamp(args.jumpRate, 0, 1) * 0.2;
    if (args.repeatedJumpPattern) score += 0.2;
    if (args.repeatedRoute) score += 0.2;
    if (this.repeatsAfterDeath) score += 0.1;
    // Extreme idle is also predictable (stand still).
    if (args.idleTimeRatio > 0.25) score += 0.1;
    return Phaser.Math.Clamp(score, 0, 1);
  }

  private computeConfidence(): number {
    // Need time + movement samples + a few jumps or deaths to feel "learned".
    const timePart = Phaser.Math.Clamp(this.observationMs / 45000, 0, 1);
    const movePart = Phaser.Math.Clamp((this.moveLeftMs + this.moveRightMs) / 12000, 0, 1);
    const jumpPart = Phaser.Math.Clamp(this.jumpCount / 12, 0, 1);
    const routePart = Phaser.Math.Clamp(this.routeCounts.size / 4, 0, 1);
    return Phaser.Math.Clamp(timePart * 0.4 + movePart * 0.25 + jumpPart * 0.2 + routePart * 0.15, 0, 1);
  }

  private buildSignature(actions: ActionStamp[]): string {
    return actions
      .map((a) => a.kind[0])
      .join('')
      .slice(-10);
  }

  private evaluatePostDeathRepetition(): void {
    if (!this.preDeathSignature || this.postDeathActions.length < 3) {
      this.preDeathSignature = null;
      return;
    }
    this.deathRepeatChecks += 1;
    const sig = this.buildSignature(this.postDeathActions);
    // Overlap of first chars / containment heuristic.
    const overlap = sharedPrefixRatio(this.preDeathSignature, sig);
    if (overlap >= 0.5 || this.preDeathSignature.includes(sig.slice(0, 4))) {
      this.deathRepeatHits += 1;
      this.repeatsAfterDeath = this.deathRepeatHits / this.deathRepeatChecks >= 0.5;
    }
    this.preDeathSignature = null;
  }
}

function sharedPrefixRatio(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i / Math.max(a.length, b.length);
}
