export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private tensionOsc: OscillatorNode | null = null;
  private tensionGain: GainNode | null = null;
  private waterFilter: BiquadFilterNode | null = null;
  private waterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private masterVol = 0.8;
  private musicVol = 0.7;
  private sfxVol = 0.85;
  private muted = false;
  private started = false;

  private lastGrowlTime = 0;
  private nextDripTime = 2.5;
  private nextGroanTime = 7.0;

  public unlock(): void {
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();

        this.masterGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();

        this.musicGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.noiseBuffer = this.createNoiseBuffer(2.0);
        this.applyVolumes();
        this.startAmbience();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    } catch {
      // AudioContext unavailable in headless or restricted contexts
    }
  }

  public setVolumes(master: number, music: number, sfx: number, muted: boolean): void {
    this.masterVol = master;
    this.musicVol = music;
    this.sfxVol = sfx;
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.masterVol, now, 0.05);
    this.musicGain.gain.setTargetAtTime(this.musicVol, now, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.sfxVol, now, 0.05);
  }

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04; // soft brown/pinkish noise
      data[i] = last * 3.0;
    }
    return buffer;
  }

  private startAmbience(): void {
    if (!this.ctx || !this.musicGain || this.started) return;
    this.started = true;

    // Creepy indoor poolroom sub-drone
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 180;

    const droneAmp = this.ctx.createGain();
    droneAmp.gain.value = 0.14;

    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc1.type = 'sawtooth';
    this.droneOsc1.frequency.value = 46.2; // Low F#1

    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc2.type = 'triangle';
    this.droneOsc2.frequency.value = 46.9; // Slight eerie beating

    this.droneOsc1.connect(droneFilter);
    this.droneOsc2.connect(droneFilter);
    droneFilter.connect(droneAmp);
    droneAmp.connect(this.musicGain);

    this.droneOsc1.start();
    this.droneOsc2.start();

    // Dynamic chase tension layer
    this.tensionGain = this.ctx.createGain();
    this.tensionGain.gain.value = 0;

    const tensionFilter = this.ctx.createBiquadFilter();
    tensionFilter.type = 'bandpass';
    tensionFilter.frequency.value = 340;
    tensionFilter.Q.value = 3.5;

    this.tensionOsc = this.ctx.createOscillator();
    this.tensionOsc.type = 'sawtooth';
    this.tensionOsc.frequency.value = 98;
    this.tensionOsc.connect(tensionFilter);
    tensionFilter.connect(this.tensionGain);
    this.tensionGain.connect(this.musicGain);
    this.tensionOsc.start();

    // Pool water lapping ambience loop
    if (this.noiseBuffer) {
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = this.noiseBuffer;
      noiseSrc.loop = true;

      this.waterFilter = this.ctx.createBiquadFilter();
      this.waterFilter.type = 'bandpass';
      this.waterFilter.frequency.value = 420;
      this.waterFilter.Q.value = 1.1;

      this.waterGain = this.ctx.createGain();
      this.waterGain.gain.value = 0.08;

      noiseSrc.connect(this.waterFilter);
      this.waterFilter.connect(this.waterGain);
      this.waterGain.connect(this.musicGain);
      noiseSrc.start();
    }
  }

  public updateAtmosphere(
    nowSec: number,
    monsterDist: number,
    alertState: 'calm' | 'searching' | 'chasing',
    inWater: boolean,
    underwater: boolean,
    active: boolean
  ): void {
    if (!this.ctx || !this.tensionGain || !this.tensionOsc || !this.waterFilter || !this.waterGain) {
      return;
    }
    const t = this.ctx.currentTime;

    if (!active) {
      this.tensionGain.gain.setTargetAtTime(0, t, 0.15);
      this.waterGain.gain.setTargetAtTime(0.05, t, 0.2);
      return;
    }

    // Proximity dread curve (0 at >= 26m, 1 at <= 4m)
    const prox = Math.max(0, Math.min(1, 1 - (monsterDist - 4) / 22));
    const alertBoost = alertState === 'chasing' ? 0.35 : alertState === 'searching' ? 0.12 : 0;
    const targetTension = Math.min(0.28, (prox * 0.22 + alertBoost * 0.15));

    this.tensionGain.gain.setTargetAtTime(targetTension, t, 0.12);
    this.tensionOsc.frequency.setTargetAtTime(
      alertState === 'chasing' ? 112 + Math.sin(nowSec * 9) * 6 : 92,
      t,
      0.1
    );

    // Water ambience muffled if underwater
    this.waterFilter.frequency.setTargetAtTime(underwater ? 180 : inWater ? 620 : 420, t, 0.12);
    this.waterGain.gain.setTargetAtTime(inWater ? 0.16 : 0.08, t, 0.12);

    // Monster aquatic growl / breath periodically when nearby or chasing
    const growlCooldown = alertState === 'chasing' ? 2.8 : 6.0;
    if (prox > 0.2 && nowSec - this.lastGrowlTime > growlCooldown) {
      this.lastGrowlTime = nowSec;
      this.playMonsterGrowl(0.14 + prox * 0.25, alertState === 'chasing');
    }

    // Subtle echoing cavern water drips & distant structural groans
    if (!underwater && nowSec >= this.nextDripTime) {
      this.nextDripTime = nowSec + 3.6 + Math.random() * 5.2;
      this.playCavernDrip(0.05 + Math.random() * 0.04);
    }
    if (nowSec >= this.nextGroanTime) {
      this.nextGroanTime = nowSec + 11.5 + Math.random() * 11.0;
      this.playDistantGroan(0.06 + Math.random() * 0.04);
    }
  }

  private playCavernDrip(volume: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const baseFreq = 680 + Math.random() * 520;
    for (let echo = 0; echo < 2; echo++) {
      const start = t + echo * 0.22;
      const amp = volume * (echo === 0 ? 1 : 0.35);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, start);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.55, start + 0.055);
      g.gain.setValueAtTime(0.001, start);
      g.gain.linearRampToValueAtTime(amp, start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.16);
    }
  }

  private playDistantGroan(volume: number): void {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    const f0 = 38 + Math.random() * 14;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.linearRampToValueAtTime(f0 * 0.72, t + 1.85);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(115, t);
    filter.Q.value = 3.2;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 2.05);
  }

  public playStep(sprinting: boolean): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = (sprinting ? 1400 : 1050) + Math.random() * 260;
    filter.Q.value = 2.5;

    const g = this.ctx.createGain();
    const vol = sprinting ? 0.22 : 0.14;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t, Math.random() * 0.8, 0.09);
  }

  public playJump(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(290, t + 0.13);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  public playPush(intensity = 1.0): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const amp = Math.max(0.15, Math.min(1.2, intensity));

    // Punchy low impact thud
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(185, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.16);
    g.gain.setValueAtTime(0.28 * amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.19);

    // Quick air shove whoosh
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(680, t);
      bp.frequency.exponentialRampToValueAtTime(1450, t + 0.12);
      bp.Q.value = 1.4;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.2 * amp, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.sfxGain);
      src.start(t, Math.random() * 0.4, 0.16);
    }
  }

  public playLand(inWater: boolean): void {
    if (inWater) {
      this.playSplash(0.45);
      return;
    }
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t, 0.1, 0.15);
  }

  public playSplash(intensity = 0.35): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(950, t);
    filter.frequency.exponentialRampToValueAtTime(320, t + 0.35);
    filter.Q.value = 0.9;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(intensity, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t, Math.random() * 0.5, 0.45);
  }

  public playPlatformWarn(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.08);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  public playCheckpoint(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const freqs = [440, 554.37, 659.25];
    freqs.forEach((f, idx) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const start = t + idx * 0.07;
      g.gain.setValueAtTime(0.001, start);
      g.gain.linearRampToValueAtTime(0.14, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(start);
      osc.stop(start + 0.48);
    });
  }

  public playVictory(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const freqs = [392, 493.88, 587.33, 783.99];
    freqs.forEach((f, idx) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const start = t + idx * 0.09;
      g.gain.setValueAtTime(0.001, start);
      g.gain.linearRampToValueAtTime(0.18, start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.75);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(start);
      osc.stop(start + 0.8);
    });
  }

  public playSerpentHiss(volume = 0.28, aggressive = false): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(aggressive ? 3200 : 2100, t);
    bp.frequency.exponentialRampToValueAtTime(aggressive ? 1400 : 950, t + 0.65);
    bp.Q.value = aggressive ? 3.2 : 2.2;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.68);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    src.start(t, Math.random() * 0.6, 0.72);
  }

  public playSerpentEmerge(volume = 0.55): void {
    if (!this.ctx || !this.sfxGain) return;
    this.playSplash(volume * 0.95);
    this.playSerpentHiss(volume * 0.75, true);

    const t = this.ctx.currentTime;
    const sub = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(92, t);
    sub.frequency.exponentialRampToValueAtTime(36, t + 0.45);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(volume * 0.6, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    sub.connect(g);
    g.connect(this.sfxGain);
    sub.start(t);
    sub.stop(t + 0.52);
  }

  public playMonsterGrowl(volume = 0.25, aggressive = false): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc2.type = 'square';
    const baseFreq = aggressive ? 86 : 52;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.linearRampToValueAtTime(baseFreq * 0.68, t + 0.68);
    osc2.frequency.setValueAtTime(baseFreq * 1.09, t);
    osc2.frequency.linearRampToValueAtTime(baseFreq * 0.64, t + 0.68);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(aggressive ? 540 : 230, t);

    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.72);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 0.74);
    osc2.stop(t + 0.74);

    if (aggressive) {
      this.playSerpentHiss(volume * 0.85, true);
    }
  }

  public playJumpscare(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    // Piercing dissonant serpent shriek + hiss layers
    const shriekFreqs = [380, 540, 790, 1180];
    shriekFreqs.forEach((f) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * 0.82, t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.48, t + 0.12);
      osc.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.95);
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.05);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 1.1);
    });

    // Sharp fang-bite snap transient
    const snap = this.ctx.createOscillator();
    const snapG = this.ctx.createGain();
    snap.type = 'triangle';
    snap.frequency.setValueAtTime(1600, t);
    snap.frequency.exponentialRampToValueAtTime(140, t + 0.09);
    snapG.gain.setValueAtTime(0.55, t);
    snapG.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    snap.connect(snapG);
    snapG.connect(this.sfxGain);
    snap.start(t);
    snap.stop(t + 0.12);

    // Sub-bass impact slam
    const sub = this.ctx.createOscillator();
    const subG = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(125, t);
    sub.frequency.exponentialRampToValueAtTime(26, t + 0.65);
    subG.gain.setValueAtTime(0.7, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    sub.connect(subG);
    subG.connect(this.sfxGain);
    sub.start(t);
    sub.stop(t + 0.9);

    // Rushing water splash + serpent hiss noise burst
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2400, t);
      bp.frequency.exponentialRampToValueAtTime(420, t + 0.65);
      bp.Q.value = 0.9;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.sfxGain);
      src.start(t, 0, 0.85);
    }
  }

  public playEatingStrike(volume = 1.0): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const v = Math.max(0.15, Math.min(1.1, volume));

    // Heavy jaw clamp slam + bone-crunch snap
    const snap = this.ctx.createOscillator();
    const snapG = this.ctx.createGain();
    snap.type = 'triangle';
    snap.frequency.setValueAtTime(1280, t);
    snap.frequency.exponentialRampToValueAtTime(95, t + 0.14);
    snapG.gain.setValueAtTime(0.42 * v, t);
    snapG.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    snap.connect(snapG);
    snapG.connect(this.sfxGain);
    snap.start(t);
    snap.stop(t + 0.18);

    // Sub-bass water-erupting lunge thump
    const sub = this.ctx.createOscillator();
    const subG = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(108, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.55);
    subG.gain.setValueAtTime(0.55 * v, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    sub.connect(subG);
    subG.connect(this.sfxGain);
    sub.start(t);
    sub.stop(t + 0.7);

    // Visceral serpent snarl + splash burst
    this.playMonsterGrowl(0.32 * v, true);
    this.playSplash(0.45 * v);
  }

  public playSwallowGulp(stage = 1, volume = 1.0): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const v = Math.max(0.12, Math.min(1.0, volume));
    const pitchScale = stage >= 2 ? 0.78 : 1.0;

    // Deep resonant throat gulp envelope
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(135 * pitchScale, t);
    osc.frequency.exponentialRampToValueAtTime(54 * pitchScale, t + 0.24);
    osc.frequency.exponentialRampToValueAtTime(38 * pitchScale, t + 0.38);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(460, t);
    filter.frequency.exponentialRampToValueAtTime(140, t + 0.36);
    filter.Q.value = 4.2;

    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.34 * v, t + 0.045);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.45);

    // Jaw snap / wet throat click
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(620 * pitchScale, t);
      bp.frequency.exponentialRampToValueAtTime(220, t + 0.22);
      bp.Q.value = 2.0;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.24 * v, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.sfxGain);
      src.start(t, Math.random() * 0.4, 0.28);
    }
  }

  public dispose(): void {
    try {
      this.droneOsc1?.stop();
      this.droneOsc2?.stop();
      this.tensionOsc?.stop();
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close();
      }
    } catch {
      // ignore
    }
    this.ctx = null;
  }
}
