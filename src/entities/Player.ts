import Phaser from 'phaser';
import { GAME_CONFIG, TEXTURES } from '../config/gameConfig';
import { GameEvents, type MoveIntent } from '../events/GameEvents';

const P = GAME_CONFIG.PLAYER;

type KeyMap = {
  left: Phaser.Input.Keyboard.Key[];
  right: Phaser.Input.Keyboard.Key[];
  jump: Phaser.Input.Keyboard.Key[];
};

/**
 * The player: arcade-physics sprite with tight, forgiving platformer feel
 * (acceleration/friction, coyote time, jump buffering, variable jump height).
 *
 * Emits GameEvents (JUMP / LAND / SAMPLE) so BehaviourTracker can observe
 * without owning movement logic.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  /** -1 = facing left, 1 = facing right. */
  facing: 1 | -1 = 1;
  isDead = false;

  private readonly keys: KeyMap;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;

  private coyoteMs = 0;
  private jumpBufferMs = 0;
  private wasGrounded = false;
  private prevVelocityY = 0;
  private jumpHeld = false;
  private inputEnabled = true;
  private airTimeMs = 0;
  private lastMoveIntent: MoveIntent = 'none';

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.PLAYER);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(10);
    this.setOrigin(0.5, 1);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(P.WIDTH, P.HEIGHT);
    // Texture is 32x44, origin bottom-center: sit the hitbox on the feet.
    body.setOffset((this.width - P.WIDTH) / 2, this.height - P.HEIGHT - 3);
    body.setMaxVelocityY(P.MAX_FALL_SPEED);
    body.setCollideWorldBounds(true);

    const kb = scene.input.keyboard;
    if (!kb) throw new Error('Keyboard input is unavailable');
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      left: [kb.addKey(K.A), kb.addKey(K.LEFT)],
      right: [kb.addKey(K.D), kb.addKey(K.RIGHT)],
      jump: [kb.addKey(K.SPACE), kb.addKey(K.W), kb.addKey(K.UP)],
    };

    this.dust = scene.add.particles(0, 0, TEXTURES.PARTICLE, {
      lifespan: { min: 180, max: 340 },
      speed: { min: 20, max: 90 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.6, end: 0 },
      tint: 0x9fb4ff,
      gravityY: 120,
      emitting: false,
    });
    this.dust.setDepth(9);
  }

  /** Per-frame update; call from the owning scene. */
  tick(delta: number): void {
    if (this.isDead) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const dt = delta / 1000;

    const grounded = body.blocked.down || body.touching.down;

    // --- timers -------------------------------------------------------
    this.coyoteMs = grounded ? P.COYOTE_MS : Math.max(0, this.coyoteMs - delta);
    this.jumpBufferMs = Math.max(0, this.jumpBufferMs - delta);

    // --- input --------------------------------------------------------
    let dir = 0;
    let jumpPressed = false;
    let jumpDown = false;

    if (this.inputEnabled) {
      if (this.keys.left.some((k) => k.isDown)) dir -= 1;
      if (this.keys.right.some((k) => k.isDown)) dir += 1;
      // No short-circuit: every key's JustDown flag must be consumed.
      jumpPressed = this.keys.jump
        .map((k) => Phaser.Input.Keyboard.JustDown(k))
        .some(Boolean);
      jumpDown = this.keys.jump.some((k) => k.isDown);
    }

    if (jumpPressed) this.jumpBufferMs = P.JUMP_BUFFER_MS;

    const moveIntent: MoveIntent = dir < 0 ? 'left' : dir > 0 ? 'right' : 'none';
    this.lastMoveIntent = moveIntent;

    // --- horizontal movement -----------------------------------------
    const accel = grounded ? P.GROUND_ACCEL : P.AIR_ACCEL;
    const friction = grounded ? P.GROUND_FRICTION : P.AIR_FRICTION;
    let vx = body.velocity.x;

    if (dir !== 0) {
      const target = dir * P.MAX_SPEED;
      // Turning around is snappier than speeding up.
      const rate = Math.sign(vx) !== 0 && Math.sign(vx) !== dir ? accel + friction : accel;
      vx = approach(vx, target, rate * dt);
      this.facing = dir > 0 ? 1 : -1;
    } else {
      vx = approach(vx, 0, friction * dt);
    }
    body.setVelocityX(vx);

    // --- jumping -----------------------------------------------------
    if (this.jumpBufferMs > 0 && this.coyoteMs > 0) {
      const groundedAtJump = grounded || this.wasGrounded;
      body.setVelocityY(P.JUMP_VELOCITY);
      this.jumpBufferMs = 0;
      this.coyoteMs = 0;
      this.jumpHeld = true;
      this.burstDust(5);
      this.scene.events.emit(GameEvents.JUMP, {
        x: this.x,
        y: this.y,
        groundedAtJump,
      });
    }

    // Variable jump height: releasing early cuts the ascent.
    if (this.jumpHeld && !jumpDown && body.velocity.y < 0) {
      body.setVelocityY(body.velocity.y * P.JUMP_CUT);
      this.jumpHeld = false;
    }
    if (body.velocity.y >= 0) this.jumpHeld = false;

    // --- air / land tracking ----------------------------------------
    if (!grounded) {
      this.airTimeMs += delta;
    } else if (!this.wasGrounded && grounded) {
      this.scene.events.emit(GameEvents.LAND, {
        x: this.x,
        y: this.y,
        airTimeMs: this.airTimeMs,
      });
      this.airTimeMs = 0;
    } else if (grounded) {
      this.airTimeMs = 0;
    }

    // --- landing feedback --------------------------------------------
    if (grounded && !this.wasGrounded && this.prevVelocityY > 260) {
      this.burstDust(Phaser.Math.Clamp(Math.round(this.prevVelocityY / 120), 4, 9));
    }
    this.wasGrounded = grounded;
    this.prevVelocityY = body.velocity.y;

    // --- visuals -----------------------------------------------------
    this.setFlipX(this.facing < 0);
    // Lean into movement; purely cosmetic (arcade AABB ignores rotation).
    const targetAngle = (body.velocity.x / P.MAX_SPEED) * 5;
    this.setAngle(Phaser.Math.Linear(this.angle, targetAngle, 0.25));

    // --- behaviour sample --------------------------------------------
    const idle =
      grounded &&
      moveIntent === 'none' &&
      Math.abs(body.velocity.x) < 28;

    this.scene.events.emit(GameEvents.SAMPLE, {
      x: this.x,
      y: this.y,
      vx: body.velocity.x,
      vy: body.velocity.y,
      grounded,
      facing: this.facing,
      moveIntent,
      idle,
      deltaMs: delta,
    });
  }

  getMoveIntent(): MoveIntent {
    return this.lastMoveIntent;
  }

  /** Stop responding to input (e.g. level complete) without dying. */
  freeze(): void {
    this.inputEnabled = false;
  }

  die(): void {
    if (this.isDead) return;
    this.isDead = true;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.checkCollision.none = true;
    body.setCollideWorldBounds(false);
    body.setVelocity(Phaser.Math.Between(-60, 60), -340);

    this.setTint(GAME_CONFIG.COLORS.HAZARD);
    this.scene.tweens.add({
      targets: this,
      angle: this.facing * 200,
      alpha: 0,
      duration: 650,
      ease: 'Sine.easeIn',
    });

    this.dust.setParticleTint(GAME_CONFIG.COLORS.HAZARD);
    this.dust.explode(18, this.x, this.y - P.HEIGHT / 2);
  }

  private burstDust(count: number): void {
    this.dust.explode(count, this.x, this.y);
  }
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}
