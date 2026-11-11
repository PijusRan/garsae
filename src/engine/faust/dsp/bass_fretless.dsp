// Fretless bass (a listening-test candidate): two voices of an electric bass string, a waveguide loop like the walking
// bass's but brighter and longer-ringing (steel, a solid body). The finger arrives a little flat and slides up to the
// note; the string buzzing along the bare fingerboard gives the "mwah", a resonance sweeping down through the note;
// held notes take a slow vibrato. The magnetic pickup near the bridge hears the string through its own comb.
import("stdfaust.lib");

N = 2;

voice(i) = finger : string : pickup : mwah : fi.lowpass(2, 4200) : *(0.5)
with {
  freq = hslider("freq%i", 55, 20, 1000, 0.001);
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.8, 0, 1, 0.001);
  h = gate : ba.impulsify;
  fall(t60) = h : (max ~ *(exp(-6.9078 / max(1, t60 * ma.SR))));
  // Up from 38 cents flat in a few tens of milliseconds; then, on a held note, a vibrato that grows in.
  slide = 1 - 0.022 * fall(0.24);
  vibrato = 1 + 0.0052 * os.osc(4.6) * (1 - fall(0.9)) * (gate > 0);
  f = freq * slide * vibrato;
  period = ma.SR / freq;
  soft = 300 + 900 * vel;
  pulse = h * vel * 40 : fi.lowpass(2, soft) : fi.lowpass(2, soft);
  finger = pulse <: _, de.fdelay(4096, period * 0.3) : -;
  held = gate > 0;
  ring = 3.5 * sqrt(55 / freq) : max(1.5) : min(5);
  t60 = select2(held, 0.12, ring);
  a = select2(held, 0.6, 0.25);
  w = 2 * ma.PI * freq / ma.SR;
  phase = atan2(a * sin(w), 1 - a * cos(w)) / w;
  mag = (1 - a) / sqrt(1 - 2 * a * cos(w) + a * a);
  loss = pow(10, -3 / (t60 * freq)) / mag;
  string = + ~ (de.fdelay(4096, ma.SR / f - 1 - phase) : *(loss) : fi.pole(a) : *(1 - a));
  pickup = _ <: _, de.fdelay(4096, period * 0.12) : -;
  mwah = fi.peak_eq(8 * vel, freq * (2.2 + 3.8 * fall(0.5)), freq * 1.2);
};

pan(i) = _ <: *(sqrt(1 - p)), *(sqrt(p)) with { p = 0.48 + 0.04 * i; };

process = par(i, N, voice(i) : pan(i)) :> _, _;
