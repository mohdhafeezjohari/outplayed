import { GAME_CONFIG } from '../config/gameConfig';

/** Tracks score (shards + forward progress) and elapsed run time. */
export class ScoreManager {
  private bonusScore = 0;
  private progressScore = 0;
  private furthestX = 0;
  private startX = 0;
  private elapsedMs = 0;

  reset(startX = 0): void {
    this.bonusScore = 0;
    this.progressScore = 0;
    this.furthestX = startX;
    this.startX = startX;
    this.elapsedMs = 0;
  }

  /** Advance the run clock. Skip calling while paused / dead. */
  tick(deltaMs: number): void {
    this.elapsedMs += deltaMs;
  }

  addBonus(points: number): void {
    this.bonusScore += points;
  }

  /** Award points for new forward progress only (no farming back and forth). */
  registerProgress(playerX: number): void {
    if (playerX <= this.furthestX) return;
    this.furthestX = playerX;
    this.progressScore = Math.floor(
      (this.furthestX - this.startX) / GAME_CONFIG.SCORE.PIXELS_PER_POINT,
    );
  }

  get score(): number {
    return this.bonusScore + this.progressScore;
  }

  get timeMs(): number {
    return this.elapsedMs;
  }

  static formatTime(ms: number): string {
    const totalTenths = Math.floor(ms / 100);
    const tenths = totalTenths % 10;
    const totalSeconds = Math.floor(totalTenths / 10);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60);
    return `${pad(minutes, 2)}:${pad(seconds, 2)}.${tenths}`;
  }

  static formatScore(score: number): string {
    return pad(score, 5);
  }
}

function pad(n: number, width: number): string {
  return n.toString().padStart(width, '0');
}
