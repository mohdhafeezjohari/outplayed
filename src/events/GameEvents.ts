/**
 * Typed gameplay events. The AI layer observes these without owning
 * player / physics logic. Stage 2+ subscribers: BehaviourTracker via AIDirector.
 */

export const GameEvents = {
  /** Fired once when a jump actually launches (after coyote/buffer resolve). */
  JUMP: 'player-jump',
  /** Fired once on landing after being airborne. */
  LAND: 'player-land',
  /** Compact per-frame sample for movement / idle / air ratios. */
  SAMPLE: 'player-sample',
  /** Player died. */
  DEATH: 'player-death',
  /** Player reached the goal. */
  COMPLETE: 'player-complete',
  /** Player briefly reversed away from a nearby hazard (escape). */
  AVOIDANCE: 'player-avoidance',
  /** Player entered a new coarse world segment (route tracking). */
  SEGMENT: 'player-segment',
} as const;

export type GameEventName = (typeof GameEvents)[keyof typeof GameEvents];

export type MoveIntent = 'left' | 'right' | 'none';

export interface PlayerSamplePayload {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  facing: 1 | -1;
  /** Horizontal input this frame. */
  moveIntent: MoveIntent;
  /** True when grounded and |vx| is near zero with no move input. */
  idle: boolean;
  deltaMs: number;
}

export interface JumpPayload {
  x: number;
  y: number;
  groundedAtJump: boolean;
}

export interface LandPayload {
  x: number;
  y: number;
  airTimeMs: number;
}

export interface DeathPayload {
  x: number;
  y: number;
  cause: string;
  /** Coarse segment id at death (for post-death repetition). */
  segment: number;
}

export interface AvoidancePayload {
  /** Direction the player fled. */
  direction: 'left' | 'right';
  x: number;
  y: number;
}

export interface SegmentPayload {
  segment: number;
  x: number;
}
