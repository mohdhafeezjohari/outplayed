import Phaser from 'phaser';
import { GAME_CONFIG, SCENES } from '../config/gameConfig';
import { Backdrop } from '../ui/Backdrop';
import { resetAIDirector } from '../ai/session';

const { COLORS, FONT, WIDTH, HEIGHT } = GAME_CONFIG;

export class MenuScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private eye!: Phaser.GameObjects.Graphics;
  private starting = false;
  /** Ignore start input until the intro fade finishes (avoids fadeOut no-op). */
  private inputReady = false;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super(SCENES.MENU);
  }

  create(): void {
    this.starting = false;
    this.inputReady = false;
    this.backdrop = new Backdrop(this);

    // Focus the canvas so Space/Enter reach Phaser without an extra click.
    this.game.canvas.setAttribute('tabindex', '0');
    this.game.canvas.focus();

    // The watcher: an eye that tracks the pointer (and idles when it doesn't move).
    this.eye = this.add.graphics().setDepth(5);
    this.eye.setPosition(WIDTH / 2, 118);

    const title = this.add
      .text(WIDTH / 2, 205, 'THE GAME IS WATCHING', {
        fontFamily: FONT,
        fontSize: '50px',
        fontStyle: 'bold',
        color: COLORS.UI_TEXT,
      })
      .setOrigin(0.5)
      .setDepth(5);
    title.setShadow(0, 0, COLORS.UI_ACCENT, 18, false, true);

    this.add
      .text(WIDTH / 2, 258, 'every jump is noticed. every mistake is remembered.', {
        fontFamily: FONT,
        fontSize: '15px',
        color: COLORS.UI_DIM,
      })
      .setOrigin(0.5)
      .setDepth(5);

    const prompt = this.add
      .text(WIDTH / 2, 360, 'PRESS SPACE OR ENTER TO BEGIN', {
        fontFamily: FONT,
        fontSize: '20px',
        color: COLORS.UI_ACCENT,
      })
      .setOrigin(0.5)
      .setDepth(5);
    this.tweens.add({
      targets: prompt,
      alpha: { from: 1, to: 0.25 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(
        WIDTH / 2,
        HEIGHT - 60,
        'A/D or ←/→  move     SPACE / W / ↑  jump     P  pause     F1  AI debug',
        { fontFamily: FONT, fontSize: '13px', color: COLORS.UI_DIM },
      )
      .setOrigin(0.5)
      .setDepth(5);

    if (GAME_CONFIG.DEMO_MODE) {
      this.add
        .text(WIDTH / 2, HEIGHT - 36, 'DEMO MODE · AI learns faster', {
          fontFamily: FONT,
          fontSize: '12px',
          color: COLORS.UI_ACCENT,
        })
        .setOrigin(0.5)
        .setDepth(5)
        .setAlpha(0.85);
    }

    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input is unavailable');
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.enterKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    this.input.on('pointerdown', () => {
      this.game.canvas.focus();
      this.start();
    });

    // Fade in first; only then accept start input. Pressing Space during fadeIn
    // used to call fadeOut while a fade was already running (ignored by Phaser),
    // leaving `starting === true` and locking the menu forever.
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
      this.inputReady = true;
    });
    this.cameras.main.fadeIn(400, 5, 6, 11);
  }

  update(time: number, delta: number): void {
    this.backdrop.drift(delta);
    this.drawEye(time);

    if (!this.inputReady || this.starting) return;
    if (
      Phaser.Input.Keyboard.JustDown(this.spaceKey) ||
      Phaser.Input.Keyboard.JustDown(this.enterKey)
    ) {
      this.start();
    }
  }

  private start(): void {
    if (this.starting || !this.inputReady) return;
    this.starting = true;

    // Fresh session from the menu clears prior observation memory.
    resetAIDirector(this.game);

    this.cameras.main.fadeOut(250, 5, 6, 11, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress === 1) {
        this.scene.start(SCENES.GAME);
      }
    });
  }

  private drawEye(time: number): void {
    const g = this.eye;
    const pointer = this.input.activePointer;
    // Look direction: pointer if it exists, otherwise a slow idle sweep.
    const idleX = Math.sin(time / 1400) * 14;
    const idleY = Math.cos(time / 1900) * 4;
    const dx = pointer.x ? Phaser.Math.Clamp((pointer.x - WIDTH / 2) / 30, -16, 16) : idleX;
    const dy = pointer.y ? Phaser.Math.Clamp((pointer.y - 118) / 40, -5, 5) : idleY;
    // Quick blink every ~4 seconds.
    const blink = time % 4200 < 140 ? 0.08 : 1;

    g.clear();
    // outer glow
    g.fillStyle(0x4cf0ff, 0.06);
    g.fillEllipse(0, 0, 150, 70 * blink);
    g.fillStyle(0x4cf0ff, 0.1);
    g.fillEllipse(0, 0, 110, 50 * blink);
    // sclera
    g.fillStyle(0xe8f1ff, 1);
    g.fillEllipse(0, 0, 84, 40 * blink);
    // iris + pupil
    if (blink > 0.5) {
      g.fillStyle(0x4cf0ff, 1);
      g.fillCircle(dx, dy, 14);
      g.fillStyle(0x070914, 1);
      g.fillCircle(dx, dy, 7);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(dx - 3, dy - 4, 2.2);
    }
  }
}
