/** Small synthesized sounds (Web Audio), so no audio files are needed. Browsers only allow sound after a tap or key press. */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

/** Call from a tap, click or key handler: creates and resumes the audio context while the gesture is still active. */
export function unlockAudio(): void {
  // iPhone: with the ring switch on silent, web audio stays muted unless the page asks for "playback" (Safari 16.4+)
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
  void context()?.resume();
}

/** One "haf": a falling, slightly rough voice plus a short breath of noise at the start. */
export function buildBark(ac: BaseAudioContext, out: AudioNode, t0: number, pitch = 1): void {
  const voice = ac.createOscillator();
  voice.type = 'sawtooth';
  voice.frequency.setValueAtTime(560 * pitch, t0);
  voice.frequency.exponentialRampToValueAtTime(190 * pitch, t0 + 0.17);

  const formant = ac.createBiquadFilter();
  formant.type = 'bandpass';
  formant.frequency.setValueAtTime(1100, t0);
  formant.frequency.exponentialRampToValueAtTime(650, t0 + 0.17);
  formant.Q.value = 1.4;

  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.9, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.19);

  voice.connect(formant).connect(env).connect(out);
  voice.start(t0);
  voice.stop(t0 + 0.2);

  const len = Math.floor(ac.sampleRate * 0.09);
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const breath = ac.createBufferSource();
  breath.buffer = buffer;
  const air = ac.createBiquadFilter();
  air.type = 'bandpass';
  air.frequency.value = 1700;
  air.Q.value = 0.8;
  const airEnv = ac.createGain();
  airEnv.gain.setValueAtTime(0.0001, t0);
  airEnv.gain.exponentialRampToValueAtTime(0.35, t0 + 0.008);
  airEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
  breath.connect(air).connect(airEnv).connect(out);
  breath.start(t0);
}

/** "Haf haf!": two barks, the second a little higher. */
export function playBark(): void {
  const ac = context();
  if (!ac) return;
  void ac.resume().then(() => {
    const master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(ac.destination);
    const t = ac.currentTime + 0.02;
    buildBark(ac, master, t, 1);
    buildBark(ac, master, t + 0.26, 1.08);
  });
}
