import Phaser from 'phaser';
import { GAME_CONFIG, TEXTURES } from '../config/gameConfig';

export type PlatformKind = 'ground' | 'floating';

/**
 * Static, tiled platform. The origin is the top-left corner so level data can
 * be authored in "top-left of the surface" coordinates.
 */
export class Platform extends Phaser.GameObjects.TileSprite {
  readonly kind: PlatformKind;

  private constructor(
    scene: Phaser.Scene,
    group: Phaser.Physics.Arcade.StaticGroup,
    x: number,
    y: number,
    width: number,
    kind: PlatformKind,
  ) {
    const texture = kind === 'ground' ? TEXTURES.GROUND : TEXTURES.PLATFORM;
    const height = kind === 'ground' ? 64 : 16;
    super(scene, x, y, width, height, texture);

    this.kind = kind;
    this.setOrigin(0, 0);
    this.setDepth(kind === 'ground' ? 1 : 2);
    scene.add.existing(this);
    group.add(this); // enables a static arcade body sized to this tile sprite
  }

  /** Ground slab whose top surface sits at `topY`. */
  static ground(
    scene: Phaser.Scene,
    group: Phaser.Physics.Arcade.StaticGroup,
    tileX: number,
    tileWidth: number,
  ): Platform {
    const t = GAME_CONFIG.TILE;
    return new Platform(
      scene,
      group,
      tileX * t,
      GAME_CONFIG.LEVEL.GROUND_Y,
      tileWidth * t,
      'ground',
    );
  }

  /** Thin floating platform `rise` pixels above the ground surface. */
  static floating(
    scene: Phaser.Scene,
    group: Phaser.Physics.Arcade.StaticGroup,
    tileX: number,
    rise: number,
    tileWidth: number,
  ): Platform {
    const t = GAME_CONFIG.TILE;
    return new Platform(
      scene,
      group,
      tileX * t,
      GAME_CONFIG.LEVEL.GROUND_Y - rise,
      tileWidth * t,
      'floating',
    );
  }
}
