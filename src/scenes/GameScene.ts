import Phaser from 'phaser';
import {
  GAME_CONFIG,
  SCENES,
  TEXTURES,
  RunResult,
  awarenessLevel,
  awarenessLevelLabel,
} from '../config/gameConfig';
import { SoundFX } from '../utils/SoundFX';
import { Player } from '../entities/Player';
import { Hazard } from '../entities/Hazard';
import { LevelManager } from '../systems/LevelManager';
import { ScoreManager } from '../systems/ScoreManager';
import { SpawnManager } from '../systems/SpawnManager';
import { HUD } from '../ui/HUD';
import { Backdrop } from '../ui/Backdrop';
import { AIDebugPanel } from '../ui/AIDebugPanel';
import { getAIDirector } from '../ai/session';
import type { AIDirector } from '../ai/AIDirector';
import { AdaptationSystem } from '../ai/AdaptationSystem';
import {
  GameEvents,
  type AvoidancePayload,
  type DeathPayload,
  type JumpPayload,
  type LandPayload,
  type PlayerSamplePayload,
} from '../events/GameEvents';
import { LeaderboardService } from '../systems/LeaderboardService';
import { getSavedUsername } from '../player/identity';

/**
 * Stage 3 gameplay scene — Director adapts the level from observed behaviour.
 */
export class GameScene extends Phaser.Scene {
  private player!: Player;
  private level!: LevelManager;
  private score = new ScoreManager();
  private hud!: HUD;
  private backdrop!: Backdrop;
  private director!: AIDirector;
  private debugPanel!: AIDebugPanel;
  private spawns!: SpawnManager;
  private adaptations!: AdaptationSystem;

  private paused = false;
  private ended = false;
  private pauseKey!: Phaser.Input.Keyboard.Key;
  private pauseKeyAlt!: Phaser.Input.Keyboard.Key;
  private debugKey!: Phaser.Input.Keyboard.Key;
  private muteKey!: Phaser.Input.Keyboard.Key;

  /** Cooldown so avoidance does not spam every frame near spikes. */
  private avoidanceCooldownMs = 0;
  private lastHudState = '';

  constructor() {
    super(SCENES.GAME);
  }

  create(): void {
    this.paused = false;
    this.ended = false;
    this.avoidanceCooldownMs = 0;
    this.lastHudState = '';

    this.director = getAIDirector(this.game);

    this.backdrop = new Backdrop(this);

    this.level = new LevelManager(this);
    this.level.build();

    this.player = new Player(this, this.level.spawn.x, this.level.spawn.y);

    this.spawns = new SpawnManager(this, this.level, () => this.player);
    this.adaptations = new AdaptationSystem(this.spawns);
    this.director.attachWorld(this.adaptations, () => this.player);
    this.director.beginRun();

    this.score.reset(this.player.x);
    this.hud = new HUD(this);
    this.debugPanel = new AIDebugPanel(this);

    this.setupCollisions();
    this.setupCamera();
    this.setupInput();
    this.setupBehaviourListeners();
    this.syncAIHud();

    void SoundFX.unlock();
    SoundFX.startBgm('game');

    this.cameras.main.fadeIn(350, 5, 6, 11);
  }

  update(_time: number, delta: number): void {
    this.backdrop.update();
    if (this.ended) return;

    if (Phaser.Input.Keyboard.JustDown(this.pauseKey) || Phaser.Input.Keyboard.JustDown(this.pauseKeyAlt)) {
      this.setPaused(!this.paused);
    }
    if (Phaser.Input.Keyboard.JustDown(this.muteKey)) {
      SoundFX.toggleMute();
    }
    if (Phaser.Input.Keyboard.JustDown(this.debugKey)) {
      this.debugPanel.toggle();
      this.debugPanel.update(this.director.getSnapshot());
    }
    if (this.paused) return;

    this.avoidanceCooldownMs = Math.max(0, this.avoidanceCooldownMs - delta);

    // Moving platforms are created dynamically, so collide them manually.
    // Done before player.tick so grounded state reflects the platform this frame.
    this.collideMovers();
    this.checkEnemyContact();

    this.player.tick(delta);
    this.score.tick(delta);
    this.score.registerProgress(this.player.x);
    this.hud.update(this.score);
    this.detectHazardAvoidance();

    this.spawns.update(delta);
    const decision = this.director.tick(delta);
    if (decision) {
      this.hud.showAdaptation(decision.banner, decision.detail);
      this.cameras.main.flash(120, 255, 61, 110);
      SoundFX.adapt();
      if (decision.kind === 'prediction') SoundFX.predict();
    }

    this.syncAIHud();

    if (this.player.y > this.level.killY) {
      this.handleDeath('Fell into the void');
    }
  }

