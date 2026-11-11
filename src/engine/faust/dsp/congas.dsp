// Congas: four voices of modal synthesis on a circular membrane. The modes of a drum head fall at the zeros of the
// Bessel functions (1, 1.59, 2.14, 2.30, 2.65, ...), not at harmonics, which is what makes a drum a drum. The hand is
// a soft pulse: an open tone rings, a slap is a sharp pulse with a pop of skin noise that wakes the upper modes and
// dies fast, a muted stroke presses the head and damps everything. The head's pitch drops a little as it relaxes.
import("stdfaust.lib");

N = 4;
MODES = (1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501, 3.6, 3.652);
OPEN = (1, 0.55, 0.42, 0.3, 0.26, 0.2, 0.16, 0.13, 0.1, 0.08);
SLAP = (0.5, 0.5, 0.55, 0.5, 0.5, 0.45, 0.42, 0.4, 0.36, 0.33);

voice(i) = hand <: par(k, 10, mode(k)) :> +(pop) : *(0.2)
with {
  freq = hslider("freq%i", 220, 40, 1000, 0.001);
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.7, 0, 1, 0.001);
  // 0 open tone, 1 slap, 2 muted.
  stroke = hslider("stroke%i", 0, 0, 2, 1);
  hit = gate : ba.impulsify;
  slap = stroke == 1;
  muted = stroke == 2;
  soft = select2(slap, select2(muted, 900, 500), 3500);
  hand = hit * vel : fi.lowpass(2, soft) : fi.lowpass(2, soft);
  sag = hit : en.ar(0.0005, 0.06) : *(0.035);
  t60(k) = 0.5 / (1 + 0.45 * k) * select2(muted, select2(slap, 1, 0.45), 0.18);
  level(k) = select2(slap, ba.take(k + 1, OPEN), ba.take(k + 1, SLAP));
  mode(0) = pm.modeFilter(freq * (1 + sag), t60(0), level(0));
  mode(k) = pm.modeFilter(freq * ba.take(k + 1, MODES), t60(k), level(k));
  pop = hit * vel * slap : en.ar(0.001, 0.05) : *(no.noise) : fi.resonbp(2000, 1.2, 1) : *(0.6);
};

pan(i) = _ <: *(sqrt(1 - p)), *(sqrt(p)) with { p = 0.55 + 0.1 * i / (N - 1); };

process = par(i, N, voice(i) : pan(i)) :> _, _;
