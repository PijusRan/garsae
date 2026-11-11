// Walking bass: two voices of a plucked upright, in commuted synthesis (Smith; Karjalainen and Välimäki). The finger
// is a soft rounded pulse, combed by where it plucks the string; it passes through the body's main resonances (the
// air cavity near 60 Hz, the plates around 100-400 Hz) on its way into the string, which is cheaper than putting the
// body after the string and sounds the same. The string is a waveguide loop one period long whose lowpass makes the
// upper harmonics die first, as on a real bass, and its delay is trimmed by that filter's phase delay so it plays in
// tune. A firm pluck stretches the string and bends the note a few cents sharp for a moment. Letting go damps it.
import("stdfaust.lib");

N = 2;
BODY_F = (58, 98, 142, 205, 290, 410);
BODY_G = (0.7, 1, 0.55, 0.4, 0.25, 0.15);
BODY_T = (0.2, 0.13, 0.1, 0.08, 0.06, 0.05);

voice(i) = finger : body : string : fi.lowpass(2, 2000) : *(0.5)
with {
  freq = hslider("freq%i", 98, 20, 1000, 0.001);
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.8, 0, 1, 0.001);
  hit = gate : ba.impulsify;
  period = ma.SR / freq;

  // The flesh of the finger: a wide pulse, a little narrower when plucked harder. Plucked about a fifth of the way
  // from the end of the fingerboard, which notches out every fifth harmonic or so.
  soft = 200 + 500 * vel;
  pulse = hit * vel * 40 : fi.lowpass(2, soft) : fi.lowpass(2, soft);
  finger = pulse <: _, de.fdelay(4096, period * 0.22) : -;

  body = _ <: _, par(k, 6, pm.modeFilter(ba.take(k + 1, BODY_F), ba.take(k + 1, BODY_T), ba.take(k + 1, BODY_G) * BODY)) :> _;
  // About as much body as string in the attack.
  BODY = 0.0035;

  // The loop: a one-pole lowpass (darker once the finger damps the string) and a gain set from the T60 at the note.
  held = gate > 0;
  ring = 1.8 * sqrt(55 / freq) : max(0.8) : min(2.2);
  t60 = select2(held, 0.08, ring);
  a = select2(held, 0.7, 0.42 - 0.12 * vel);
  w = 2 * ma.PI * freq / ma.SR;
  phase = atan2(a * sin(w), 1 - a * cos(w)) / w;
  mag = (1 - a) / sqrt(1 - 2 * a * cos(w) + a * a);
  loss = pow(10, -3 / (t60 * freq)) / mag;
  bend = hit : en.ar(0.0005, 0.12) : *(0.007 * vel);
  delay = ma.SR / (freq * (1 + bend)) - 1 - phase;
  string = + ~ (de.fdelay(4096, delay) : *(loss) : fi.pole(a) : *(1 - a));
};

pan(i) = _ <: *(sqrt(1 - p)), *(sqrt(p)) with { p = 0.47 + 0.06 * i; };

process = par(i, N, voice(i) : pan(i)) :> _, _;
