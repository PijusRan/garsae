// Muted bass (a listening-test candidate): two voices of a short-scale bass with old flatwound strings and foam under
// them at the bridge, as on 1960s soul records: a waveguide string damped so hard it barely rings, dark from the
// first moment, plucked with the thumb, with the thump of the thumb landing.
import("stdfaust.lib");

N = 2;

voice(i) = (thumb : string) + thud : *(0.6)
with {
  freq = hslider("freq%i", 55, 20, 1000, 0.001);
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.8, 0, 1, 0.001);
  h = gate : ba.impulsify;
  fall(t60) = h : (max ~ *(exp(-6.9078 / max(1, t60 * ma.SR))));
  period = ma.SR / freq;
  soft = 250 + 350 * vel;
  pulse = h * vel * 40 : fi.lowpass(2, soft) : fi.lowpass(2, soft);
  thumb = pulse <: _, de.fdelay(4096, period * 0.25) : -;
  held = gate > 0;
  t60 = select2(held, 0.05, 0.38);
  a = select2(held, 0.75, 0.55);
  w = 2 * ma.PI * freq / ma.SR;
  phase = atan2(a * sin(w), 1 - a * cos(w)) / w;
  mag = (1 - a) / sqrt(1 - 2 * a * cos(w) + a * a);
  loss = pow(10, -3 / (t60 * freq)) / mag;
  string = + ~ (de.fdelay(4096, period - 1 - phase) : *(loss) : fi.pole(a) : *(1 - a));
  thud = no.noises(2, i) : fi.lowpass(2, 420) : *(fall(0.03) * vel * 0.5);
};

pan(i) = _ <: *(sqrt(1 - p)), *(sqrt(p)) with { p = 0.48 + 0.04 * i; };

process = par(i, N, voice(i) : pan(i)) :> _, _;
