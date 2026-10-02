import Phaser from 'phaser';
import type { BehaviourProfile } from './BehaviourTracker';
import type { ActionPrediction } from './PredictionEngine';
import type { SpawnManager, AdaptiveKind } from '../systems/SpawnManager';
import type { Player } from '../entities/Player';
import type { DifficultyManager } from '../systems/DifficultyManager';

export interface AdaptationDecision {
  kind: AdaptiveKind;
  reason: string;
  banner: string;
  detail: string;
}

export interface AdaptationContext {
  player: Player;
  profile: BehaviourProfile;
  prediction: ActionPrediction;
  aggressive: boolean;
  awareness: number;
  difficulty: DifficultyManager;
}

interface ScoredDecision extends AdaptationDecision {
  score: number;
}

/**
 * Turns Director intent into fair level changes via SpawnManager.
 */
export class AdaptationSystem {
  constructor(private readonly spawns: SpawnManager) {}

  tryAdapt(ctx: AdaptationContext): AdaptationDecision | null {
    if (this.spawns.liveCount() >= ctx.difficulty.maxLiveAdaptations(ctx.awareness)) {
      return null;
    }

    const candidates = this.rankCandidates(ctx);
    for (const c of candidates) {
      if (this.execute(c.kind, ctx)) {
        return { kind: c.kind, reason: c.reason, banner: c.banner, detail: c.detail };
      }
    }
    return null;
  }

  private rankCandidates(ctx: AdaptationContext): ScoredDecision[] {
    const { profile, prediction, aggressive, awareness } = ctx;
    const out: ScoredDecision[] = [];
    const boost = aggressive ? 0.1 : 0;

    const push = (
      kind: AdaptiveKind,
      score: number,
      reason: string,
      banner: string,
      detail: string,
    ) => {
      if (score <= 0) return;
      out.push({ kind, reason, banner, detail, score: score + boost });
    };

    if (profile.jumpRate > 0.55 || profile.repeatedJumpPattern || prediction.likely === 'JUMP') {
      push(
        'overhead',
        profile.jumpRate * 1.2 + (profile.repeatedJumpPattern ? 0.35 : 0) + prediction.JUMP,
        `jumpRate=${profile.jumpRate.toFixed(2)}`,
        'AI ADAPTATION DETECTED',
        'COUNTERING YOUR JUMPING',
      );
    }

    if (profile.rightMovementRatio > 0.65 || prediction.likely === 'RIGHT') {
      push(
        'direction',
        profile.rightMovementRatio + prediction.RIGHT * 0.5,
        `rightBias=${profile.rightMovementRatio.toFixed(2)}`,
        'AI ADAPTATION DETECTED',
        'COUNTERING RIGHTWARD MOVEMENT',
      );
    }

    if (profile.leftMovementRatio > 0.65 || prediction.likely === 'LEFT') {
      push(
        'escape',
        profile.leftMovementRatio + prediction.LEFT * 0.5,
        `leftBias=${profile.leftMovementRatio.toFixed(2)}`,
        'AI ADAPTATION DETECTED',
        'COUNTERING LEFTWARD MOVEMENT',
      );
    }

    if (profile.avoidanceAttempts >= 2 && profile.preferredEscapeDirection !== 'none') {
      push(
        'escape',
        0.55 + profile.avoidanceAttempts * 0.05,
        `escape=${profile.preferredEscapeDirection}`,
        'AI ADAPTATION DETECTED',
        'CUTTING OFF YOUR ESCAPE',
      );
      push(
        'enemy',
        0.5 + profile.avoidanceAttempts * 0.08,
        'chase after escape',
        'AI ADAPTATION DETECTED',
        'SENDING A HUNTER',
      );
    }

    if (profile.idleTimeRatio > 0.12 || prediction.likely === 'IDLE') {
      push(
        'pressure',
        profile.idleTimeRatio * 1.4 + prediction.IDLE,
        `idle=${profile.idleTimeRatio.toFixed(2)}`,
        'AI ADAPTATION DETECTED',
        'APPLYING PRESSURE — KEEP MOVING',
      );
      push(
        'moving_platform',
        0.45 + profile.idleTimeRatio,
        'force timing',
        'AI ADAPTATION DETECTED',
        'MOVING PLATFORM DEPLOYED',
      );
      push(
        'timed_hazard',
        0.4 + profile.idleTimeRatio,
        'timed pressure',
        'AI ADAPTATION DETECTED',
        'TIMED HAZARD ONLINE',
      );
    }

    if (profile.repeatedRoute) {
      push(
        'route',
        0.7 + profile.routeRepetitionCount * 0.05,
        `route×${profile.routeRepetitionCount}`,
        'AI ADAPTATION DETECTED',
        'ALTERING YOUR ROUTE',
      );
    }

    if (profile.predictabilityScore > 0.5 && profile.jumpRate > 0.4) {
      push(
        'fake_platform',
        profile.predictabilityScore * 0.9,
        'predictable jumper',
        'AI ADAPTATION DETECTED',
        'TEMPTING SAFE PLATFORM',
      );
    }

    // Enemies appear once the AI is actually adapting.
    if (awareness >= 0.4 && (profile.rightMovementRatio > 0.6 || profile.predictabilityScore > 0.45)) {
      push(
        'enemy',
        0.48 + awareness * 0.3,
        'adaptive hunter',
        'AI ADAPTATION DETECTED',
        'COUNTERING WITH A HUNTER',
      );
    }

    if (prediction.confidence > 0.3 && profile.confidence > 0.35) {
      push(
        'prediction',
        0.55 + prediction.confidence + (aggressive ? 0.15 : 0),
        `predict ${prediction.likely} @${prediction.confidence.toFixed(2)}`,
        'AI ADAPTATION DETECTED',
        `PREDICTED: ${prediction.likely}`,
      );
    }

    out.sort((a, b) => b.score - a.score);
    return out;
  }

  private execute(kind: AdaptiveKind, ctx: AdaptationContext): boolean {
    const player = ctx.player;
    const facing = player.facing;
    const moveDir =
      ctx.profile.preferredDirection === 'left'
        ? -1
        : ctx.profile.preferredDirection === 'right'
          ? 1
          : facing;

    const ahead = player.x + moveDir * Phaser.Math.Between(180, 260);
    const width = ctx.difficulty.spikeWidth(ctx.awareness);
    const enemySpeed = ctx.difficulty.enemySpeed(ctx.awareness);

    switch (kind) {
      case 'overhead':
        return this.spawns.spawnOverheadTrap(kind, player.x + moveDir * 200);
      case 'direction':
        return this.spawns.spawnDirectionSpikes(kind, ahead, width);
      case 'escape': {
        const escapeDir =
          ctx.profile.preferredEscapeDirection === 'left'
            ? -1
            : ctx.profile.preferredEscapeDirection === 'right'
              ? 1
              : moveDir;
        return this.spawns.spawnDirectionSpikes(kind, player.x + escapeDir * 200, width);
      }
      case 'fake_platform':
        return this.spawns.spawnFakeSafePlatform(kind, ahead);
      case 'route':
        return this.spawns.spawnRouteBlock(kind, ahead);
      case 'pressure':
        return this.spawns.spawnPressure(kind);
      case 'enemy':
        return this.spawns.spawnEnemy(kind, ahead, enemySpeed);
      case 'moving_platform':
        return this.spawns.spawnMovingPlatform(kind, ahead);
      case 'timed_hazard':
        return this.spawns.spawnTimedHazard(kind, ahead);
      case 'prediction':
        return this.spawns.spawnPredictionEvent(kind, ctx.prediction.likely, ahead);
      default:
        return false;
    }
  }
}