  // ---------------------------------------------------------------------

  private setupBehaviourListeners(): void {
    this.events.on(GameEvents.SAMPLE, this.onSample, this);
    this.events.on(GameEvents.JUMP, this.onJump, this);
    this.events.on(GameEvents.LAND, this.onLand, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(GameEvents.SAMPLE, this.onSample, this);
      this.events.off(GameEvents.JUMP, this.onJump, this);
      this.events.off(GameEvents.LAND, this.onLand, this);
      this.spawns.clear();
      this.director.detachWorld();
      this.debugPanel.destroy();
    });
  }

  private onSample(payload: PlayerSamplePayload): void {
    this.director.onSample(payload);
  }

  private onJump(payload: JumpPayload): void {
    this.director.onJump(payload);
    SoundFX.jump();
  }

  private onLand(payload: LandPayload): void {
    this.director.onLand(payload);
    if (payload.airTimeMs > 80) SoundFX.land();
  }

  private syncAIHud(): void {
    const snap = this.director.getSnapshot();
    this.hud.setAwareness(snap.awareness);
    const level = awarenessLevel(snap.awareness);
    const label = awarenessLevelLabel(level);
    const key = `${level}:${label}`;
    if (key !== this.lastHudState) {
      this.lastHudState = key;
      this.hud.setAwarenessLevel(level, label);
    }
    this.debugPanel.update(snap);
  }

  /** Collide the player with each live moving platform (they are not in a group). */
  private collideMovers(): void {
    if (this.player.isDead) return;
    for (const sprite of this.spawns.getMoverSprites()) {
      if (!sprite.active) continue;
      this.physics.world.collide(this.player, sprite);
    }
  }

  /** Armed hunters kill on contact. */
  private checkEnemyContact(): void {
    if (this.ended || this.player.isDead) return;
    for (const enemy of this.spawns.getEnemyList()) {
      if (!enemy.active || !enemy.deadly) continue;
      if (this.physics.overlap(this.player, enemy)) {
        this.handleDeath('Caught by a hunter');
        return;
      }
    }
  }

  /**
   * If the player is near a spike and suddenly moves away, count an avoidance.
   */
  private detectHazardAvoidance(): void {
    if (this.avoidanceCooldownMs > 0 || this.player.isDead) return;

    const intent = this.player.getMoveIntent();
    if (intent === 'none') return;

    const px = this.player.x;
    const py = this.player.y;
    const sense = 90;
    let nearest: Phaser.GameObjects.GameObject | null = null;
    let nearestDist = Infinity;
    let nearestX = 0;

    const consider = (child: Phaser.GameObjects.GameObject) => {
      const h = child as Phaser.GameObjects.Sprite;
      if (!h.active) return;
      const dx = h.x - px;
      const dy = h.y - py;
      const d = Math.hypot(dx, dy);
      if (d < sense && d < nearestDist) {
        nearestDist = d;
        nearest = h;
        nearestX = h.x;
      }
    };

    this.level.hazards.getChildren().forEach(consider);
    this.spawns.hazardGroup.getChildren().forEach(consider);

    if (!nearest) return;

    const hazardOnRight = nearestX >= px;
    const fleeing =
      (hazardOnRight && intent === 'left') || (!hazardOnRight && intent === 'right');

    if (!fleeing) return;

    const payload: AvoidancePayload = {
      direction: intent,
      x: px,
      y: py,
    };
    this.director.onAvoidance(payload);
    this.avoidanceCooldownMs = 900;
  }

  private isDeadlyHazard(obj: Phaser.GameObjects.GameObject): boolean {
    const h = obj as Hazard & { deadly?: boolean };
    if (!h.active) return false;
    return h.deadly !== false;
  }

  private setupCollisions(): void {
    const { physics } = this;

    physics.add.collider(this.player, this.level.solids);
    physics.add.collider(this.player, this.spawns.solidGroup);

    physics.add.overlap(this.player, this.level.hazards, (_p, hazard) => {
      if (this.isDeadlyHazard(hazard as Phaser.GameObjects.GameObject)) {
        this.handleDeath('Impaled on a spike');
      }
    });

    physics.add.overlap(this.player, this.spawns.hazardGroup, (_p, hazard) => {
      if (this.isDeadlyHazard(hazard as Phaser.GameObjects.GameObject)) {
        this.handleDeath('Caught by an adaptation');
      }
    });

    physics.add.overlap(this.player, this.level.shards, (_p, shard) => {
      this.collectShard(shard as Phaser.Physics.Arcade.Sprite);
    });

    physics.add.overlap(this.player, this.level.goal, () => this.handleComplete());
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.level.widthPx, this.level.heightPx);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setFollowOffset(-90, 0);
    cam.setDeadzone(60, 80);
  }

  private setupInput(): void {
    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input is unavailable');
    this.pauseKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.pauseKeyAlt = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.debugKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F1);
    this.muteKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.N);
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.hud.setPaused(paused);
    SoundFX.pause();
    if (paused) {
      this.physics.world.pause();
      this.tweens.pauseAll();
    } else {
      this.physics.world.resume();
      this.tweens.resumeAll();
    }
  }

  private collectShard(shard: Phaser.Physics.Arcade.Sprite): void {
    if (!shard.active) return;
    const { x, y } = shard;
    shard.disableBody(true, true);
    this.score.addBonus(GAME_CONFIG.SCORE.SHARD);
    this.hud.popup(x, y - 10, `+${GAME_CONFIG.SCORE.SHARD}`);
    SoundFX.collect();

    const burst = this.add.particles(x, y, TEXTURES.PARTICLE, {
      speed: { min: 50, max: 170 },
      lifespan: 380,
      scale: { start: 1.1, end: 0 },
      tint: GAME_CONFIG.COLORS.SHARD,
      emitting: false,
    });
    burst.setDepth(8);
    burst.explode(12);
    this.time.delayedCall(600, () => burst.destroy());
  }

  private handleDeath(cause: string): void {
    if (this.ended) return;
    this.ended = true;
    this.player.die();
    SoundFX.death();

    const segment = Math.floor(this.player.x / GAME_CONFIG.AI.SEGMENT_SIZE);
    const deathPayload: DeathPayload = {
      x: this.player.x,
      y: this.player.y,
      cause,
      segment,
    };
    this.director.onDeath(deathPayload);
    this.syncAIHud();

    const cam = this.cameras.main;
    cam.stopFollow();
    cam.shake(200, 0.012);
    cam.flash(160, 255, 61, 110, false);

    this.time.delayedCall(850, () => this.finish({ completed: false, cause }));
  }

  private handleComplete(): void {
    if (this.ended) return;
    this.ended = true;
    this.player.freeze();
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
    SoundFX.complete();
    this.cameras.main.flash(300, 124, 255, 178, false);
    this.time.delayedCall(700, () => this.finish({ completed: true, cause: 'Signal reached' }));
  }

  private finish(partial: Pick<RunResult, 'completed' | 'cause'>): void {
    const snap = this.director.getSnapshot();
    const p = snap.profile;
    const username =
      (this.registry.get('username') as string | undefined) ||
      getSavedUsername();

    const result: RunResult = {
      score: this.score.score,
      timeMs: this.score.timeMs,
      username,
      awareness: snap.awareness,
      aiState: snap.state,
      jumpRate: p.jumpRate,
      rightMovementRatio: p.rightMovementRatio,
      leftMovementRatio: p.leftMovementRatio,
      idleTimeRatio: p.idleTimeRatio,
      predictability: p.predictability,
      predictabilityScore: p.predictabilityScore,
      predictionAccuracy: snap.predictionAccuracy,
      adaptationCount: snap.adaptationCount,
      riskTaking: Phaser.Math.Clamp(p.jumpRate * 0.5 + p.airTimeRatio * 0.5, 0, 1),
      repetition: p.repeatedRoute ? 'HIGH' : p.predictability,
      ...partial,
    };

    void LeaderboardService.submit({
      username,
      score: result.score,
      timeMs: result.timeMs,
      completed: result.completed,
      awareness: result.awareness,
    });

    // Completion always reveals; a death only reveals once the AI really knows you.
    const reveal = result.completed || snap.awareness >= 0.7;
    const next = reveal ? SCENES.REVEAL : SCENES.GAME_OVER;
    this.cameras.main.fadeOut(250, 5, 6, 11, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress === 1) this.scene.start(next, result);
    });
  }
}
