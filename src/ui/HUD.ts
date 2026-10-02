import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { ScoreManager } from '../systems/ScoreManager';

const { COLORS, FONT } = GAME_CONFIG;
const DEPTH = 100;
const MARGIN = 16;

/**
 * Heads-up display pinned to the camera.
 *  - top-left : SCORE / TIME
 *  - top-right: AI AWARENESS (placeholder) + subtle AI state
 */
export class HUD {
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly timeText: Phaser.GameObjects.Text;
  private readonly awarenessValue: Phaser.GameObjects.Text;
  private readonly awarenessFill: Phaser.GameObjects.Rectangle;
  private readonly stateText: Phaser.GameObjects.Text;
  private readonly stateDot: Phaser.GameObjects.Arc;
  private readonly pauseGroup: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[] = [];

  private lastScore = -1;
  private lastTime = '';
  private levelDriven = false;

  private static readonly BAR_WIDTH = 150;

  constructor(private readonly scene: Phaser.Scene) {
    const { WIDTH, HEIGHT } = GAME_CONFIG;

    // ---- left panel ---------------------------------------------------
    const leftPanel = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH - 1);
    leftPanel.fillStyle(0x05060b, 0.55);
    leftPanel.fillRoundedRect(MARGIN, MARGIN, 190, 62, 6);
    leftPanel.fillStyle(0x4cf0ff, 1);
    leftPanel.fillRect(MARGIN, MARGIN + 6, 3, 50);

    this.label(MARGIN + 14, MARGIN + 8, 'SCORE');
    this.scoreText = this.value(MARGIN + 82, MARGIN + 5, '00000');
    this.label(MARGIN + 14, MARGIN + 36, 'TIME');
    this.timeText = this.value(MARGIN + 82, MARGIN + 33, '00:00.0');

