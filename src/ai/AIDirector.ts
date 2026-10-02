import { GAME_CONFIG } from '../config/gameConfig';
import type {
  AvoidancePayload,
  DeathPayload,
  JumpPayload,
  LandPayload,
  PlayerSamplePayload,
  SegmentPayload,
} from '../events/GameEvents';
import { BehaviourTracker, type BehaviourProfile } from './BehaviourTracker';
import { PredictionEngine, type ActionPrediction } from './PredictionEngine';
import { DifficultyManager } from '../systems/DifficultyManager';
import { AdaptationSystem, type AdaptationDecision } from './AdaptationSystem';
import type { Player } from '../entities/Player';

/**
 * High-level AI Director states.
 */
export type AIDirectorState = 'OBSERVE' | 'LEARN' | 'ADAPT' | 'COUNTER' | 'PREDICT';

export interface AIDirectorSnapshot {
  state: AIDirectorState;
  /** 0..1 — how much the game "knows" the player so far. */
  awareness: number;
  profile: BehaviourProfile;
  prediction: ActionPrediction;
  /** Human-readable strategy label for HUD / debug. */
  strategy: string;
  /** What the Director intends to prepare / last planned. */
  nextAdaptation: string;
  /** Last fired adaptation detail, if any. */
  lastAdaptation: string | null;
  adaptationCount: number;
  /** 0..1 — how often locked predictions matched the player's next action. */
  predictionAccuracy: number;
}

/**
 * Observes BehaviourTracker, predicts via PredictionEngine, and triggers
 * AdaptationSystem once awareness crosses adapt thresholds.
 */
export class AIDirector {
  readonly tracker: BehaviourTracker;
  readonly predictor: PredictionEngine;
  readonly difficulty: DifficultyManager;

  private adaptations: AdaptationSystem | null = null;
  private getPlayer: (() => Player) | null = null;

  private state: AIDirectorState = 'OBSERVE';
  private awareness = 0;
  private strategy = 'WATCHING';
  private nextAdaptation = 'NONE';
  private lastAdaptation: string | null = null;
  private adaptationCount = 0;

  private cooldownMs = 0;
  private lastSample: PlayerSamplePayload | null = null;
  private lastPrediction: ActionPrediction = {
    LEFT: 0.25,
    RIGHT: 0.25,
    JUMP: 0.25,
    IDLE: 0.25,
    likely: 'RIGHT',
    confidence: 0,
  };

  constructor(tracker?: BehaviourTracker) {
    this.tracker = tracker ?? new BehaviourTracker();
    this.predictor = new PredictionEngine();
    this.difficulty = new DifficultyManager();
  }

  /** Bind level systems for the current GameScene run. */
  attachWorld(adaptations: AdaptationSystem, getPlayer: () => Player): void {
    this.adaptations = adaptations;
    this.getPlayer = getPlayer;
    this.cooldownMs = 0;
  }

  detachWorld(): void {
    this.adaptations = null;
    this.getPlayer = null;
  }

  beginRun(): void {
    this.tracker.beginRun();
    this.predictor.beginRun();
    this.lastSample = null;
    this.cooldownMs = GAME_CONFIG.DEMO_MODE ? 600 : 4000;
    this.lastAdaptation = null;
    this.refreshDerived();
  }

  /** Full wipe (e.g. from menu "new session"). */
  resetSession(): void {
    this.tracker.reset();
    this.predictor.reset();
    this.lastSample = null;
    this.state = 'OBSERVE';
    this.awareness = 0;
    this.strategy = 'WATCHING';
    this.nextAdaptation = 'NONE';
    this.lastAdaptation = null;
    this.adaptationCount = 0;
    this.cooldownMs = 0;
    this.detachWorld();
  }

  onSample(payload: PlayerSamplePayload): void {
    this.lastSample = payload;
    this.tracker.onSample(payload);
    this.predictor.observeSample(payload);
    this.refreshDerived();
  }

  onJump(payload: JumpPayload): void {
    this.tracker.onJump(payload);
    this.predictor.observeJump();
    this.refreshDerived();
  }

  onLand(payload: LandPayload): void {
    this.tracker.onLand(payload);
    this.refreshDerived();
  }

