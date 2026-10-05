import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';

/**
 * Maps AI awareness → clamped knobs for the AdaptationSystem.
 * Keeps Stage 4+ adaptations aggressive but never unfair.
 */
export class DifficultyManager {
  /** 0..1 aggression used to bias candidate scores / spawn density. */
  aggression(awareness: number): number {
    return Phaser.Math.Clamp(awareness, 0, 1);
  }

  /** How many tiles wide a direction trap may be. */
  spikeWidth(awareness: number): number {
    if (awareness >= 0.8) return 3;
    if (awareness >= 0.55) return 2;
    return 1;
  }

  /** Patrol speed for adaptive enemies. */
  enemySpeed(awareness: number): number {
    return 55 + Math.round(awareness * 50);
  }

  /** Soft cap on concurrent live adaptations. */
  maxLiveAdaptations(awareness: number): number {
    if (awareness >= 0.85) return 5;
    if (awareness >= 0.55) return 4;
    if (awareness >= 0.35) return 3;
    return 2;
  }

  cooldownScale(awareness: number): number {
    const base = GAME_CONFIG.DEMO_MODE
      ? GAME_CONFIG.AI.COOLDOWN_MS_DEMO
      : GAME_CONFIG.AI.COOLDOWN_MS_NORMAL;
    return base * (1 - awareness * 0.25);
  }
}
