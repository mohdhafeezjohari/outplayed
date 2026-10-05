/**
 * Central game configuration. Everything tunable lives here so later stages
 * (AI Director, adaptive difficulty) can read the same source of truth.
 */

export const GAME_CONFIG = {
  WIDTH: 960,
  HEIGHT: 540,
  GRAVITY: 1500,

  /**
   * DEMO_MODE shortens observation / learn windows so judges see the AI
   * "wake up" within ~20–30s instead of ~60–120s.
   */
  DEMO_MODE: true,

  AI: {
    /** Time before awareness can fully enter LEARN (normal play). */
    LEARN_MS_NORMAL: 90_000,
    /** Time before awareness can fully enter LEARN (demo / pitch). */
    LEARN_MS_DEMO: 5_000,
    /** Awareness threshold that flips OBSERVE → LEARN. */
    LEARN_AWARENESS: 0.22,
    /** Awareness / time gate before adaptive events may fire. */
    ADAPT_MS_NORMAL: 60_000,
    /** First blockers ~5s in demo so a pure sprint cannot clear before the AI wakes. */
    ADAPT_MS_DEMO: 5_000,
    ADAPT_AWARENESS: 0.28,
    COUNTER_AWARENESS: 0.48,
    PREDICT_AWARENESS: 0.65,
    /** Minimum gap between adaptive events. */
    COOLDOWN_MS_NORMAL: 5_500,
    COOLDOWN_MS_DEMO: 1_600,
    /** Extra-short cooldown when the player is sprint-rushing right. */
    SPRINT_COOLDOWN_MS_DEMO: 1_100,
    SPRINT_COOLDOWN_MS_NORMAL: 3_200,
    /** Right-bias + low idle = sprint rush (mindless forward play). */
    SPRINT_RIGHT_RATIO: 0.72,
    SPRINT_MAX_IDLE: 0.08,
    /** Min observation before sprint rush can force ADAPT. */
    SPRINT_FORCE_ADAPT_MS_DEMO: 3_500,
    SPRINT_FORCE_ADAPT_MS_NORMAL: 18_000,
    /** World segment width for route tracking (px). */
    SEGMENT_SIZE: 128,
    /** Never spawn adaptive hazards closer than this to the player. */
    MIN_SPAWN_DISTANCE: 150,
    /** Warning time before an adaptive hazard becomes deadly. */
    TELEGRAPH_MS: 700,
  },

  TILE: 32,

  PLAYER: {
    WIDTH: 22,
    HEIGHT: 38,
    MAX_SPEED: 250,
    GROUND_ACCEL: 2400,
    GROUND_FRICTION: 2800,
    AIR_ACCEL: 1500,
    AIR_FRICTION: 700,
    JUMP_VELOCITY: -590,
    /** Multiplier applied to upward velocity when jump is released early. */
    JUMP_CUT: 0.45,
    COYOTE_MS: 100,
    JUMP_BUFFER_MS: 120,
    MAX_FALL_SPEED: 900,
  },

  LEVEL: {
    /** Y coordinate of the top surface of the ground. */
    GROUND_Y: 480,
    /** Falling below this Y kills the player. */
    KILL_Y: 540 + 120,
  },

  SCORE: {
    SHARD: 100,
    /** One point per this many pixels of new forward progress. */
    PIXELS_PER_POINT: 10,
  },

  COLORS: {
    BG_TOP: 0x070914,
    BG_BOTTOM: 0x12162b,
    PLAYER: 0xffd23f,
    PLAYER_SHADE: 0xc9951a,
    VISOR: 0x0b0e1a,
    EYE: 0x4cf0ff,
    PLATFORM: 0x252b4a,
    PLATFORM_EDGE: 0x4cc9f0,
    GROUND: 0x1a1f38,
    HAZARD: 0xff3d6e,
    ENEMY: 0xc44dff,
    ENEMY_CORE: 0xff7ae5,
    SHARD: 0x4cf0ff,
    GOAL: 0x7cffb2,
    UI_TEXT: '#e8f1ff',
    UI_DIM: '#6f7ba6',
    UI_ACCENT: '#4cf0ff',
    UI_WARN: '#ff3d6e',
  },

  FONT: '"Consolas", "Courier New", monospace',
} as const;

export const TEXTURES = {
  PLAYER: 'player',
  PLATFORM: 'platform',
  GROUND: 'ground',
  SPIKE: 'spike',
  SHARD: 'shard',
  GOAL: 'goal',
  ENEMY: 'enemy',
  PARTICLE: 'particle',
  BG_GRADIENT: 'bg-gradient',
  BG_STARS: 'bg-stars',
  BG_SKYLINE: 'bg-skyline',
  BG_GRID: 'bg-grid',
} as const;

export const SCENES = {
  BOOT: 'BootScene',
  MENU: 'MenuScene',
  GAME: 'GameScene',
  GAME_OVER: 'GameOverScene',
  REVEAL: 'RevealScene',
  LEADERBOARD: 'LeaderboardScene',
} as const;

/** Awareness tiers shown subtly in the HUD (LEVEL 0–4). */
export function awarenessLevel(awareness: number): number {
  if (awareness >= 0.85) return 4;
  if (awareness >= 0.7) return 3;
  if (awareness >= 0.5) return 2;
  if (awareness >= 0.28) return 1;
  return 0;
}

export function awarenessLevelLabel(level: number): string {
  switch (level) {
    case 0:
      return 'OBSERVING';
    case 1:
      return 'LEARNING';
    case 2:
      return 'ADAPTING';
    case 3:
      return 'PREDICTING';
    case 4:
      return 'KNOWING YOU';
    default:
      return 'OBSERVING';
  }
}

/** Data handed from GameScene to GameOver / Reveal scenes. */
export interface RunResult {
  score: number;
  timeMs: number;
  completed: boolean;
  cause: string;
  username?: string;
  awareness?: number;
  aiState?: string;
  jumpRate?: number;
  rightMovementRatio?: number;
  leftMovementRatio?: number;
  idleTimeRatio?: number;
  predictability?: string;
  predictabilityScore?: number;
  predictionAccuracy?: number;
  adaptationCount?: number;
  riskTaking?: number;
  repetition?: string;
}
