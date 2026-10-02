import Phaser from 'phaser';
import { GAME_CONFIG, SCENES, RunResult } from '../config/gameConfig';
import { Backdrop } from '../ui/Backdrop';
import { ScoreManager } from '../systems/ScoreManager';
import { SoundFX } from '../utils/SoundFX';
import { resetAIDirector } from '../ai/session';

const { COLORS, FONT, WIDTH, HEIGHT } = GAME_CONFIG;

/** Ignore input briefly so a held key does not skip the reveal. */
const INPUT_DELAY_MS = 150;
const BAR_W = 330;
const BAR_H = 10;

interface BehaviourRow {
  label: string;
  value: number;
  note?: string;
  color: number;
}

/**
 * Ending screen: the game shows the player everything it learned about them.
 */
export class RevealScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private result!: RunResult;
  private leaving = false;
  private readyAt = 0;
  private promptsShown = false;

  constructor() {
    super(SCENES.REVEAL);
  }

  init(data: Partial<RunResult>): void {
    this.result = {
      score: data.score ?? 0,
      timeMs: data.timeMs ?? 0,
      completed: data.completed ?? false,
      cause: data.cause ?? '',
      awareness: data.awareness,
      aiState: data.aiState,
      jumpRate: data.jumpRate,
      rightMovementRatio: data.rightMovementRatio,
      leftMovementRatio: data.leftMovementRatio,
      idleTimeRatio: data.idleTimeRatio,
      predictability: data.predictability,
      predictabilityScore: data.predictabilityScore,
      predictionAccuracy: data.predictionAccuracy,
      adaptationCount: data.adaptationCount,
      riskTaking: data.riskTaking,
      repetition: data.repetition,
      username: data.username,
    };
  }

  create(): void {
    this.leaving = false;
    this.promptsShown = false;
    // Input unlocks once the prompts appear, so the reveal is never skipped by accident.
    this.readyAt = Number.POSITIVE_INFINITY;

    this.backdrop = new Backdrop(this);
    this.cameras.main.fadeIn(600, 5, 6, 11);
    SoundFX.reveal();

    this.buildVignette();
    this.buildTitle();

    const rows = this.behaviourRows();
    rows.forEach((row, i) => this.buildBar(row, 90, 150 + i * 52, 700 + i * 520));

    const accuracy = Phaser.Math.Clamp(this.result.predictionAccuracy ?? 0.5, 0, 1);
    this.buildAccuracy(accuracy, 2900);

    const quoteDelay = 4600;
    this.buildQuote(quoteDelay);
    this.time.delayedCall(quoteDelay + 1300, () => this.showPrompts());

    const kb = this.input.keyboard;
    kb?.on('keydown-R', () => this.go(SCENES.GAME, false));
    kb?.on('keydown-SPACE', () => this.go(SCENES.GAME, false));
    kb?.on('keydown-ENTER', () => this.go(SCENES.GAME, false));
    kb?.on('keydown-M', () => this.go(SCENES.MENU, true));
    kb?.on('keydown-L', () => this.go(SCENES.LEADERBOARD, false));
  }

  update(_time: number, delta: number): void {
    this.backdrop.drift(delta);
  }

  // ---------------------------------------------------------------------

  private behaviourRows(): BehaviourRow[] {
    const r = this.result;
    const level = (r.repetition ?? r.predictability ?? 'LOW').toUpperCase();
    let repetition = r.predictabilityScore ?? (level === 'HIGH' ? 0.85 : level === 'MEDIUM' ? 0.55 : 0.25);
    if (level === 'HIGH') repetition = Math.max(repetition, 0.8);

    return [
      { label: 'JUMPING', value: r.jumpRate ?? 0, color: 0x4cf0ff },
      { label: 'RIGHT MOVEMENT', value: r.rightMovementRatio ?? 0, color: 0x7cffb2 },
      { label: 'RISK TAKING', value: r.riskTaking ?? 0, color: 0xffc857 },
      { label: 'REPETITION', value: repetition, note: level, color: 0xff3d6e },
    ];
  }

  private buildVignette(): void {
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x05060b, 0.55);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    // darker edges
    g.fillStyle(0x000000, 0.3);
    g.fillRect(0, 0, WIDTH, 22);
    g.fillRect(0, HEIGHT - 22, WIDTH, 22);

    // subtle scanlines
    const lines = this.add.graphics().setDepth(50).setAlpha(0.5);
    lines.fillStyle(0x000000, 0.12);
    for (let y = 0; y < HEIGHT; y += 4) lines.fillRect(0, y, WIDTH, 1);
  }

  private buildTitle(): void {
    // Type the title out, with a faint red ghost for a glitchy feel.
    if (this.result.username) {
      this.add
        .text(WIDTH / 2, 28, this.result.username.toUpperCase(), {
          fontFamily: FONT,
          fontSize: '14px',
          color: COLORS.UI_DIM,
        })
        .setOrigin(0.5)
        .setDepth(10);
    }

    const full = 'THE GAME HAS LEARNED YOU.';
    const title = this.add
      .text(WIDTH / 2, 56, '', {
        fontFamily: FONT,
        fontSize: '38px',
        fontStyle: 'bold',
        color: COLORS.UI_ACCENT,
      })
      .setOrigin(0.5)
      .setDepth(10);
    title.setShadow(0, 0, COLORS.UI_ACCENT, 22, false, true);

    // Type the title out, with a faint red ghost for a glitchy feel.
    const ghost = this.add
      .text(WIDTH / 2 + 2, 56, '', {
        fontFamily: FONT,
        fontSize: '38px',
        fontStyle: 'bold',
        color: COLORS.UI_WARN,
      })
      .setOrigin(0.5)
      .setDepth(9)
      .setAlpha(0.35);

    let n = 0;
    this.time.addEvent({
      delay: 45,
      repeat: full.length - 1,
      callback: () => {
        n += 1;
        title.setText(full.slice(0, n));
        ghost.setText(full.slice(0, n));
      },
    });
    this.time.delayedCall(full.length * 45 + 150, () => {
      this.tweens.add({
        targets: ghost,
        x: { from: WIDTH / 2 + 3, to: WIDTH / 2 - 3 },
        alpha: { from: 0.4, to: 0.1 },
        duration: 130,
        yoyo: true,
        repeat: 3,
        onComplete: () => ghost.setAlpha(0),
      });
    });

    const sub = this.result.completed
      ? `SIGNAL REACHED  ·  ${ScoreManager.formatTime(this.result.timeMs)}  ·  SCORE ${ScoreManager.formatScore(this.result.score)}`
      : `${(this.result.cause || 'TERMINATED').toUpperCase()}  ·  IT WAS ALREADY WAITING`;
    const subText = this.add
      .text(WIDTH / 2, 94, sub, {
        fontFamily: FONT,
        fontSize: '12px',
        color: COLORS.UI_DIM,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setAlpha(0);
    this.tweens.add({ targets: subText, alpha: 1, delay: 1300, duration: 500 });

    const heading = this.add
      .text(90, 122, 'WHAT IT OBSERVED', {
        fontFamily: FONT,
        fontSize: '11px',
        color: COLORS.UI_DIM,
      })
      .setDepth(10)
      .setAlpha(0);
    this.tweens.add({ targets: heading, alpha: 1, delay: 600, duration: 400 });
  }

  private buildBar(row: BehaviourRow, x: number, y: number, delay: number): void {
    const value = Phaser.Math.Clamp(row.value, 0, 1);
    const target = Math.round(value * 100);

    const label = this.add
      .text(x, y, row.label, { fontFamily: FONT, fontSize: '14px', color: COLORS.UI_TEXT })
      .setDepth(10)
      .setAlpha(0);

    const pct = this.add
      .text(x + BAR_W, y, '0%', { fontFamily: FONT, fontSize: '14px', color: Phaser.Display.Color.IntegerToColor(row.color).rgba })
      .setOrigin(1, 0)
      .setDepth(10)
      .setAlpha(0);

    const track = this.add.graphics().setDepth(10).setAlpha(0);
    track.fillStyle(0x1c2140, 1);
    track.fillRoundedRect(x, y + 24, BAR_W, BAR_H, 4);

    const fill = this.add.graphics().setDepth(11);
    const glow = this.add.graphics().setDepth(10).setAlpha(0.35);

    this.tweens.add({ targets: [label, pct, track], alpha: 1, delay, duration: 250 });

    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: value,
      delay: delay + 150,
      duration: 900,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const w = Math.max(0, BAR_W * counter.v);
        fill.clear();
        fill.fillStyle(row.color, 1);
        if (w > 1) fill.fillRoundedRect(x, y + 24, w, BAR_H, 4);
        glow.clear();
        glow.fillStyle(row.color, 1);
        if (w > 1) glow.fillRoundedRect(x - 2, y + 22, w + 4, BAR_H + 4, 5);
        pct.setText(`${Math.round(counter.v * 100)}%${row.note && counter.v >= value ? `  ${row.note}` : ''}`);
      },
      onComplete: () => {
        pct.setText(`${target}%${row.note ? `  ${row.note}` : ''}`);
      },
    });
  }

  private buildAccuracy(accuracy: number, delay: number): void {
    const cx = 750;
    const panel = this.add.graphics().setDepth(5).setAlpha(0);
    panel.fillStyle(0x05060b, 0.6);
    panel.fillRoundedRect(cx - 160, 130, 320, 220, 10);
    panel.lineStyle(1, 0xff3d6e, 0.45);
    panel.strokeRoundedRect(cx - 160, 130, 320, 220, 10);

    const label = this.add
      .text(cx, 154, 'AI PREDICTION ACCURACY', {
        fontFamily: FONT,
        fontSize: '14px',
        color: COLORS.UI_DIM,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setAlpha(0);

    const big = this.add
      .text(cx, 236, '0%', {
        fontFamily: FONT,
        fontSize: '96px',
        fontStyle: 'bold',
        color: COLORS.UI_WARN,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setAlpha(0);
    big.setShadow(0, 0, COLORS.UI_WARN, 26, false, true);

    const foot = this.add
      .text(
        cx,
        316,
        `${this.result.adaptationCount ?? 0} ADAPTATIONS  ·  AWARENESS ${Math.round((this.result.awareness ?? 0) * 100)}%`,
        { fontFamily: FONT, fontSize: '11px', color: COLORS.UI_DIM },
      )
      .setOrigin(0.5)
      .setDepth(10)
      .setAlpha(0);

    this.tweens.add({ targets: [panel, label, big, foot], alpha: 1, delay, duration: 400 });

    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: accuracy,
      delay: delay + 300,
      duration: 1300,
      ease: 'Cubic.easeOut',
      onUpdate: () => big.setText(`${Math.round(counter.v * 100)}%`),
      onComplete: () => {
        big.setText(`${Math.round(accuracy * 100)}%`);
        this.cameras.main.shake(140, 0.004);
        this.tweens.add({
          targets: big,
          scale: { from: 1.12, to: 1 },
          duration: 260,
          ease: 'Back.easeOut',
        });
      },
    });
  }

  private buildQuote(delay: number): void {
    const quote = this.add
      .text(WIDTH / 2, 410, '“I knew what you were going to do.”', {
        fontFamily: FONT,
        fontSize: '26px',
        fontStyle: 'italic',
        color: COLORS.UI_TEXT,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setAlpha(0);
    quote.setShadow(0, 0, COLORS.UI_WARN, 14, false, true);

    this.tweens.add({ targets: quote, alpha: 1, delay, duration: 900, ease: 'Sine.easeIn' });
  }

  private showPrompts(): void {
    if (this.promptsShown) return;
    this.promptsShown = true;
    this.readyAt = this.time.now + INPUT_DELAY_MS;

    const retry = this.add
      .text(WIDTH / 2, 466, 'PRESS R OR SPACE TO RETRY  ·  IT REMEMBERS', {
        fontFamily: FONT,
        fontSize: '18px',
        color: COLORS.UI_ACCENT,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setAlpha(0);
    this.tweens.add({ targets: retry, alpha: 1, duration: 400 });
    this.tweens.add({
      targets: retry,
      alpha: { from: 1, to: 0.3 },
      delay: 400,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const menu = this.add
      .text(WIDTH / 2, 498, 'M  menu (resets AI)   ·   L  leaderboard', {
        fontFamily: FONT,
        fontSize: '13px',
        color: COLORS.UI_DIM,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setAlpha(0);
    this.tweens.add({ targets: menu, alpha: 1, duration: 400, delay: 150 });
  }

  private go(scene: string, resetMemory: boolean): void {
    if (this.leaving || this.time.now < this.readyAt) return;
    this.leaving = true;
    this.cameras.main.fadeOut(250, 5, 6, 11, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress === 1) {
        if (resetMemory) resetAIDirector(this.game);
        this.scene.start(scene);
      }
    });
  }
}
