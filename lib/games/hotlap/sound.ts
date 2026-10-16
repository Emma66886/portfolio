import { createSynth } from "@/lib/games/audio";

type Voices = {
  engine: { low: OscillatorNode; high: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };
  screech: GainNode;
  rumble: GainNode;
};

/**
 * Engine note (two detuned oscillators through a filter that opens with the
 * throttle), tyre squeal and gravel rumble (filtered noise), plus one-shot
 * beeps for the start, laps and impacts.
 */
export function createSound() {
  const synth = createSynth();
  let voices: Voices | null = null;

  const build = () => {
    const ctx = synth.context;
    const out = synth.output;
    if (!ctx || !out || voices) return;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const low = ctx.createOscillator();
    low.type = "sawtooth";
    const high = ctx.createOscillator();
    high.type = "square";
    low.connect(filter);
    high.connect(filter);
    filter.connect(gain).connect(out);
    low.start();
    high.start();

    // One second of white noise, looped, shared by the squeal and the rumble.
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(out);
      src.start();
      return g;
    };

    voices = {
      engine: { low, high, filter, gain },
      screech: noise("bandpass", 2300, 4),
      rumble: noise("lowpass", 260, 1),
    };
  };

  const set = (param: AudioParam, value: number) => {
    const ctx = synth.context;
    if (ctx) param.setTargetAtTime(value, ctx.currentTime, 0.04);
  };

  return {
    unlock() {
      synth.unlock();
      build();
    },
    setMuted: synth.setMuted,
    /** Called every frame while driving. */
    drive(car: { rpm: number; throttle: number; slip: number; speed: number; offTrack: boolean }) {
      if (!voices) return;
      const f = 42 + car.rpm * 150;
      set(voices.engine.low.frequency, f);
      set(voices.engine.high.frequency, f * 1.505);
      set(voices.engine.filter.frequency, 380 + car.throttle * 1500 + car.rpm * 700);
      set(voices.engine.gain.gain, 0.035 + car.throttle * 0.05 + car.rpm * 0.02);
      const squeal = Math.min(1, Math.max(0, (Math.abs(car.slip) - 3.5) / 6));
      set(voices.screech.gain, car.offTrack ? 0 : squeal * 0.07);
      set(voices.rumble.gain, car.offTrack ? Math.min(1, Math.abs(car.speed) / 25) * 0.18 : 0);
    },
    /** Silence the continuous voices (menus, pause). */
    quiet() {
      if (!voices) return;
      set(voices.engine.gain.gain, 0);
      set(voices.screech.gain, 0);
      set(voices.rumble.gain, 0);
    },
    count() {
      synth.tone(660, { gain: 0.12, length: 0.25, slide: 1, type: "square" });
    },
    go() {
      synth.tone(1320, { gain: 0.12, length: 0.5, slide: 1, type: "square" });
    },
    lap(best: boolean) {
      synth.tone(880, { gain: 0.09, length: 0.18, slide: 1 });
      synth.tone(best ? 1320 : 1100, { gain: 0.09, length: 0.3, slide: 1, delay: 0.1 });
    },
    hit(impact: number) {
      synth.tone(120, { gain: Math.min(0.3, 0.08 + impact * 0.015), length: 0.22, slide: 0.5 });
    },
    finish() {
      [784, 988, 1175, 1568].forEach((f, i) => synth.tone(f, { gain: 0.08, length: 0.3, slide: 1, delay: i * 0.09 }));
    },
    dispose: synth.dispose,
  };
}
