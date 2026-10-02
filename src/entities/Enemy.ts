import Phaser from 'phaser';
import { GAME_CONFIG, TEXTURES } from '../config/gameConfig';

/**
 * Adaptive patrol drone. Spawns with a telegraph, then becomes deadly.
 * Fairness: never appears on top of the player; slow patrol so it is dodgeable.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  deadly = false;
  private leftBound = 0;
  private rightBound = 0;
  private dir: 1 | -1 = -1;
  private readonly speed: number;

  constructor(scene: Phaser.Scene, x: number, y: number, patrolSpan = 90, speed = 70) {
    super(scene, x, y, TEXTURES.ENEMY);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(11);
    this.setOrigin(0.5, 1);
    this.setAlpha(0.35);
    this.setTint(0xffb0ff);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setSize(22, 22);
    body.setOffset((this.width - 22) / 2, this.height - 22);

    this.leftBound = x - patrolSpan;
    this.rightBound = x + patrolSpan;
    this.speed = speed;
    this.dir = -1;

    // Telegraph, then arm.
    scene.tweens.add({
      targets: this,
      alpha: { from: 0.25, to: 0.8 },
      duration: 160,
      yoyo: true,
      repeat: Math.max(1, Math.floor(GAME_CONFIG.AI.TELEGRAPH_MS / 320)),
    });

    scene.time.delayedCall(GAME_CONFIG.AI.TELEGRAPH_MS, () => {
      if (!this.active) return;
      this.deadly = true;
      this.clearTint();
      this.setAlpha(1);
      body.setVelocityX(this.dir * this.speed);
    });
  }

  tick(): void {
    if (!this.active || !this.deadly) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.x <= this.leftBound) {
      this.dir = 1;
      body.setVelocityX(this.speed);
      this.setFlipX(false);
    } else if (this.x >= this.rightBound) {
      this.dir = -1;
      body.setVelocityX(-this.speed);
      this.setFlipX(true);
    }
  }
}
