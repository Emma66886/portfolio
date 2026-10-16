/**
 * A tiny synthesiser for game sound effects, so no game ships audio files.
 * The context is only created from a user gesture (starting a game), which is
 * what browsers require before any audio can play. Everything plays through
 * one master gain, so muting also silences a game's continuous voices.
 */
export function createSynth() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;

  return {
    unlock() {
      if (!ctx) {
        const Ctor =
          window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 1;
        master.connect(ctx.destination);
      }
      if (ctx.state === "suspended") void ctx.resume();
    },
    setMuted(value: boolean) {
      muted = value;
      if (ctx && master) master.gain.setTargetAtTime(value ? 0 : 1, ctx.currentTime, 0.02);
    },
    /** For a game's own continuous voices. Null until unlocked. */
    get context() {
      return ctx;
    },
    get output() {
      return master;
    },
    /** A short note that slides down in pitch as it fades: a knock, a click or a chime. */
    tone(
      freq: number,
      { gain = 0.1, length = 0.08, delay = 0, slide = 0.55, type = "sine" as OscillatorType } = {}
    ) {
      if (!ctx || !master || muted) return;
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * slide, t + length);
      amp.gain.setValueAtTime(gain, t);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(amp).connect(master);
      osc.start(t);
      osc.stop(t + length + 0.02);
    },
    dispose() {
      void ctx?.close();
      ctx = null;
      master = null;
    },
  };
}
