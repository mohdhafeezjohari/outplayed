import Phaser from 'phaser';
import { GAME_CONFIG, TEXTURES } from '../config/gameConfig';
import type { LevelManager } from './LevelManager';
import type { Player } from '../entities/Player';
import { Hazard } from '../entities/Hazard';
import { Enemy } from '../entities/Enemy';
import type { PredictedAction } from '../ai/PredictionEngine';

export type AdaptiveKind =
  | 'overhead'
  | 'direction'
  | 'escape'
  | 'fake_platform'
  | 'route'
  | 'pressure'
  | 'prediction'
  | 'enemy'
  | 'moving_platform'
  | 'timed_hazard'
  | 'sprint_gate';

interface LiveAdaptive {
  kind: AdaptiveKind;
  objects: Phaser.GameObjects.GameObject[];
  expiresAt: number;
  onExpire?: () => void;
}

interface MovingPlatform {
  sprite: Phaser.Physics.Arcade.Sprite;
  originX: number;
  span: number;
  speed: number;
}

/**
 * Fair spawn helper for adaptive hazards / platforms / enemies.
 */
export class SpawnManager {
  private readonly live: LiveAdaptive[] = [];
  private readonly adaptiveHazards: Phaser.Physics.Arcade.StaticGroup;
  private readonly adaptiveSolids: Phaser.Physics.Arcade.StaticGroup;
  private readonly enemies: Enemy[] = [];
  private readonly movers: MovingPlatform[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly level: LevelManager,
    private readonly getPlayer: () => Player,
  ) {
    this.adaptiveHazards = scene.physics.add.staticGroup();
    this.adaptiveSolids = scene.physics.add.staticGroup();
  }

