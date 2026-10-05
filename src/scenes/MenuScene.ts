import Phaser from 'phaser';
import { GAME_CONFIG, SCENES } from '../config/gameConfig';
import { Backdrop } from '../ui/Backdrop';
import { resetAIDirector } from '../ai/session';
import {
  getSavedUsername,
  isValidUsername,
  saveUsername,
  sanitizeUsername,
  USERNAME_RULES,
} from '../player/identity';
import { SoundFX } from '../utils/SoundFX';

const { COLORS, FONT, WIDTH, HEIGHT } = GAME_CONFIG;

export class MenuScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private eye!: Phaser.GameObjects.Graphics;
  private starting = false;
  private inputReady = false;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private tabKey!: Phaser.Input.Keyboard.Key;
  private muteKey!: Phaser.Input.Keyboard.Key;

  private username = '';
  private nameText!: Phaser.GameObjects.Text;
  private cursorText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private caretOn = true;

  constructor() {
    super(SCENES.MENU);
  }

  create(): void {
    this.starting = false;
    this.inputReady = false;
    this.username = getSavedUsername();
    this.backdrop = new Backdrop(this);

    // Fresh session from the menu — restart menu BGM if returning here.
    void SoundFX.unlock().then(() => SoundFX.startBgm('menu'));

    this.game.canvas.setAttribute('tabindex', '0');
    this.game.canvas.focus();

    this.eye = this.add.graphics().setDepth(5);
    this.eye.setPosition(WIDTH / 2, 100);

    const title = this.add
      .text(WIDTH / 2, 175, 'THE GAME IS WATCHING', {
        fontFamily: FONT,
        fontSize: '46px',
        fontStyle: 'bold',
        color: COLORS.UI_TEXT,
      })
      .setOrigin(0.5)
      .setDepth(5);
    title.setShadow(0, 0, COLORS.UI_ACCENT, 18, false, true);

    this.add
      .text(WIDTH / 2, 222, 'every jump is noticed. every mistake is remembered.', {
        fontFamily: FONT,
        fontSize: '14px',
        color: COLORS.UI_DIM,
      })
      .setOrigin(0.5)
      .setDepth(5);

    // Username panel
    const panel = this.add.graphics().setDepth(5);
    panel.fillStyle(0x05060b, 0.7);
    panel.fillRoundedRect(WIDTH / 2 - 200, 260, 400, 88, 8);
    panel.lineStyle(1, 0x4cf0ff, 0.35);
    panel.strokeRoundedRect(WIDTH / 2 - 200, 260, 400, 88, 8);

    this.add
      .text(WIDTH / 2, 274, 'ENTER CALLSIGN', {
        fontFamily: FONT,
        fontSize: '12px',
        color: COLORS.UI_DIM,
      })
      .setOrigin(0.5)
      .setDepth(6);

    this.nameText = this.add
      .text(WIDTH / 2, 304, this.displayName(), {
        fontFamily: FONT,
        fontSize: '28px',
        color: COLORS.UI_ACCENT,
      })
      .setOrigin(0.5)
      .setDepth(6);

    this.cursorText = this.add
      .text(WIDTH / 2, 304, '', {
        fontFamily: FONT,
        fontSize: '28px',
        color: COLORS.UI_ACCENT,
      })
      .setOrigin(0, 0.5)
      .setDepth(6);

    this.hintText = this.add
      .text(WIDTH / 2, 336, `2–${USERNAME_RULES.MAX_LEN} letters, numbers, _ or -`, {
        fontFamily: FONT,
        fontSize: '11px',
        color: COLORS.UI_DIM,
      })
      .setOrigin(0.5)
      .setDepth(6);

    this.promptText = this.add
      .text(WIDTH / 2, 380, '', {
        fontFamily: FONT,
        fontSize: '18px',
        color: COLORS.UI_ACCENT,
      })
      .setOrigin(0.5)
      .setDepth(5);

    this.tweens.add({
      targets: this.promptText,
      alpha: { from: 1, to: 0.3 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.time.addEvent({
      delay: 450,
      loop: true,
      callback: () => {
        this.caretOn = !this.caretOn;
        this.refreshNameDisplay();
      },
    });

    this.add
      .text(WIDTH / 2, HEIGHT - 58, 'TYPE NAME   ·   ENTER start   ·   TAB board   ·   F8 mute', {
        fontFamily: FONT,
        fontSize: '13px',
        color: COLORS.UI_DIM,
      })
      .setOrigin(0.5)
      .setDepth(5);

    // Clickable shortcuts — letters stay free for the callsign.
    this.makeLinkButton(WIDTH / 2 - 90, HEIGHT - 88, 'LEADERBOARD', () => this.openLeaderboard());
    this.makeLinkButton(WIDTH / 2 + 100, HEIGHT - 88, 'MUTE', () => {
      SoundFX.toggleMute();
      SoundFX.ui();
    });

    if (GAME_CONFIG.DEMO_MODE) {
      this.add
        .text(WIDTH / 2, HEIGHT - 34, 'DEMO MODE · AI learns faster', {
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
    this.tabKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.muteKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F8);

    kb.on('keydown', (event: KeyboardEvent) => this.onKey(event));

    // Unlock audio on first gesture, then start menu BGM.
    const unlockAudio = () => {
      void SoundFX.unlock().then(() => SoundFX.startBgm('menu'));
    };
    this.input.once('pointerdown', unlockAudio);
    kb.once('keydown', unlockAudio);

    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
      this.inputReady = true;
      this.refreshPrompt();
    });
    this.cameras.main.fadeIn(400, 5, 6, 11);
    this.refreshNameDisplay();
    this.refreshPrompt();
  }

  update(time: number, delta: number): void {
    this.backdrop.drift(delta);
    this.drawEye(time);

    if (!this.inputReady || this.starting) return;

    if (Phaser.Input.Keyboard.JustDown(this.muteKey)) {
      SoundFX.toggleMute();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.tabKey)) {
      this.openLeaderboard();
      return;
    }

    if (
      Phaser.Input.Keyboard.JustDown(this.enterKey) ||
      Phaser.Input.Keyboard.JustDown(this.spaceKey)
    ) {
      this.start();
    }
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.inputReady || this.starting) return;

    // Don't steal Tab from the browser/Phaser shortcut handler above.
    if (event.key === 'Tab') {
      event.preventDefault();
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      this.username = this.username.slice(0, -1);
      SoundFX.type();
      this.refreshNameDisplay();
      this.refreshPrompt();
      return;
    }

    // Every valid name character types in — including L, N, etc.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === ' ') return;

      const next = sanitizeUsername(this.username + event.key);
      if (next.length <= USERNAME_RULES.MAX_LEN && /^[A-Za-z0-9_\-]*$/.test(next)) {
        this.username = next;
        SoundFX.type();
        this.refreshNameDisplay();
        this.refreshPrompt();
      }
    }
  }

  private makeLinkButton(x: number, y: number, label: string, onClick: () => void): void {
    const t = this.add
      .text(x, y, label, {
        fontFamily: FONT,
        fontSize: '13px',
        color: COLORS.UI_ACCENT,
      })
      .setOrigin(0.5)
      .setDepth(8)
      .setInteractive({ useHandCursor: true });
    t.on('pointerover', () => t.setColor(COLORS.UI_TEXT));
    t.on('pointerout', () => t.setColor(COLORS.UI_ACCENT));
    t.on('pointerdown', () => {
      if (!this.inputReady || this.starting) return;
      onClick();
    });
  }

  private displayName(): string {
    return this.username.length > 0 ? this.username.toUpperCase() : '___________';
  }

  private refreshNameDisplay(): void {
    const shown = this.displayName();
    this.nameText.setText(shown);
    this.nameText.setColor(isValidUsername(this.username) ? COLORS.UI_ACCENT : COLORS.UI_DIM);

    // caret after typed characters
    const label = this.username.length > 0 ? this.username.toUpperCase() : '';
    const metrics = this.nameText.context.measureText(label || ' ');
    const caretX = WIDTH / 2 - this.nameText.width / 2 + (label ? metrics.width : 0) + 2;
    this.cursorText.setPosition(this.username.length === 0 ? WIDTH / 2 - 90 : caretX, 304);
    this.cursorText.setText(this.caretOn ? '▌' : '');
    this.cursorText.setVisible(this.username.length < USERNAME_RULES.MAX_LEN);
  }

  private refreshPrompt(): void {
    if (isValidUsername(this.username)) {
      this.promptText.setText('PRESS ENTER TO BEGIN');
      this.hintText.setText('TAB leaderboard  ·  F8 mute');
    } else {
      this.promptText.setText('TYPE YOUR CALLSIGN TO CONTINUE');
      this.hintText.setText(`2–${USERNAME_RULES.MAX_LEN} letters, numbers, _ or -  (L/N OK)`);
    }
  }

  private start(): void {
    if (this.starting || !this.inputReady) return;
    if (!isValidUsername(this.username)) return;

    this.starting = true;
    saveUsername(this.username);
    this.registry.set('username', sanitizeUsername(this.username));
    resetAIDirector(this.game);
    void SoundFX.unlock();
    SoundFX.start();

    this.cameras.main.fadeOut(250, 5, 6, 11, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress === 1) this.scene.start(SCENES.GAME);
    });
  }

  private openLeaderboard(): void {
    if (this.starting) return;
    SoundFX.ui();
    this.cameras.main.fadeOut(200, 5, 6, 11, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress === 1) this.scene.start(SCENES.LEADERBOARD);
    });
  }

  private drawEye(time: number): void {
    const g = this.eye;
    const pointer = this.input.activePointer;
    const idleX = Math.sin(time / 1400) * 14;
    const idleY = Math.cos(time / 1900) * 4;
    const dx = pointer.x ? Phaser.Math.Clamp((pointer.x - WIDTH / 2) / 30, -16, 16) : idleX;
    const dy = pointer.y ? Phaser.Math.Clamp((pointer.y - 100) / 40, -5, 5) : idleY;
    const blink = time % 4200 < 140 ? 0.08 : 1;

    g.clear();
    g.fillStyle(0x4cf0ff, 0.06);
    g.fillEllipse(0, 0, 150, 70 * blink);
    g.fillStyle(0x4cf0ff, 0.1);
    g.fillEllipse(0, 0, 110, 50 * blink);
    g.fillStyle(0xe8f1ff, 1);
    g.fillEllipse(0, 0, 84, 40 * blink);
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
