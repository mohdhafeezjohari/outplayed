import Phaser from 'phaser';
import { GAME_CONFIG, SCENES } from '../config/gameConfig';
import { Backdrop } from '../ui/Backdrop';
import { LeaderboardService, type LeaderboardEntry } from '../systems/LeaderboardService';
import { ScoreManager } from '../systems/ScoreManager';
import { SoundFX } from '../utils/SoundFX';

const { COLORS, FONT, WIDTH, HEIGHT } = GAME_CONFIG;
const INPUT_DELAY_MS = 300;

/**
 * Top scores board. L from menu, or after a run.
 */
export class LeaderboardScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private leaving = false;
  private readyAt = 0;

  constructor() {
    super(SCENES.LEADERBOARD);
  }

  create(): void {
    this.leaving = false;
    this.readyAt = this.time.now + INPUT_DELAY_MS;
    this.backdrop = new Backdrop(this);
    this.cameras.main.fadeIn(280, 5, 6, 11);
    SoundFX.startBgm('menu');

    this.add
      .text(WIDTH / 2, 56, 'LEADERBOARD', {
        fontFamily: FONT,
        fontSize: '42px',
        fontStyle: 'bold',
        color: COLORS.UI_TEXT,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, COLORS.UI_ACCENT, 14, false, true);

    const status = this.add
      .text(WIDTH / 2, 100, 'LOADING…', {
        fontFamily: FONT,
        fontSize: '13px',
        color: COLORS.UI_DIM,
      })
      .setOrigin(0.5);

    const panel = this.add.graphics();
    panel.fillStyle(0x05060b, 0.65);
    panel.fillRoundedRect(WIDTH / 2 - 320, 120, 640, 320, 10);

    // header row
    this.add.text(WIDTH / 2 - 290, 136, '#', { fontFamily: FONT, fontSize: '13px', color: COLORS.UI_DIM });
    this.add.text(WIDTH / 2 - 250, 136, 'PLAYER', { fontFamily: FONT, fontSize: '13px', color: COLORS.UI_DIM });
    this.add.text(WIDTH / 2 + 40, 136, 'SCORE', { fontFamily: FONT, fontSize: '13px', color: COLORS.UI_DIM });
    this.add.text(WIDTH / 2 + 160, 136, 'TIME', { fontFamily: FONT, fontSize: '13px', color: COLORS.UI_DIM });
    this.add.text(WIDTH / 2 + 250, 136, 'CLEAR', { fontFamily: FONT, fontSize: '13px', color: COLORS.UI_DIM });

    void this.loadBoard(status);

    this.add
      .text(WIDTH / 2, HEIGHT - 48, 'ESC / M  BACK TO MENU', {
        fontFamily: FONT,
        fontSize: '14px',
        color: COLORS.UI_ACCENT,
      })
      .setOrigin(0.5);

    const kb = this.input.keyboard;
    kb?.on('keydown-ESC', () => this.goMenu());
    kb?.on('keydown-M', () => this.goMenu());
  }

  update(_t: number, delta: number): void {
    this.backdrop.drift(delta);
  }

  private async loadBoard(status: Phaser.GameObjects.Text): Promise<void> {
    const { entries, source, serverOnline } = await LeaderboardService.fetchTop(10);
    if (source === 'global') {
      status.setText('GLOBAL  ·  BEST SCORE PER PLAYER');
    } else if (serverOnline === false) {
      status.setText('THIS DEVICE  ·  API unreachable (check deploy / play on Vercel URL)');
    } else {
      status.setText('THIS DEVICE  ·  link KV to this project, then redeploy Production');
    }

    if (entries.length === 0) {
      this.add
        .text(WIDTH / 2, 280, 'NO SCORES YET — BE THE FIRST.', {
          fontFamily: FONT,
          fontSize: '16px',
          color: COLORS.UI_DIM,
        })
        .setOrigin(0.5);
      return;
    }

    entries.forEach((e, i) => this.drawRow(i, e));
  }

  private drawRow(index: number, e: LeaderboardEntry): void {
    const y = 168 + index * 26;
    const rankColor = index === 0 ? '#ffd23f' : index < 3 ? COLORS.UI_ACCENT : COLORS.UI_TEXT;
    this.add.text(WIDTH / 2 - 290, y, String(index + 1).padStart(2, '0'), {
      fontFamily: FONT,
      fontSize: '15px',
      color: rankColor,
    });
    this.add.text(WIDTH / 2 - 250, y, e.username.toUpperCase(), {
      fontFamily: FONT,
      fontSize: '15px',
      color: COLORS.UI_TEXT,
    });
    this.add.text(WIDTH / 2 + 40, y, ScoreManager.formatScore(e.score), {
      fontFamily: FONT,
      fontSize: '15px',
      color: COLORS.UI_TEXT,
    });
    this.add.text(WIDTH / 2 + 160, y, ScoreManager.formatTime(e.timeMs), {
      fontFamily: FONT,
      fontSize: '15px',
      color: COLORS.UI_DIM,
    });
    this.add.text(WIDTH / 2 + 250, y, e.completed ? 'YES' : '—', {
      fontFamily: FONT,
      fontSize: '15px',
      color: e.completed ? '#7cffb2' : COLORS.UI_DIM,
    });
  }

  private goMenu(): void {
    if (this.leaving || this.time.now < this.readyAt) return;
    this.leaving = true;
    SoundFX.ui();
    this.cameras.main.fadeOut(200, 5, 6, 11, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress === 1) this.scene.start(SCENES.MENU);
    });
  }
}
