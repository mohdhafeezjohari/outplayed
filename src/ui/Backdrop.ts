import Phaser from 'phaser';
import { GAME_CONFIG, TEXTURES } from '../config/gameConfig';

/**
 * Layered parallax background pinned to the camera. Call `update()` each
 * frame in scenes that scroll; static scenes can skip it.
 */
export class Backdrop {
  private readonly stars: Phaser.GameObjects.TileSprite;
  private readonly grid: Phaser.GameObjects.TileSprite;
  private readonly skyline: Phaser.GameObjects.TileSprite;

  constructor(private readonly scene: Phaser.Scene) {
    const { WIDTH, HEIGHT } = GAME_CONFIG;

    const gradient = scene.add
      .image(0, 0, TEXTURES.BG_GRADIENT)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-100);
    gradient.setDisplaySize(WIDTH, HEIGHT);

    this.stars = scene.add
      .tileSprite(0, 0, WIDTH, HEIGHT, TEXTURES.BG_STARS)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-90);

    this.skyline = scene.add
      .tileSprite(0, HEIGHT - 280, WIDTH, 280, TEXTURES.BG_SKYLINE)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-80)
      .setAlpha(0.9);

    this.grid = scene.add
      .tileSprite(0, 0, WIDTH, HEIGHT, TEXTURES.BG_GRID)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-70);
  }

  update(): void {
    const sx = this.scene.cameras.main.scrollX;
    this.stars.tilePositionX = sx * 0.05;
    this.skyline.tilePositionX = sx * 0.25;
    this.grid.tilePositionX = sx * 0.6;
  }

  /** Slow idle drift for non-scrolling scenes (menu, game over). */
  drift(delta: number): void {
    this.stars.tilePositionX += delta * 0.004;
    this.skyline.tilePositionX += delta * 0.012;
    this.grid.tilePositionX += delta * 0.03;
  }
}