  onDeath(payload: DeathPayload): void {
    this.tracker.onDeath(payload);
    this.refreshDerived();
  }

  onAvoidance(payload: AvoidancePayload): void {
    this.tracker.onAvoidance(payload);
    this.refreshDerived();
  }

  onSegment(payload: SegmentPayload): void {
    this.tracker.onSegment(payload);
    this.refreshDerived();
  }

  /**
   * Called each gameplay frame. May fire at most one adaptation when ready.
   */
  tick(delta: number): AdaptationDecision | null {
    this.cooldownMs = Math.max(0, this.cooldownMs - delta);
    this.refreshDerived();
    if (this.lastSample) {
      this.predictor.tick(delta, PredictionEngine.actionFromSample(this.lastSample));
    }

    if (!this.adaptations || !this.getPlayer) return null;
    if (this.cooldownMs > 0) return null;
    if (this.state === 'OBSERVE' || this.state === 'LEARN') return null;

    const player = this.getPlayer();
    if (player.isDead) return null;

    const profile = this.tracker.getProfile();
    const decision = this.adaptations.tryAdapt({
      player,
      profile,
      prediction: this.lastPrediction,
      aggressive: this.state === 'COUNTER' || this.state === 'PREDICT',
      awareness: this.awareness,
      difficulty: this.difficulty,
    });

    if (!decision) return null;

    this.adaptationCount += 1;
    this.lastAdaptation = decision.detail;
    this.nextAdaptation = decision.detail;
    this.strategy = this.strategyFromDecision(decision);
    if (decision.kind === 'prediction') {
      this.predictor.lockPrediction(this.lastPrediction);
    }

    const baseCd = this.difficulty.cooldownScale(this.awareness);
    // Faster follow-ups once countering / predicting.
    const scale = this.state === 'PREDICT' ? 0.7 : this.state === 'COUNTER' ? 0.85 : 1;
    this.cooldownMs = baseCd * scale;

    return decision;
  }

  getSnapshot(): AIDirectorSnapshot {
    return {
      state: this.state,
      awareness: this.awareness,
      profile: this.tracker.getProfile(),
      prediction: this.lastPrediction,
      strategy: this.strategy,
      nextAdaptation: this.nextAdaptation,
      lastAdaptation: this.lastAdaptation,
      adaptationCount: this.adaptationCount,
      predictionAccuracy: this.predictor.getAccuracy(),
    };
  }

  // ---------------------------------------------------------------------------

  private refreshDerived(): void {
    const profile = this.tracker.getProfile();
    this.lastPrediction = this.predictor.predictNextAction(profile);

    const learnMs = GAME_CONFIG.DEMO_MODE
      ? GAME_CONFIG.AI.LEARN_MS_DEMO
      : GAME_CONFIG.AI.LEARN_MS_NORMAL;
    const adaptMs = GAME_CONFIG.DEMO_MODE
      ? GAME_CONFIG.AI.ADAPT_MS_DEMO
      : GAME_CONFIG.AI.ADAPT_MS_NORMAL;

    const timeFactor = Math.min(1, profile.observationMs / learnMs);
    const adaptFactor = Math.min(1, profile.observationMs / adaptMs);

    this.awareness = Math.min(
      1,
      profile.confidence * 0.5 +
        timeFactor * 0.25 +
        adaptFactor * 0.15 +
        profile.predictabilityScore * 0.12 +
        Math.min(0.15, this.adaptationCount * 0.03),
    );

    this.state = this.resolveState(profile);
    if (!this.lastAdaptation) {
      this.strategy = this.deriveStrategy(profile);
      this.nextAdaptation = this.deriveNextHint(profile);
    } else if (this.cooldownMs > 800) {
      // Keep last strategy visible briefly; still update next hint.
      this.nextAdaptation = this.deriveNextHint(profile);
    } else {
      this.strategy = this.deriveStrategy(profile);
      this.nextAdaptation = this.deriveNextHint(profile);
    }
  }

