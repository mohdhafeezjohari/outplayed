import Phaser from 'phaser';
import { GAME_CONFIG, TEXTURES } from '../config/gameConfig';
import { Platform } from '../entities/Platform';
import { Hazard } from '../entities/Hazard';

/**
 * Level layout, authored in tile units (1 tile = 32px).
 *
 * Fairness rules baked into the layout below:
 *  - ordinary gaps are 3 tiles (well inside the ~185px jump range)
 *  - spikes are at most 3 tiles wide and always sit >= 4 tiles from the
 *    landing edge of the previous gap, so there is room to react
 *  - floating platforms hang >= 64px above the ground, so the player can
 *    always walk beneath them, and are never > 64px above one another
 */
interface GroundDef {
  x: number;
  w: number;
}
interface PlatformDef {
  x: number;
  /** Pixels above the ground surface. */
  rise: number;
  w: number;
}
interface SpikeDef {
  x: number;
  w: number;
}
interface ShardDef {
  x: number;
  /** Pixels above the ground surface. */
  rise: number;
}

const GROUND: GroundDef[] = [
  { x: 0, w: 26 },
  { x: 29, w: 17 },
  { x: 49, w: 12 },
  { x: 64, w: 6 },
  // stepping-stone gap lives between tile 70 and 80
  { x: 80, w: 18 },
  // Mid-level skill gate: shorter runways force a deliberate jump (no blind sprint).
  { x: 101, w: 5 },
  { x: 109, w: 8 },
  { x: 122, w: 10 },
  { x: 135, w: 14 },
  { x: 152, w: 12 },
  { x: 167, w: 33 },
];

const PLATFORMS: PlatformDef[] = [
  { x: 9, rise: 64, w: 4 },
  { x: 18, rise: 128, w: 3 },
  { x: 34, rise: 64, w: 3 },
  { x: 38, rise: 128, w: 4 },
  // stepping stones over the wide gap
  { x: 72, rise: 64, w: 2 },
  { x: 76, rise: 64, w: 2 },
  { x: 84, rise: 64, w: 3 },
  { x: 89, rise: 128, w: 4 },
  // Mid-gate high route (safe alternate if ground spikes are dense)
  { x: 103, rise: 96, w: 2 },
  { x: 107, rise: 128, w: 2 },
  { x: 112, rise: 64, w: 3 },
  { x: 155, rise: 64, w: 2 },
  { x: 158, rise: 128, w: 2 },
];

const SPIKES: SpikeDef[] = [
  { x: 15, w: 1 },
  { x: 39, w: 2 },
  { x: 55, w: 1 },
  { x: 59, w: 1 },
  { x: 88, w: 3 },
  { x: 95, w: 2 },
  // Mid-gate: dense but clearable — rewards timing over pure sprint
  { x: 102, w: 2 },
  { x: 112, w: 2 },
  { x: 127, w: 1 },
  { x: 140, w: 2 },
  { x: 144, w: 1 },
  { x: 161, w: 2 },
  { x: 175, w: 3 },
  { x: 183, w: 2 },
  { x: 188, w: 1 },
];

/** Extra shards that are not auto-placed on platforms (arcs over gaps etc.). */
const EXTRA_SHARDS: ShardDef[] = [
  { x: 27.5, rise: 110 },
  { x: 47.5, rise: 110 },
  { x: 62.5, rise: 110 },
  { x: 74.5, rise: 150 },
  { x: 78.5, rise: 150 },
  { x: 101.5, rise: 110 },
  { x: 120.5, rise: 110 },
  { x: 133.5, rise: 110 },
  { x: 150.5, rise: 110 },
  { x: 165.5, rise: 110 },
  { x: 176.5, rise: 120 },
  { x: 184, rise: 110 },
];

const GOAL_TILE_X = 196;
const SPAWN_TILE_X = 3;
/** Total level width in tiles. */
const WIDTH_TILES = 200;

/**
 * Builds the side-scrolling level and owns every static physics group in it.
 */
export class LevelManager {
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  readonly hazards: Phaser.Physics.Arcade.StaticGroup;
  readonly shards: Phaser.Physics.Arcade.StaticGroup;
  goal!: Phaser.Physics.Arcade.Sprite;

  readonly widthPx = WIDTH_TILES * GAME_CONFIG.TILE;
  readonly heightPx = GAME_CONFIG.HEIGHT;
  readonly killY = GAME_CONFIG.LEVEL.KILL_Y;
  /** Where the player's feet start. */
  readonly spawn: Phaser.Math.Vector2;

  constructor(private readonly scene: Phaser.Scene) {
    this.solids = scene.physics.add.staticGroup();
    this.hazards = scene.physics.add.staticGroup();
    this.shards = scene.physics.add.staticGroup();
    this.spawn = new Phaser.Math.Vector2(
      SPAWN_TILE_X * GAME_CONFIG.TILE,
      GAME_CONFIG.LEVEL.GROUND_Y,
    );
  }

  build(): void {
    const { scene } = this;

    // Physics world is wider and deeper than the camera: the player must be
    // free to fall into the void; GameScene handles the kill.
    scene.physics.world.setBounds(0, -400, this.widthPx, this.heightPx + 1000);
    scene.physics.world.checkCollision.down = false;
    GROUND.forEach((g) => Platform.ground(scene, this.solids, g.x, g.w));
    PLATFORMS.forEach((p) => Platform.floating(scene, this.solids, p.x, p.rise, p.w));
    SPIKES.forEach((s) => Hazard.onGround(scene, this.hazards, s.x, s.w));

    this.placeShards();
    this.placeGoal();
  }

  private placeShards(): void {
    const t = GAME_CONFIG.TILE;
    const groundY = GAME_CONFIG.LEVEL.GROUND_Y;

    const defs: ShardDef[] = [
      ...PLATFORMS.map((p) => ({ x: p.x + p.w / 2, rise: p.rise + 34 })),
      ...EXTRA_SHARDS,
    ];

    defs.forEach((d) => {
      const x = d.x * t;
      const y = groundY - d.rise;
      const shard = this.shards.create(x, y, TEXTURES.SHARD) as Phaser.Physics.Arcade.Sprite;
      shard.setDepth(5);
      const body = shard.body as Phaser.Physics.Arcade.StaticBody;
      body.setSize(18, 18);
      this.scene.tweens.add({
        targets: shard,
        scale: { from: 0.88, to: 1.1 },
        alpha: { from: 0.8, to: 1 },
        duration: 700 + ((d.x * 37) % 300),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: (d.x * 53) % 500,
      });
    });
  }

  private placeGoal(): void {
    const x = GOAL_TILE_X * GAME_CONFIG.TILE;
    const goal = this.scene.physics.add.staticSprite(x, GAME_CONFIG.LEVEL.GROUND_Y, TEXTURES.GOAL);
    goal.setOrigin(0.5, 1);
    goal.refreshBody();
    goal.setDepth(4);
    this.goal = goal;

    this.scene.tweens.add({
      targets: goal,
      alpha: { from: 0.65, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