    // ---- right panel --------------------------------------------------
    const panelW = 206;
    const px = WIDTH - MARGIN - panelW;
    const rightPanel = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH - 1);
    rightPanel.fillStyle(0x05060b, 0.55);
    rightPanel.fillRoundedRect(px, MARGIN, panelW, 62, 6);
    rightPanel.fillStyle(0x6f7ba6, 1);
    rightPanel.fillRect(px + panelW - 3, MARGIN + 6, 3, 50);

    this.label(px + 14, MARGIN + 8, 'AI AWARENESS');
    this.awarenessValue = scene.add
      .text(px + panelW - 16, MARGIN + 6, '—', {
        fontFamily: FONT,
        fontSize: '15px',
        color: COLORS.UI_DIM,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH);

    const barX = px + 14;
    const barY = MARGIN + 30;
    scene.add
      .rectangle(barX, barY, HUD.BAR_WIDTH + 28, 5, 0x1c2140)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH);
    this.awarenessFill = scene.add
      .rectangle(barX, barY, 0, 5, 0x4cf0ff)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1);

    this.stateDot = scene.add
      .circle(px + 18, MARGIN + 48, 3, 0x4cf0ff, 0.9)
      .setScrollFactor(0)
      .setDepth(DEPTH);
    this.stateText = scene.add
      .text(px + 28, MARGIN + 41, 'AI LEVEL: 0 — OBSERVING', {
        fontFamily: FONT,
        fontSize: '11px',
        color: COLORS.UI_DIM,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH);

    // subtle "watching" pulse
    scene.tweens.add({
      targets: [this.stateDot, this.stateText],
      alpha: { from: 1, to: 0.35 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ---- controls hint (fades out) -------------------------------------
    const hint = scene.add
      .text(
        WIDTH / 2,
        HEIGHT - 22,
        'A/D or ←/→ move   ·   SPACE / W / ↑ jump   ·   P pause   ·   F1 AI debug',
        {
          fontFamily: FONT,
          fontSize: '12px',
          color: COLORS.UI_DIM,
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH);
    scene.tweens.add({ targets: hint, alpha: 0, delay: 5000, duration: 1500 });

    // ---- pause overlay -----------------------------------------------
    const veil = scene.add
      .rectangle(0, 0, WIDTH, HEIGHT, 0x05060b, 0.7)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH + 10)
      .setVisible(false);
    const pauseTitle = scene.add
      .text(WIDTH / 2, HEIGHT / 2 - 12, 'PAUSED', {
        fontFamily: FONT,
        fontSize: '40px',
        color: COLORS.UI_TEXT,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 11)
      .setVisible(false);
    const pauseSub = scene.add
      .text(WIDTH / 2, HEIGHT / 2 + 28, 'press P to resume', {
        fontFamily: FONT,
        fontSize: '14px',
        color: COLORS.UI_DIM,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 11)
      .setVisible(false);
    this.pauseGroup.push(veil, pauseTitle, pauseSub);
  }

  /** Called every frame; only touches text when the value actually changes. */
  update(score: ScoreManager): void {
    if (score.score !== this.lastScore) {
      this.lastScore = score.score;
      this.scoreText.setText(ScoreManager.formatScore(score.score));
    }
    const time = ScoreManager.formatTime(score.timeMs);
    if (time !== this.lastTime) {
      this.lastTime = time;
      this.timeText.setText(time);
    }
  }

  /** `null` renders as "—" (Stage 1 placeholder). Otherwise 0..1. */
  setAwareness(value: number | null): void {
    if (value === null) {
      this.awarenessValue.setText('—').setColor(COLORS.UI_DIM);
      this.awarenessFill.width = 0;
      return;
    }
    const v = Phaser.Math.Clamp(value, 0, 1);
    this.awarenessValue.setText(`${Math.round(v * 100)}%`).setColor(COLORS.UI_ACCENT);
    this.awarenessFill.width = (HUD.BAR_WIDTH + 28) * v;
  }

  /**
   * Subtle "AI LEVEL: N — LABEL" readout (levels from awarenessLevel()).
   * Warms up from level 2 (ADAPTING) onward.
   */
  setAwarenessLevel(level: number, label: string): void {
    this.stateText.setText(`AI LEVEL: ${level} — ${label.toUpperCase()}`);
    this.applyHeat(level >= 2);
  }

  /** Raw Director state. Only restyles when the level readout is not in use. */
  setAIState(state: string): void {
    if (this.levelDriven) return;
    this.stateText.setText(`AI STATE: ${state.toUpperCase()}`);
    this.applyHeat(
      state.includes('COUNTER') || state.includes('PREDICT') || state.includes('ADAPT'),
    );
  }

  private applyHeat(hot: boolean): void {
    this.levelDriven = true;
    this.stateDot.setFillStyle(hot ? GAME_CONFIG.COLORS.HAZARD : 0x4cf0ff, 0.9);
    this.stateText.setColor(hot ? COLORS.UI_WARN : COLORS.UI_DIM);
  }

  /**
   * Brief centre banner when the Director fires an adaptation.
   * Does not linger — players should feel it, not read a novel.
   */
  showAdaptation(banner: string, detail: string): void {
    const { WIDTH, HEIGHT } = GAME_CONFIG;
    const title = this.scene.add
      .text(WIDTH / 2, HEIGHT * 0.28, banner, {
        fontFamily: FONT,
        fontSize: '18px',
        color: COLORS.UI_WARN,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 20)
      .setAlpha(0);
    const sub = this.scene.add
      .text(WIDTH / 2, HEIGHT * 0.28 + 26, detail, {
        fontFamily: FONT,
        fontSize: '22px',
        color: COLORS.UI_TEXT,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 20)
      .setAlpha(0);

    this.scene.tweens.add({
      targets: [title, sub],
      alpha: 1,
      duration: 180,
      onComplete: () => {
        this.scene.tweens.add({
          targets: [title, sub],
          alpha: 0,
          delay: 1100,
          duration: 280,
          onComplete: () => {
            title.destroy();
            sub.destroy();
          },
        });
      },
    });
  }

  setPaused(paused: boolean): void {
    this.pauseGroup.forEach((o) => o.setVisible(paused));
  }

  /** Floating "+100" style popup in world space. */
  popup(x: number, y: number, text: string, color: string = COLORS.UI_ACCENT): void {
    const t = this.scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: '16px', color })
      .setOrigin(0.5)
      .setDepth(DEPTH - 5);
    this.scene.tweens.add({
      targets: t,
      y: y - 36,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private label(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: '11px', color: COLORS.UI_DIM })
      .setScrollFactor(0)
      .setDepth(DEPTH);
  }

  private value(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: '20px', color: COLORS.UI_TEXT })
      .setScrollFactor(0)
      .setDepth(DEPTH);
  }
}
