// Felt piano: eight voices of modal synthesis. Each note is a felt hammer (a soft, rounded pulse; harder strokes are
// shorter and brighter) striking a bank of resonators tuned to a stiff string's partials, f(n) = n·f·√(1 + B·n²).
// Each of the three lowest partials is a pair of slightly mistuned strings, one dying fast and one slow: the double decay and the slow
// beating of a real unison. Higher partials die sooner, low notes ring longest, and letting go of the key brings the
// damper down.
import("stdfaust.lib");

N = 8;
K = 10;
B = 0.00032;
// Partial n's level, exp(-0.45 (n - 1)) / n, written out: as an expression it is worked out every sample.
LEVELS = (1.0000, 0.3188, 0.1355, 0.0648, 0.0331, 0.0176, 0.0096, 0.0054, 0.0030, 0.0017);

voice(i) = hammer <: par(k, K, partial(k + 1)) :> +(thud) : *(0.3)
with {
  freq = hslider("freq%i", 220, 20, 4000, 0.001);
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.6, 0, 1, 0.001);
  strike = gate : ba.impulsify;
  // Felt: the harder the stroke, the shorter the contact and the more partials it reaches.
  soft = 500 + 3000 * vel * vel;
  hammer = strike * vel : fi.lowpass(2, soft) : fi.lowpass(2, soft);
  ring = 7 * sqrt(220 / freq) : max(2.5) : min(9);
  // The damper: a short ring-out once the key is up.
  damped(t) = select2(gate > 0, 0.35, t);
  partial(n) = unison(n <= 3)
  with {
    unison(1) = _ <: pm.modeFilter(fn * 0.99992, damped(t60 * 0.35), level * 0.55),
                     pm.modeFilter(fn * 1.00008, damped(t60), level * 0.45) :> _;
    unison(0) = pm.modeFilter(fn, damped(t60 * 0.6), level);
    fn = n * freq * sqrt(1 + B * n * n);
    t60 = ring / (1 + 0.6 * (n - 1));
    level = select2(fn < ma.SR / 2 - 200, 0, ba.take(n, LEVELS));
  };
  thud = strike * vel : fi.lowpass(2, 1500) : fi.lowpass(2, 1500) : *(6);
};

pan(i) = _ <: *(sqrt(1 - p)), *(sqrt(p)) with { p = 0.25 + 0.5 * i / (N - 1); };

process = par(i, N, voice(i) : pan(i)) :> _, _;