  private resolveState(profile: BehaviourProfile): AIDirectorState {
    const { AI } = GAME_CONFIG;
    const adaptMs = GAME_CONFIG.DEMO_MODE ? AI.ADAPT_MS_DEMO : AI.ADAPT_MS_NORMAL;

    if (
      this.awareness >= AI.PREDICT_AWARENESS &&
      this.lastPrediction.confidence >= 0.3 &&
      profile.observationMs >= adaptMs
    ) {
      return 'PREDICT';
    }
    if (
      this.awareness >= AI.COUNTER_AWARENESS &&
      (profile.predictability === 'HIGH' || profile.repeatedJumpPattern || profile.repeatedRoute)
    ) {
      return 'COUNTER';
    }
    if (this.awareness >= AI.ADAPT_AWARENESS || profile.observationMs >= adaptMs) {
      return 'ADAPT';
    }
    if (this.awareness >= AI.LEARN_AWARENESS || profile.observationMs >= (GAME_CONFIG.DEMO_MODE ? AI.LEARN_MS_DEMO : AI.LEARN_MS_NORMAL)) {
      return 'LEARN';
    }
    return 'OBSERVE';
  }

  private deriveStrategy(profile: BehaviourProfile): string {
    switch (this.state) {
      case 'OBSERVE':
        return 'WATCHING';
      case 'LEARN':
        if (profile.repeatedJumpPattern || profile.jumpRate > 0.7) return 'STUDYING JUMPS';
        if (profile.preferredDirection === 'right') return 'STUDYING RIGHT BIAS';
        if (profile.preferredDirection === 'left') return 'STUDYING LEFT BIAS';
        if (profile.idleTimeRatio > 0.2) return 'STUDYING HESITATION';
        return 'LEARNING YOU';
      case 'ADAPT':
        return 'ADAPTING TO YOU';
      case 'COUNTER':
        if (profile.jumpRate > 0.65) return 'COUNTER JUMPING';
        if (profile.rightMovementRatio > 0.7) return 'COUNTER RIGHT BIAS';
        if (profile.leftMovementRatio > 0.7) return 'COUNTER LEFT BIAS';
        if (profile.repeatedRoute) return 'COUNTER ROUTE';
        return 'COUNTERING PATTERN';
      case 'PREDICT':
        return `PREDICTING ${this.lastPrediction.likely}`;
      default:
        return 'WATCHING';
    }
  }

  private deriveNextHint(profile: BehaviourProfile): string {
    if (this.state === 'OBSERVE') return 'COLLECTING DATA';
    if (this.state === 'LEARN') return 'PREPARING ADAPTATION';
    if (profile.jumpRate > 0.7 || profile.repeatedJumpPattern || this.lastPrediction.likely === 'JUMP') {
      return 'OVERHEAD HAZARD';
    }
    if (profile.rightMovementRatio > 0.75) return 'DIRECTION TRAP (RIGHT)';
    if (profile.leftMovementRatio > 0.75) return 'DIRECTION TRAP (LEFT)';
    if (profile.idleTimeRatio > 0.2) return 'PRESSURE EVENT';
    if (profile.repeatedRoute) return 'ROUTE ADAPTATION';
    if (profile.preferredEscapeDirection !== 'none') return 'ESCAPE TRAP';
    if (this.state === 'PREDICT') return `PREDICTION (${this.lastPrediction.likely})`;
    if (profile.predictability === 'HIGH') return 'FAKE SAFE PLATFORM';
    return 'WAITING FOR PATTERN';
  }

  private strategyFromDecision(decision: AdaptationDecision): string {
    switch (decision.kind) {
      case 'overhead':
        return 'COUNTER JUMPING';
      case 'direction':
        return 'COUNTER DIRECTION';
      case 'escape':
        return 'COUNTER ESCAPE';
      case 'fake_platform':
        return 'FAKE SAFE PLATFORM';
      case 'route':
        return 'ROUTE ADAPTATION';
      case 'pressure':
        return 'PRESSURE';
      case 'enemy':
        return 'SENDING HUNTER';
      case 'moving_platform':
        return 'FORCING TIMING';
      case 'timed_hazard':
        return 'TIMED HAZARD';
      case 'prediction':
        return `PREDICTED ${this.lastPrediction.likely}`;
      default:
        return 'ADAPTING';
    }
  }
}
