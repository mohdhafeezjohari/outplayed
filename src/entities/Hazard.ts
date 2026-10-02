import Phaser from 'phaser';
import { GAME_CONFIG, TEXTURES } from '../config/gameConfig';

const SPIKE_HEIGHT = 20;
/** Horizontal inset of the hitbox so brushing a spike tip is forgiving. */
const HITBOX_INSET_X = 7;
const HITBOX_TOP_OFFSET = 8;

/**
 * A row of spikes. Static body; the owning scene decides what overlap means.
 * Adaptive spawns may start with `deadly = false` during telegraph.
 */
export class Hazard extends Phaser.GameObjects.TileSprite {
  deadly = true;

  private constructor(
    scene: Phaser.Scene,
    group: Phaser.Physics.Arcade.StaticGroup,
    x: number,
    y: number,
    width: number,
  ) {
    super(scene, x, y, width, SPIKE_HEIGHT, TEXTURES.SPIKE);
    this.setOrigin(0, 0);
    this.setDepth(3);
    scene.add.existing(this);
    group.add(this);

    // Shrink the hitbox a little: visually-grazing contact should not kill.
    const body = this.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(
      width - HITBOX_INSET_X * 2,
      SPIKE_HEIGHT - HITBOX_TOP_OFFSET,
      false,
    );
    body.setOffset(HITBOX_INSET_X, HITBOX_TOP_OFFSET);
  }

  /** Spikes standing on the ground surface. */
  static onGround(
    scene: Phaser.Scene,
    group: Phaser.Physics.Arcade.StaticGroup,
    tileX: number,
    tileWidth: number,
  ): Hazard {
    const t = GAME_CONFIG.TILE;
    return new Hazard(
      scene,
      group,
      tileX * t,
      GAME_CONFIG.LEVEL.GROUND_Y - SPIKE_HEIGHT,
      tileWidth * t,
    );
  }

  /** Pixel-placed spikes (adaptive spawns). */
  static atPixels(
    scene: Phaser.Scene,
    group: Phaser.Physics.Arcade.StaticGroup,
    x: number,
    y: number,
    width: number,
  ): Hazard {
    return new Hazard(scene, group, x, y, width);
  }
}
