/**
 * Procedural audio — no external files.
 * Web Audio API oscillators / noise for BGM + SFX.
 * Must unlock() after a user gesture (browser autoplay policy).
 */

type BgmMode = 'menu' | 'game' | 'reveal' | 'off';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private unlocked = false;
  private muted = false;
  private bgmMode: BgmMode = 'off';
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private droneNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  /** Call from first click / key — required before any sound plays. */
  async unlock(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.22;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.unlocked = true;
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  // ----- BGM ---------------------------------------------------------------

  startBgm(mode: BgmMode): void {
    if (mode === this.bgmMode) return;
    this.stopBgmInternal();
    this.bgmMode = mode;
    if (mode === 'off' || !this.ctx || !this.unlocked) return;

    void this.unlock().then(() => {
      if (!this.ctx || this.bgmMode !== mode) return;
      this.startDrone(mode);
      this.schedulePulse(mode);
    });
  }

  stopBgm(): void {
    this.stopBgmInternal();
    this.bgmMode = 'off';
  }

  private stopBgmInternal(): void {
    if (this.bgmTimer !== null) {
      window.clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
    const now = this.ctx?.currentTime ?? 0;
    for (const n of this.droneNodes) {
      try {
        n.gain.gain.cancelScheduledValues(now);
        n.gain.gain.setTargetAtTime(0, now, 0.08);
        n.osc.stop(now + 0.3);
      } catch {
        /* already stopped */
      }
    }
    this.droneNodes = [];
    this.bgmStep = 0;
  }

  private startDrone(mode: BgmMode): void {
    if (!this.ctx) return;
    const fundamentals =
      mode === 'menu'
        ? [55, 82.5, 110]
        : mode === 'reveal'
          ? [49, 73.5, 98, 147]
          : [41.2, 61.8, 82.4];

    for (const f of fundamentals) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = mode === 'reveal' ? 'triangle' : 'sine';
      osc.frequency.value = f;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start();
      gain.gain.setTargetAtTime(mode === 'menu' ? 0.12 : 0.09, this.ctx.currentTime, 0.8);
      this.droneNodes.push({ osc, gain });
    }
  }

  private schedulePulse(mode: BgmMode): void {
    if (!this.ctx || this.bgmMode !== mode) return;

    // Dark minor motif — feels watched / tense.
    const menuNotes = [110, 130.8, 146.8, 130.8, 98, 110, 0, 0];
    const gameNotes = [82.4, 98, 123.5, 98, 73.4, 82.4, 0, 110];
    const revealNotes = [196, 220, 246.9, 293.7, 246.9, 220, 196, 0];
    const notes = mode === 'menu' ? menuNotes : mode === 'reveal' ? revealNotes : gameNotes;
    const bpm = mode === 'game' ? 92 : mode === 'reveal' ? 72 : 70;
    const stepMs = (60_000 / bpm) / 2;

    const freq = notes[this.bgmStep % notes.length];
    this.bgmStep += 1;
    if (freq > 0) {
      this.tone(freq, 0.08, mode === 'reveal' ? 'triangle' : 'square', 0.045, this.musicGain, 0.18);
      // Soft fifth above for thickness
      this.tone(freq * 1.5, 0.06, 'sine', 0.02, this.musicGain, 0.22);
    }

    this.bgmTimer = window.setTimeout(() => this.schedulePulse(mode), stepMs);
  }

  // ----- SFX ---------------------------------------------------------------

  ui(): void {
    this.beep(660, 0.05, 'square', 0.08);
  }

  type(): void {
    this.beep(420 + Math.random() * 80, 0.03, 'square', 0.04);
  }

  start(): void {
    this.beep(220, 0.08, 'sawtooth', 0.1);
    this.beep(330, 0.1, 'square', 0.08, 0.07);
    this.beep(440, 0.14, 'triangle', 0.1, 0.14);
  }

  jump(): void {
    this.sweep(180, 520, 0.12, 'square', 0.12);
  }

  land(): void {
    this.noise(0.05, 0.08, 800);
    this.beep(90, 0.06, 'triangle', 0.1);
  }

  collect(): void {
    this.beep(660, 0.06, 'sine', 0.1);
    this.beep(990, 0.08, 'sine', 0.09, 0.05);
    this.beep(1320, 0.1, 'triangle', 0.07, 0.1);
  }

  adapt(): void {
    this.sweep(400, 120, 0.25, 'sawtooth', 0.14);
    this.noise(0.12, 0.1, 1200);
  }

  predict(): void {
    this.beep(520, 0.07, 'square', 0.1);
    this.beep(780, 0.09, 'square', 0.09, 0.08);
    this.beep(1040, 0.12, 'triangle', 0.08, 0.16);
  }

  death(): void {
    this.sweep(320, 40, 0.45, 'sawtooth', 0.2);
    this.noise(0.3, 0.18, 600);
  }

  complete(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.beep(f, 0.16, 'triangle', 0.12, i * 0.1));
  }

  reveal(): void {
    this.sweep(80, 240, 0.6, 'sine', 0.15);
    this.beep(160, 0.4, 'triangle', 0.1, 0.2);
    this.beep(240, 0.5, 'sine', 0.08, 0.45);
  }

  pause(): void {
    this.beep(300, 0.06, 'triangle', 0.06);
  }

  // ----- primitives --------------------------------------------------------

  private beep(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    delay = 0,
  ): void {
    this.tone(freq, dur, type, vol, this.sfxGain, delay);
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    dest: GainNode | undefined,
    delay = 0,
  ): void {
    if (!this.ctx || !this.unlocked || !dest) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private sweep(
    from: number,
    to: number,
    dur: number,
    type: OscillatorType,
    vol: number,
  ): void {
    if (!this.ctx || !this.unlocked) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, lowpassHz: number): void {
    if (!this.ctx || !this.unlocked) return;
    const t0 = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpassHz;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }
}

const engine = new AudioEngine();

/** Public façade — same call sites as the old placeholders. */
export const SoundFX = {
  unlock: () => engine.unlock(),
  startBgm: (mode: BgmMode) => engine.startBgm(mode),
  stopBgm: () => engine.stopBgm(),
  toggleMute: () => engine.toggleMute(),
  isMuted: () => engine.isMuted(),
  isUnlocked: () => engine.isUnlocked(),

  ui: () => engine.ui(),
  type: () => engine.type(),
  start: () => engine.start(),
  jump: () => engine.jump(),
  land: () => engine.land(),
  collect: () => engine.collect(),
  adapt: () => engine.adapt(),
  predict: () => engine.predict(),
  death: () => engine.death(),
  complete: () => engine.complete(),
  reveal: () => engine.reveal(),
  pause: () => engine.pause(),
};
