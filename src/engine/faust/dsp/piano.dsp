// Felt piano: eight voices of modal synthesis, with more of what makes a piano a piano.
// The strings: inharmonicity grows toward the treble, the lowest partials are three strings (two ringing long and
// slightly apart, one dying quickly: the double decay and the beating), and the hammer strikes a seventh of the way
// along, which thins out partials 7, 14, ... Higher partials die sooner, and harder strokes reach more of them.
// The felt: a soft pulse plus a little filtered noise for the contact, and the whole note warmed by a lowpass that
// opens with the stroke. The soundboard: a few low wooden resonances excited by the hammer, so notes have a body.
import("stdfaust.lib");

N = 8;
K = 12;
// Partial n's level, exp(-0.4 (n - 1)) / n, written out: as an expression it is worked out every sample.
LEVELS = (1.0000, 0.3352, 0.1496, 0.0752, 0.0405, 0.0227, 0.0132, 0.0078, 0.0047, 0.0029, 0.0018, 0.0011);

voice(i) = hammer <: (par(k, K, partial(k + 1)) :> +), board :> +(thud) : *(0.3) : fi.lowpass(1, warm)
with {
  freq = hslider("freq%i", 220, 20, 4000, 0.001);
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.6, 0, 1, 0.001);
  strike = gate : ba.impulsify;
  soft = 450 + 3200 * vel * vel;
  hammer = strike * vel : fi.lowpass(2, soft) : fi.lowpass(2, soft);
  warm = 2600 + 6000 * vel * vel + freq;
  // The contact: a few milliseconds of noise, brighter for the harder stroke.
  tick = (strike * vel : fi.lowpass(1, 300)) * no.noise : fi.lowpass(2, 1200 + 2500 * vel) : *(0.5);
  // Inharmonicity B: small in the bass, ten times larger across the top of the range.
  B = 0.00012 * (1 + 3 * (freq / 261.6) : min(30));
  ring = 7.5 * sqrt(220 / freq) : max(2.5) : min(10);
  damped(t) = select2(gate > 0, 0.3, t);
  partial(n) = (_ + tick) : strings(n <= 3)
  with {
    strings(1) = _ <: pm.modeFilter(fn * 0.99985, damped(t60), level * 0.36),
                      pm.modeFilter(fn * 1.00015, damped(t60 * 1.05), level * 0.34),
                      pm.modeFilter(fn, damped(t60 * 0.28), level * 0.3) :> _;
    strings(0) = pm.modeFilter(fn, damped(t60 * 0.6), level);
    fn = n * freq * sqrt(1 + B * n * n);
    t60 = ring / (1 + 0.55 * (n - 1));
    // The hammer's place along the string: partials with a node there are not excited.
    comb = abs(sin(ma.PI * n / 7)) : max(0.08);
    level = select2(fn < ma.SR / 2 - 200, 0, ba.take(n, LEVELS) * comb);
  };
  // The soundboard's low modes, rung by the hammer.
  board = _ <: pm.modeFilter(105, 0.35, 0.35), pm.modeFilter(190, 0.3, 0.3), pm.modeFilter(330, 0.22, 0.2), pm.modeFilter(560, 0.15, 0.12) :> _;
  thud = strike * vel : fi.lowpass(2, 1400) : fi.lowpass(2, 1400) : *(5);
};

pan(i) = _ <: *(sqrt(1 - p)), *(sqrt(p)) with { p = 0.25 + 0.5 * i / (N - 1); };

process = par(i, N, voice(i) : pan(i)) :> _, _;
