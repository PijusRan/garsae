// Warm flute: an alto flute played softly, additively. A round fundamental with a few quiet low harmonics (an alto
// flute's second is the strongest, the rest fall away fast), a breath that blooms in slowly and a little dark air
// that follows the pitch. No jet, so no edge: nothing here can overblow or whistle. The vibrato arrives late and is
// shallow, and each note starts a touch under pitch and settles, as a player's does.
import("stdfaust.lib");

N = 2;

voice(i) = (tone * 0.9 + air) * env * (0.55 + 0.45 * vel) * 0.5 : fi.lowpass(2, 2400)
with {
  freq = hslider("freq%i", 440, 50, 2000, 0.001);
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.8, 0, 1, 0.001);
  // Breathed in over about a quarter of a second, let go a little quicker.
  env = gate : si.smooth(ba.tau2pole(0.11));
  late = gate : si.smooth(ba.tau2pole(0.6));
  settle = 1 - 0.006 * (1 - env);
  vibrato = 1 + os.osc(4.6 + 0.2 * i) * 0.004 * late * late;
  f = freq * vibrato * settle;
  tone = os.osc(f) + 0.24 * os.osc(2 * f) + 0.07 * os.osc(3 * f) + 0.02 * os.osc(4 * f);
  air = no.noise : fi.bandpass(1, 1.5 * freq, 5 * freq) : *(0.03 * env);
};

pan(i) = _ <: *(sqrt(1 - p)), *(sqrt(p)) with { p = 0.4 + 0.2 * i; };

process = par(i, N, voice(i) : pan(i)) :> _, _;
