// Walking bass: two voices of an upright's plucked string (Karplus-Strong, extended). A finger is a soft pulse, combed
// by where it plucks along the string; the string is a delay line one period long with a loss filter, its decay set
// as a T60 so low notes ring longer, damped quickly when the note is let go. Two broad body resonances give it wood.
import("stdfaust.lib");

N = 2;

voice(i) = finger : string : body : *(8)
with {
  freq = hslider("freq%i", 98, 20, 1000, 0.001);
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.8, 0, 1, 0.001);
  period = ma.SR / freq;
  pulse = gate : ba.impulsify : *(vel) : fi.lowpass(2, 350 + 900 * vel);
  // Plucked a fifth of the way along: that notch in the spectrum is the finger's place.
  finger = pulse <: _, de.fdelay(4096, period * 0.2) : -;
  ring = 2.2 * sqrt(98 / freq) : max(0.9) : min(3);
  t60 = select2(gate > 0, 0.09, ring);
  loss = pow(10, -3 / (t60 * freq));
  // The loop: one period in all, with the averaging filter's half sample.
  string = + ~ (de.fdelay(4096, period - 1.5) : (_ <: _, mem :> _) : *(0.5 * loss));
  body = _ <: _, fi.resonbp(105, 2.5, 0.8), fi.resonbp(240, 2, 0.5) :> fi.lowpass(2, 2600);
};

pan(i) = _ <: *(sqrt(1 - p)), *(sqrt(p)) with { p = 0.48 + 0.04 * i; };

process = par(i, N, voice(i) : pan(i)) :> _, _;