  get hazardGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.adaptiveHazards;
  }

  get solidGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.adaptiveSolids;
  }

  getEnemyList(): Enemy[] {
    return this.enemies;
  }

  liveCount(): number {
    return this.live.length;
  }

  isSafeSpawn(
    x: number,
    y: number,
    w: number,
    h: number,
    minDist: number = GAME_CONFIG.AI.MIN_SPAWN_DISTANCE,
  ): boolean {
    const player = this.getPlayer();
    if (player.isDead) return false;

    const cx = x + w / 2;
    const cy = y + h / 2;
    const dist = Phaser.Math.Distance.Between(cx, cy, player.x, player.y - 20);
    if (dist < minDist) return false;

    const pad = 40;
    const px = player.x - GAME_CONFIG.PLAYER.WIDTH / 2 - pad;
    const py = player.y - GAME_CONFIG.PLAYER.HEIGHT - pad;
    const pw = GAME_CONFIG.PLAYER.WIDTH + pad * 2;
    const ph = GAME_CONFIG.PLAYER.HEIGHT + pad * 2;
    if (
      Phaser.Geom.Rectangle.Overlaps(
        new Phaser.Geom.Rectangle(x, y, w, h),
        new Phaser.Geom.Rectangle(px, py, pw, ph),
      )
    ) {
      return false;
    }

    if (x < 32 || x + w > this.level.widthPx - 32) return false;
    if (y < 40 || y > GAME_CONFIG.LEVEL.GROUND_Y) return false;
    return true;
  }

  spawnDirectionSpikes(kind: AdaptiveKind, aheadX: number, tileWidth = 2): boolean {
    const t = GAME_CONFIG.TILE;
    const w = tileWidth * t;
    const x = Math.round(aheadX / t) * t;
    const y = GAME_CONFIG.LEVEL.GROUND_Y - 20;
    if (!this.isSafeSpawn(x, y, w, 20)) return false;

    const warning = this.scene.add
      .rectangle(x + w / 2, y + 10, w + 8, 28, GAME_CONFIG.COLORS.HAZARD, 0.25)
      .setDepth(12);
    this.scene.tweens.add({
      targets: warning,
      alpha: { from: 0.15, to: 0.55 },
      duration: 180,
      yoyo: true,
      repeat: Math.floor(GAME_CONFIG.AI.TELEGRAPH_MS / 360),
    });

    const hazard = Hazard.atPixels(this.scene, this.adaptiveHazards, x, y, w);
    hazard.setAlpha(0.35);
    hazard.setTint(0xff9bb0);
    hazard.deadly = false;

    this.scene.time.delayedCall(GAME_CONFIG.AI.TELEGRAPH_MS, () => {
      if (!hazard.active) return;
      hazard.deadly = true;
      hazard.clearTint();
      hazard.setAlpha(1);
      warning.destroy();
      this.pulse(x + w / 2, y);
    });

    this.track(kind, [warning, hazard], 12_000);
    return true;
  }

  spawnOverheadTrap(kind: AdaptiveKind, centerX: number): boolean {
    const w = 64;
    const x = centerX - w / 2;
    const y = GAME_CONFIG.LEVEL.GROUND_Y - 150;
    if (!this.isSafeSpawn(x, y, w, 20, GAME_CONFIG.AI.MIN_SPAWN_DISTANCE + 20)) return false;

    const bar = this.scene.add
      .tileSprite(x, y, w, 20, TEXTURES.SPIKE)
      .setOrigin(0, 0)
      .setFlipY(true)
      .setDepth(12)
      .setAlpha(0.4)
      .setTint(0xff9bb0);

    this.scene.physics.add.existing(bar, true);
    this.adaptiveHazards.add(bar);
    const body = bar.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(w - 8, 14);
    body.setOffset(4, 4);
    (bar as unknown as { deadly: boolean }).deadly = false;

    const warn = this.scene.add
      .rectangle(centerX, y + 10, w + 16, 36, GAME_CONFIG.COLORS.HAZARD, 0.2)
      .setDepth(11);
    this.scene.tweens.add({
      targets: [bar, warn],
      alpha: { from: 0.25, to: 0.7 },
      duration: 200,
      yoyo: true,
      repeat: 3,
    });

    this.scene.time.delayedCall(GAME_CONFIG.AI.TELEGRAPH_MS, () => {
      if (!bar.active) return;
      (bar as unknown as { deadly: boolean }).deadly = true;
      bar.clearTint();
      bar.setAlpha(1);
      warn.destroy();
      this.pulse(centerX, y + 10);
    });

    this.track(kind, [bar, warn], 10_000);
    return true;
  }

  spawnFakeSafePlatform(kind: AdaptiveKind, aheadX: number): boolean {
    const t = GAME_CONFIG.TILE;
    const w = 3 * t;
    const x = Math.round(aheadX / t) * t;
    const rise = 96;
    const y = GAME_CONFIG.LEVEL.GROUND_Y - rise;
    if (!this.isSafeSpawn(x, y, w, 16, GAME_CONFIG.AI.MIN_SPAWN_DISTANCE + 40)) return false;

    const plat = this.scene.add
      .tileSprite(x, y, w, 16, TEXTURES.PLATFORM)
      .setOrigin(0, 0)
      .setDepth(2)
      .setTint(0x7cffb2);
    this.scene.physics.add.existing(plat, true);
    this.adaptiveSolids.add(plat);

    const glow = this.scene.add
      .rectangle(x + w / 2, y + 8, w + 10, 22, GAME_CONFIG.COLORS.GOAL, 0.25)
      .setDepth(1);

    this.scene.tweens.add({
      targets: plat,
      duration: 1600,
      ease: 'Sine.easeIn',
      onUpdate: (tw) => {
        const v = tw.progress;
        if (v < 0.45) plat.setTint(0x7cffb2);
        else if (v < 0.75) plat.setTint(0xffc857);
        else plat.setTint(0xff3d6e);
      },
    });

    this.scene.time.delayedCall(1700, () => {
      if (!plat.active) return;
      glow.destroy();
      plat.destroy();
      const hx = x + t;
      const hy = y;
      if (!this.isSafeSpawn(hx, hy, t, 20, 80)) return;
      const hazard = Hazard.atPixels(this.scene, this.adaptiveHazards, hx, hy, t * 2);
      this.pulse(hx + t, hy);
      this.track(kind, [hazard], 8_000);
    });

    this.track(kind, [plat, glow], 12_000);
    return true;
  }

  spawnPressure(kind: AdaptiveKind): boolean {
    const player = this.getPlayer();
    return this.spawnDirectionSpikes(kind, player.x - player.facing * 120, 2);
  }

  spawnRouteBlock(kind: AdaptiveKind, aheadX: number): boolean {
    const okSpikes = this.spawnDirectionSpikes(kind, aheadX, 1);
    const t = GAME_CONFIG.TILE;
    const px = Math.round((aheadX + 96) / t) * t;
    const py = GAME_CONFIG.LEVEL.GROUND_Y - 128;
    if (this.isSafeSpawn(px, py, 2 * t, 16, GAME_CONFIG.AI.MIN_SPAWN_DISTANCE)) {
      const alt = this.scene.add
        .tileSprite(px, py, 2 * t, 16, TEXTURES.PLATFORM)
        .setOrigin(0, 0)
        .setDepth(2)
        .setTint(0x4cf0ff);
      this.scene.physics.add.existing(alt, true);
      this.adaptiveSolids.add(alt);
      this.track(kind, [alt], 14_000);
    }
    return okSpikes;
  }

  /**
   * Fair counter to "never stop, always go right":
   * - Spikes placed well ahead so telegraph finishes before arrival
   * - High alternate platform (must jump / change route)
   * - Brief overhead so blind sprint-jumps also get checked
   * Always avoidable; never spawned on the player.
   */
  spawnSprintGate(kind: AdaptiveKind, aheadX: number): boolean {
    const t = GAME_CONFIG.TILE;
    // Far enough that TELEGRAPH_MS elapses before a max-speed runner arrives.
    const gateX = Math.round((aheadX + 80) / t) * t;
    const spikeW = 2;
    const groundY = GAME_CONFIG.LEVEL.GROUND_Y;
    const spikeY = groundY - 20;
    const w = spikeW * t;

    if (!this.isSafeSpawn(gateX, spikeY, w, 20, GAME_CONFIG.AI.MIN_SPAWN_DISTANCE + 40)) {
      return this.spawnRouteBlock(kind, aheadX);
    }

    const warn = this.scene.add
      .rectangle(gateX + w / 2, spikeY + 10, w + 24, 36, GAME_CONFIG.COLORS.HAZARD, 0.28)
      .setDepth(12);
    this.scene.tweens.add({
      targets: warn,
      alpha: { from: 0.2, to: 0.65 },
      duration: 160,
      yoyo: true,
      repeat: Math.floor(GAME_CONFIG.AI.TELEGRAPH_MS / 320),
    });

    const label = this.scene.add
      .text(gateX + w / 2, spikeY - 28, 'PATH DENIED', {
        fontFamily: GAME_CONFIG.FONT,
        fontSize: '12px',
        color: GAME_CONFIG.COLORS.UI_WARN,
      })
      .setOrigin(0.5)
      .setDepth(13)
      .setAlpha(0.9);
    this.scene.tweens.add({ targets: label, alpha: 0, delay: 1400, duration: 400 });

    const hazard = Hazard.atPixels(this.scene, this.adaptiveHazards, gateX, spikeY, w);
    hazard.setAlpha(0.35);
    hazard.setTint(0xff9bb0);
    hazard.deadly = false;

    this.scene.time.delayedCall(GAME_CONFIG.AI.TELEGRAPH_MS, () => {
      if (!hazard.active) return;
      hazard.deadly = true;
      hazard.clearTint();
      hazard.setAlpha(1);
      warn.destroy();
      this.pulse(gateX + w / 2, spikeY);
    });

    // Alternate high route past the gate.
    const altX = Math.round((gateX + 64) / t) * t;
    const altY = groundY - 128;
    if (this.isSafeSpawn(altX, altY, 2 * t, 16, 120)) {
      const alt = this.scene.add
        .tileSprite(altX, altY, 2 * t, 16, TEXTURES.PLATFORM)
        .setOrigin(0, 0)
        .setDepth(2)
        .setTint(0x4cf0ff);
      this.scene.physics.add.existing(alt, true);
      this.adaptiveSolids.add(alt);
      this.track(kind, [alt], 14_000);
    }

    // Soft overhead over the landing so a blind jump-forward isn't free.
    this.spawnOverheadTrap(kind, gateX + w + 40);

    this.track(kind, [warn, label, hazard], 14_000);
    return true;
  }

  spawnEnemy(kind: AdaptiveKind, aheadX: number, speed = 70): boolean {
    const x = aheadX;
    const y = GAME_CONFIG.LEVEL.GROUND_Y;
    if (!this.isSafeSpawn(x - 16, y - 28, 32, 28, GAME_CONFIG.AI.MIN_SPAWN_DISTANCE + 30)) {
      return false;
    }
    const enemy = new Enemy(this.scene, x, y, 100, speed);
    this.enemies.push(enemy);
    this.track(kind, [enemy], 14_000, () => {
      const i = this.enemies.indexOf(enemy);
      if (i >= 0) this.enemies.splice(i, 1);
    });
    this.pulse(x, y - 20);
    return true;
  }

  spawnMovingPlatform(kind: AdaptiveKind, aheadX: number): boolean {
    const t = GAME_CONFIG.TILE;
    const w = 3 * t;
    const x = Math.round(aheadX / t) * t;
    const y = GAME_CONFIG.LEVEL.GROUND_Y - 112;
    if (!this.isSafeSpawn(x, y, w, 16, GAME_CONFIG.AI.MIN_SPAWN_DISTANCE + 20)) return false;

    const plat = this.scene.physics.add.sprite(x + w / 2, y + 8, TEXTURES.PLATFORM);
    plat.setDisplaySize(w, 16);
    plat.setDepth(2);
    plat.setTint(0x4cf0ff);
    plat.setImmovable(true);
    const body = plat.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(w, 16);
    body.setVelocityX(70);

    this.movers.push({ sprite: plat, originX: x + w / 2, span: 70, speed: 70 });

    const label = this.scene.add
      .text(x + w / 2, y - 14, 'TIMING', {
        fontFamily: GAME_CONFIG.FONT,
        fontSize: '11px',
        color: GAME_CONFIG.COLORS.UI_ACCENT,
      })
      .setOrigin(0.5)
      .setDepth(12)
      .setAlpha(0.8);
    this.scene.tweens.add({ targets: label, alpha: 0, delay: 1200, duration: 400 });

    this.track(kind, [plat, label], 16_000, () => {
      const idx = this.movers.findIndex((m) => m.sprite === plat);
      if (idx >= 0) this.movers.splice(idx, 1);
    });
    return true;
  }

  getMoverSprites(): Phaser.Physics.Arcade.Sprite[] {
    return this.movers.map((m) => m.sprite);
  }

  spawnTimedHazard(kind: AdaptiveKind, aheadX: number): boolean {
    const t = GAME_CONFIG.TILE;
    const w = 2 * t;
    const x = Math.round(aheadX / t) * t;
    const y = GAME_CONFIG.LEVEL.GROUND_Y - 20;
    if (!this.isSafeSpawn(x, y, w, 20)) return false;

    const hazard = Hazard.atPixels(this.scene, this.adaptiveHazards, x, y, w);
    hazard.deadly = false;
    hazard.setAlpha(0.3);

    const beat = this.scene.time.addEvent({
      delay: 900,
      loop: true,
      callback: () => {
        if (!hazard.active) {
          beat.remove(false);
          return;
        }
        hazard.deadly = !hazard.deadly;
        hazard.setAlpha(hazard.deadly ? 1 : 0.3);
        if (hazard.deadly) this.pulse(x + w / 2, y);
      },
    });

    this.track(kind, [hazard], 12_000, () => beat.remove(false));
    return true;
  }

  spawnPredictionEvent(kind: AdaptiveKind, action: PredictedAction, aheadX: number): boolean {
    const player = this.getPlayer();
    const label = this.scene.add
      .text(player.x, player.y - 70, `PREDICTED: ${action}`, {
        fontFamily: GAME_CONFIG.FONT,
        fontSize: '14px',
        color: GAME_CONFIG.COLORS.UI_WARN,
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.scene.tweens.add({
      targets: label,
      y: label.y - 24,
      alpha: 0,
      duration: 1400,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });

    if (action === 'JUMP') return this.spawnOverheadTrap(kind, player.x + player.facing * 190);
    if (action === 'IDLE') return this.spawnPressure(kind);
    if (action === 'LEFT') return this.spawnDirectionSpikes(kind, player.x - 210, 2);
    if (this.spawnDirectionSpikes(kind, aheadX, 2)) return true;
    return this.spawnEnemy(kind, aheadX, 75);
  }

  update(_delta: number): void {
    const now = this.scene.time.now;
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (now >= this.live[i].expiresAt) {
        this.destroyLive(this.live[i]);
        this.live.splice(i, 1);
      }
    }

    this.enemies.forEach((e) => e.tick());

    for (const m of this.movers) {
      if (!m.sprite.active) continue;
      const body = m.sprite.body as Phaser.Physics.Arcade.Body;
      if (m.sprite.x > m.originX + m.span) body.setVelocityX(-m.speed);
      else if (m.sprite.x < m.originX - m.span) body.setVelocityX(m.speed);
    }
  }

  clear(): void {
    while (this.live.length) {
      const item = this.live.pop();
      if (item) this.destroyLive(item);
    }
    this.enemies.length = 0;
    this.movers.length = 0;
  }

  private track(
    kind: AdaptiveKind,
    objects: Phaser.GameObjects.GameObject[],
    lifeMs: number,
    onExpire?: () => void,
  ): void {
    this.live.push({ kind, objects, expiresAt: this.scene.time.now + lifeMs, onExpire });
  }

  private destroyLive(item: LiveAdaptive): void {
    item.onExpire?.();
    item.objects.forEach((o) => {
      if (o && (o as Phaser.GameObjects.GameObject).active !== false) o.destroy();
    });
  }

  private pulse(x: number, y: number): void {
    const burst = this.scene.add.particles(x, y, TEXTURES.PARTICLE, {
      speed: { min: 40, max: 140 },
      lifespan: 320,
      scale: { start: 1, end: 0 },
      tint: GAME_CONFIG.COLORS.HAZARD,
      emitting: false,
    });
    burst.setDepth(15);
    burst.explode(10);
    this.scene.time.delayedCall(500, () => burst.destroy());
    this.scene.cameras.main.shake(90, 0.004);
  }
}
