/**
 * Synthesised sound effects, so the game ships no audio files. The context is
 * only created from a user gesture (starting a match), which is what browsers
 * require before any audio can play.
 */
export function createSound() {
  let ctx: AudioContext | null = null;
  let muted = false;

  const unlock = () => {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
  };

  /** A short pitched knock: a sine with a fast pitch drop and decay. */
  const knock = (freq: number, gain: number, length: number, delay = 0) => {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + length);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + length + 0.02);
  };

  return {
    unlock,
    setMuted(value: boolean) {
      muted = value;
    },
    hit(power: number) {
      knock(780 + power * 260, 0.22, 0.07);
    },
    bounce() {
      knock(520, 0.12, 0.06);
    },
    point(won: boolean) {
      if (won) {
        knock(660, 0.1, 0.16);
        knock(990, 0.1, 0.22, 0.09);
      } else {
        knock(440, 0.1, 0.16);
        knock(300, 0.1, 0.24, 0.1);
      }
    },
    dispose() {
      void ctx?.close();
      ctx = null;
    },
  };
}
