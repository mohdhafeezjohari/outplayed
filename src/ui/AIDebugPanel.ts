import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import type { AIDirectorSnapshot } from '../ai/AIDirector';

const { COLORS, FONT, WIDTH, HEIGHT } = GAME_CONFIG;
const DEPTH = 200;

/**
 * Optional developer overlay (toggle F1). Shows what BehaviourTracker / AIDirector
 * currently know. Hidden during normal play.
 */
export class AIDebugPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Text;
  private visible = false;

  constructor(scene: Phaser.Scene) {
    const panelW = 340;
    const panelH = 360;
    const x = WIDTH - panelW - 16;
    const y = 90;

    const bg = scene.add
      .rectangle(0, 0, panelW, panelH, 0x05060b, 0.82)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x4cf0ff, 0.35);

    const title = scene.add.text(12, 10, 'AI OBSERVATION', {
      fontFamily: FONT,
      fontSize: '13px',
      color: COLORS.UI_ACCENT,
    });

    const hint = scene.add
      .text(panelW - 12, 10, 'F1', {
        fontFamily: FONT,
        fontSize: '11px',
        color: COLORS.UI_DIM,
      })
      .setOrigin(1, 0);

    this.body = scene.add.text(12, 34, '', {
      fontFamily: FONT,
      fontSize: '12px',
      color: COLORS.UI_TEXT,
      lineSpacing: 4,
    });

    this.root = scene.add
      .container(x, y, [bg, title, hint, this.body])
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setVisible(false);

    if (y + panelH > HEIGHT - 8) {
      this.root.setY(HEIGHT - panelH - 8);
    }
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.setVisible(visible);
  }

  isVisible(): boolean {
    return this.visible;
  }

  update(snapshot: AIDirectorSnapshot): void {
    if (!this.visible) return;

    const p = snapshot.profile;
    const pred = snapshot.prediction;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const lines = [
      `Jump tendency:   ${pct(p.jumpRate)}  (${p.jumpCount} jumps)`,
      `Right tendency:  ${pct(p.rightMovementRatio)}`,
      `Left tendency:   ${pct(p.leftMovementRatio)}`,
      `Idle ratio:      ${pct(p.idleTimeRatio)}`,
      `Air ratio:       ${pct(p.airTimeRatio)}`,
      `Preferred dir:   ${p.preferredDirection.toUpperCase()}`,
      `Predictability:  ${p.predictability}  (${pct(p.predictabilityScore)})`,
      `Route repeat:    ${p.repeatedRoute ? `YES ×${p.routeRepetitionCount}` : 'no'}`,
      `Sprint rush:     ${p.sprintRush ? 'YES — never stop' : 'no'}`,
      `Jump pattern:    ${p.repeatedJumpPattern ? 'REPEATED' : 'varied'}`,
      `Deaths:          ${p.deaths}${p.repeatsAfterDeath ? '  (repeats after death)' : ''}`,
      `Avoidances:      ${p.avoidanceAttempts}`,
      `Confidence:      ${pct(p.confidence)}`,
      '',
      `Prediction L/R/J/I: ${pct(pred.LEFT)} ${pct(pred.RIGHT)} ${pct(pred.JUMP)} ${pct(pred.IDLE)}`,
      `Likely next:     ${pred.likely}  (conf ${pct(pred.confidence)})`,
      '',
      `Current strategy: ${snapshot.strategy}`,
      `Director state:   ${snapshot.state}`,
      `Next adaptation:  ${snapshot.nextAdaptation}`,
      `Last fired:       ${snapshot.lastAdaptation ?? '—'}`,
      `Adaptations:      ${snapshot.adaptationCount}`,
      `Awareness:        ${pct(snapshot.awareness)}`,
      `Prediction acc.:  ${pct(snapshot.predictionAccuracy)}`,
    ];
    this.body.setText(lines.join('\n'));
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
