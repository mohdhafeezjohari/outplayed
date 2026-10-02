import Phaser from 'phaser';
import { GAME_CONFIG, SCENES, RunResult } from '../config/gameConfig';
import { ScoreManager } from '../systems/ScoreManager';
import { Backdrop } from '../ui/Backdrop';
import { resetAIDirector } from '../ai/session';

const { COLORS, FONT, WIDTH } = GAME_CONFIG;
/** Ignore retry input briefly so a held key does not skip the screen. */
const INPUT_DELAY_MS = 450;

export class GameOverScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private result!: RunResult;
  private leaving = false;
  private readyAt = 0;

  constructor() {
    super(SCENES.GAME_OVER);
  }

  init(data: Partial<RunResult>): void {
    this.result = {
      score: data.score ?? 0,
      timeMs: data.timeMs ?? 0,
      completed: data.completed ?? false,
      cause: data.cause ?? '',
      username: data.username,
      awareness: data.awareness,
      aiState: data.aiState,
      jumpRate: data.jumpRate,
      rightMovementRatio: data.rightMovementRatio,
      predictability: data.predictability,
      predictionAccuracy: data.predictionAccuracy,
      adaptationCount: data.adaptationCount,
    };
  }

  create(): void {
    this.leaving = false;
    this.readyAt = this.time.now + INPUT_DELAY_MS;
    this.backdrop = new Backdrop(this);
    this.cameras.main.fadeIn(300, 5, 6, 11);

    const { completed, score, timeMs, cause } = this.result;
    const accent = completed ? '#7cffb2' : COLORS.UI_WARN;

    const title = this.add
      .text(WIDTH / 2, 100, completed ? 'SIGNAL REACHED' : 'TERMINATED', {
        fontFamily: FONT,
        fontSize: '52px',
        fontStyle: 'bold',
        color: accent,
      })
      .setOrigin(0.5);
    title.setShadow(0, 0, accent, 20, false, true);

    this.add
      .text(WIDTH / 2, 152, cause.toUpperCase(), {
        fontFamily: FONT,
        fontSize: '14px',
        color: COLORS.UI_DIM,
      })
      .setOrigin(0.5);

    if (this.result.username) {
      this.add
        .text(WIDTH / 2, 172, this.result.username.toUpperCase(), {
          fontFamily: FONT,
          fontSize: '16px',
          color: COLORS.UI_ACCENT,
        })
        .setOrigin(0.5);
    }

    // score / time panel
    const panel = this.add.graphics();
    panel.fillStyle(0x05060b, 0.6);
    panel.fillRoundedRect(WIDTH / 2 - 190, 185, 380, 100, 8);
    panel.fillStyle(0xffffff, 0.06);
    panel.fillRect(WIDTH / 2 - 170, 235, 340, 1);

    this.stat(WIDTH / 2, 198, 'SCORE', ScoreManager.formatScore(score));
    this.stat(WIDTH / 2, 248, 'TIME', ScoreManager.formatTime(timeMs));

    // Subtle behaviour readout (the full reveal lives in RevealScene)
    if (this.result.awareness !== undefined) {
      const aw = Math.round((this.result.awareness ?? 0) * 100);
      const jump = Math.round((this.result.jumpRate ?? 0) * 100);
      const right = Math.round((this.result.rightMovementRatio ?? 0) * 100);
      const pred = this.result.predictability ?? '—';
      const state = (this.result.aiState ?? 'OBSERVE').toUpperCase();

      this.add
        .text(WIDTH / 2, 310, `AI AWARENESS  ${aw}%   ·   STATE  ${state}`, {
          fontFamily: FONT,
          fontSize: '13px',
          color: COLORS.UI_ACCENT,
        })
        .setOrigin(0.5);

      this.add
        .text(
          WIDTH / 2,
          334,
          `JUMP ${jump}%    RIGHT ${right}%    PREDICTABILITY ${pred}`,
          {
            fontFamily: FONT,
            fontSize: '12px',
            color: COLORS.UI_DIM,
          },
        )
        .setOrigin(0.5);
    }

    const prompt = this.add
      .text(WIDTH / 2, 400, 'PRESS R OR SPACE TO RETRY', {
        fontFamily: FONT,
        fontSize: '20px',
        color: COLORS.UI_ACCENT,
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: prompt,
      alpha: { from: 1, to: 0.25 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(WIDTH / 2, 438, 'M  menu (resets AI)   ·   L  leaderboard', {
        fontFamily: FONT,
        fontSize: '13px',
        color: COLORS.UI_DIM,
      })
      .setOrigin(0.5);

    const kb = this.input.keyboard;
    kb?.on('keydown-R', () => this.go(SCENES.GAME));
    kb?.on('keydown-SPACE', () => this.go(SCENES.GAME));
    kb?.on('keydown-ENTER', () => this.go(SCENES.GAME));
    kb?.on('keydown-M', () => this.go(SCENES.MENU, true));
    kb?.on('keydown-L', () => this.go(SCENES.LEADERBOARD));
  }

  update(_time: number, delta: number): void {
    this.backdrop.drift(delta);
  }

  private stat(cx: number, y: number, label: string, value: string): void {
    this.add.text(cx - 150, y + 8, label, {
      fontFamily: FONT,
      fontSize: '13px',
      color: COLORS.UI_DIM,
    });
    this.add
      .text(cx + 150, y, value, {
        fontFamily: FONT,
        fontSize: '28px',
        color: COLORS.UI_TEXT,
      })
      .setOrigin(1, 0);
  }

  private go(scene: string, resetMemory = false): void {
    if (this.leaving || this.time.now < this.readyAt) return;
    this.leaving = true;
    this.cameras.main.fadeOut(200, 5, 6, 11, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress === 1) {
        // Returning to the menu wipes what the AI learned; retry keeps it.
        if (resetMemory) resetAIDirector(this.game);
        this.scene.start(scene);
      }
    });
  }
}
