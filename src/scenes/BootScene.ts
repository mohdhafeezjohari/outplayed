import Phaser from 'phaser';
import { GAME_CONFIG, SCENES, TEXTURES } from '../config/gameConfig';

const C = GAME_CONFIG.COLORS;

/**
 * Generates every texture procedurally so the game ships with zero assets,
 * then hands off to the menu.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.BOOT);
  }

  create(): void {
    this.makePlayer();
    this.makePlatform();
    this.makeGround();
    this.makeSpike();
    this.makeShard();
    this.makeGoal();
    this.makeEnemy();
    this.makeParticle();
    this.makeBackdrop();

    this.scene.start(SCENES.MENU);
  }

  /** Runs a draw callback on a throwaway Graphics and bakes it into a texture. */
  private bake(
    key: string,
    width: number,
    height: number,
    draw: (g: Phaser.GameObjects.Graphics) => void,
  ): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, width, height);
    g.destroy();
  }

  private makePlayer(): void {
    this.bake(TEXTURES.PLAYER, 32, 44, (g) => {
      // soft glow halo
      g.fillStyle(C.PLAYER, 0.16);
      g.fillRoundedRect(0, 0, 32, 44, 12);
      // body
      g.fillStyle(C.PLAYER, 1);
      g.fillRoundedRect(3, 3, 26, 38, 9);
      // lower shading
      g.fillStyle(C.PLAYER_SHADE, 1);
      g.fillRoundedRect(3, 30, 26, 11, { tl: 0, tr: 0, bl: 9, br: 9 });
      // top highlight
      g.fillStyle(0xffffff, 0.35);
      g.fillRoundedRect(7, 5, 14, 3, 1.5);
      // visor
      g.fillStyle(C.VISOR, 1);
      g.fillRoundedRect(12, 10, 17, 12, 5);
      // eye (faces right; sprite is flipped for left)
      g.fillStyle(C.EYE, 1);
      g.fillRoundedRect(22, 13, 5, 6, 2);
      g.fillStyle(0xffffff, 0.9);
      g.fillRect(24, 14, 1.5, 2);
      // feet
      g.fillStyle(C.VISOR, 0.85);
      g.fillRoundedRect(6, 37, 8, 4, 2);
      g.fillRoundedRect(18, 37, 8, 4, 2);
    });
  }

  private makePlatform(): void {
    this.bake(TEXTURES.PLATFORM, 32, 16, (g) => {
      g.fillStyle(C.PLATFORM, 1);
      g.fillRect(0, 0, 32, 16);
      // glowing top edge
      g.fillStyle(C.PLATFORM_EDGE, 1);
      g.fillRect(0, 0, 32, 3);
      g.fillStyle(C.PLATFORM_EDGE, 0.2);
      g.fillRect(0, 3, 32, 3);
      // underside line + panel seam
      g.fillStyle(0x0d1024, 0.9);
      g.fillRect(0, 14, 32, 2);
      g.fillStyle(0x0d1024, 0.6);
      g.fillRect(0, 7, 1, 7);
    });
  }

  private makeGround(): void {
    this.bake(TEXTURES.GROUND, 32, 64, (g) => {
      g.fillStyle(C.GROUND, 1);
      g.fillRect(0, 0, 32, 64);
      // surface lip
      g.fillStyle(C.PLATFORM_EDGE, 1);
      g.fillRect(0, 0, 32, 3);
      g.fillStyle(C.PLATFORM_EDGE, 0.18);
      g.fillRect(0, 3, 32, 5);
      // circuit-like seams
      g.fillStyle(0x2a3156, 1);
      g.fillRect(0, 31, 32, 1);
      g.fillRect(0, 63, 32, 1);
      g.fillRect(0, 8, 1, 23);
      g.fillRect(16, 32, 1, 31);
      g.fillStyle(C.PLATFORM_EDGE, 0.35);
      g.fillRect(14, 18, 4, 2);
      g.fillRect(30, 46, 2, 2);
    });
  }

  private makeSpike(): void {
    this.bake(TEXTURES.SPIKE, 32, 20, (g) => {
      // glow
      g.fillStyle(C.HAZARD, 0.25);
      g.fillTriangle(0, 20, 16, 0, 32, 20);
      // body
      g.fillStyle(C.HAZARD, 1);
      g.fillTriangle(3, 20, 16, 2, 29, 20);
      // highlight facet
      g.fillStyle(0xffffff, 0.35);
      g.fillTriangle(16, 2, 16, 20, 9, 20);
      // base
      g.fillStyle(0x3a0d1b, 1);
      g.fillRect(0, 18, 32, 2);
    });
  }

  private makeShard(): void {
    this.bake(TEXTURES.SHARD, 24, 24, (g) => {
      g.fillStyle(C.SHARD, 0.2);
      g.fillCircle(12, 12, 12);
      g.fillStyle(C.SHARD, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(12, 2),
          new Phaser.Geom.Point(19, 12),
          new Phaser.Geom.Point(12, 22),
          new Phaser.Geom.Point(5, 12),
        ],
        true,
      );
      g.fillStyle(0xffffff, 0.7);
      g.fillPoints(
        [
          new Phaser.Geom.Point(12, 2),
          new Phaser.Geom.Point(12, 12),
          new Phaser.Geom.Point(5, 12),
        ],
        true,
      );
    });
  }

  private makeGoal(): void {
    this.bake(TEXTURES.GOAL, 64, 128, (g) => {
      // beam
      g.fillStyle(C.GOAL, 0.1);
      g.fillRect(8, 0, 48, 128);
      g.fillStyle(C.GOAL, 0.18);
      g.fillRect(18, 0, 28, 128);
      // pillars
      g.fillStyle(C.GOAL, 1);
      g.fillRect(6, 8, 4, 120);
      g.fillRect(54, 8, 4, 120);
      // top bar
      g.fillRect(6, 8, 52, 4);
      // base
      g.fillStyle(0xffffff, 0.8);
      g.fillRect(2, 124, 60, 4);
    });
  }

  /** Purple geometric patrol drone (~28x28), origin at bottom-centre in-game. */
  private makeEnemy(): void {
    this.bake(TEXTURES.ENEMY, 28, 28, (g) => {
      // outer glow
      g.fillStyle(C.ENEMY, 0.18);
      g.fillCircle(14, 14, 14);
      // hexagonal shell
      const hex: Phaser.Geom.Point[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        hex.push(new Phaser.Geom.Point(14 + Math.cos(a) * 12, 14 + Math.sin(a) * 12));
      }
      g.fillStyle(C.ENEMY, 1);
      g.fillPoints(hex, true);
      // darker lower half for depth
      g.fillStyle(0x6a1f99, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(hex[3].x, 14),
          new Phaser.Geom.Point(hex[0].x, 14),
          hex[1],
          hex[2],
          hex[3],
        ],
        true,
      );
      // shell edge
      g.lineStyle(1.5, 0xe9b8ff, 0.8);
      g.strokePoints(hex, true, true);
      // spikes / antennae
      g.fillStyle(C.ENEMY_CORE, 1);
      g.fillTriangle(14, 0, 11, 5, 17, 5);
      g.fillTriangle(0, 14, 5, 11, 5, 17);
      g.fillTriangle(28, 14, 23, 11, 23, 17);
      // core eye
      g.fillStyle(0x1a0626, 1);
      g.fillCircle(14, 14, 6);
      g.fillStyle(C.ENEMY_CORE, 1);
      g.fillCircle(14, 14, 3.5);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(15, 13, 1.2);
    });
  }

  private makeParticle(): void {
    this.bake(TEXTURES.PARTICLE, 6, 6, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(3, 3, 3);
    });
  }

  private makeBackdrop(): void {
    const { HEIGHT } = GAME_CONFIG;

    // vertical gradient
    this.bake(TEXTURES.BG_GRADIENT, 4, HEIGHT, (g) => {
      g.fillGradientStyle(C.BG_TOP, C.BG_TOP, C.BG_BOTTOM, C.BG_BOTTOM, 1);
      g.fillRect(0, 0, 4, HEIGHT);
    });

    // stars (tileable horizontally)
    const rng = new Phaser.Math.RandomDataGenerator(['watching']);
    this.bake(TEXTURES.BG_STARS, 512, HEIGHT, (g) => {
      for (let i = 0; i < 90; i++) {
        const x = rng.between(0, 511);
        const y = rng.between(0, HEIGHT - 120);
        const a = rng.realInRange(0.15, 0.7);
        const s = rng.pick([1, 1, 1, 2]);
        g.fillStyle(0xbfd4ff, a);
        g.fillRect(x, y, s, s);
      }
    });

    // skyline silhouettes (tileable horizontally)
    const skylineH = 280;
    this.bake(TEXTURES.BG_SKYLINE, 640, skylineH, (g) => {
      let x = 0;
      while (x < 640) {
        const w = Math.min(rng.between(40, 90), 640 - x);
        const h = rng.between(60, 230);
        g.fillStyle(0x0d1024, 1);
        g.fillRect(x, skylineH - h, w, h);
        g.fillStyle(0x1a2040, 1);
        g.fillRect(x, skylineH - h, w, 2);
        // lit windows
        for (let wy = skylineH - h + 10; wy < skylineH - 8; wy += 14) {
          for (let wx = x + 6; wx < x + w - 8; wx += 12) {
            if (rng.frac() > 0.82) {
              g.fillStyle(C.PLATFORM_EDGE, rng.realInRange(0.2, 0.55));
              g.fillRect(wx, wy, 4, 5);
            }
          }
        }
        x += w + rng.between(0, 6);
      }
    });

    // faint grid
    this.bake(TEXTURES.BG_GRID, 64, 64, (g) => {
      g.fillStyle(C.PLATFORM_EDGE, 0.05);
      g.fillRect(0, 0, 64, 1);
      g.fillRect(0, 0, 1, 64);
    });
  }
}
