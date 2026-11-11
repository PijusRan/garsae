// Tape flute: two voices of the STK flute (Cook and Scavone's Synthesis ToolKit), a jet-driven waveguide. The breath
// blows across the embouchure; the jet takes a moment to cross it, then the jet table (x³ - x) turns it into a push
// into the bore, whose reflection comes back through a lowpass and feeds the jet again. Every delay is worked out in
// samples from the sample rate, with the reflection filter's phase delay taken off, so it plays in tune at any rate.
// The breath carries the vibrato, as a flautist's does, and a little air noise. A slow wow on the pitch is the tape.
import("stdfaust.lib");

N = 2;

stkFlute(freq, breath) = (step ~ _) : !, _
with {
  // STK sets the bore for two-thirds of the note: the jet drives it into its second mode.
  lf = freq * 0.66666;
  w = 2 * ma.PI * lf / ma.SR;
  // Phase delay of the bore's reflection filter, 0.3 / (1 - 0.7 z^-1), at the note.
  filterDelay = atan2(0.7 * sin(w), 1 - 0.7 * cos(w)) / w;
  bore = ma.SR / lf - filterDelay - 1;
  step(fb) = push, 0.3 * out
  with {
    out = fb : de.fdelay(4096, bore - 1);
    reflection = out : *(0.3) : fi.pole(0.7) : *(-1) : fi.dcblocker;
    jet = breath - 0.5 * reflection : de.fdelay(4096, bore * 0.32);
    push = jet * (jet * jet - 1) : max(-1) : min(1) : +(0.5 * reflection);
  };
};

// The jet and the interpolated delays leave it 30-60 cents sharp: measured, it sounds a period of 0.9862 times the
// asked-for one, less 18 µs, at 44.1 and 48 kHz alike. Ask for the note that comes out right.
tuned(f) = 0.9862 / (1 / f + 0.000018);

voice(i) = stkFlute(tuned(freq * wow), blow) * 0.6
with {
  freq = hslider("freq%i", 440, 50, 2000, 0.001);
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.8, 0, 1, 0.001);
  // Blown in over a tenth of a second; let go a little faster.
  breath = gate * (1.1 + 0.2 * vel) : si.smooth(ba.tau2pole(0.08));
  // The vibrato only arrives once the note has settled.
  late = gate : si.smooth(ba.tau2pole(0.5));
  vibrato = os.osc(4.7 + 0.2 * i) * 0.04 * late * late;
  air = no.noise * 0.08;
  blow = breath * (1 + vibrato + air);
  wow = 1 + 0.003 * os.osc(0.55);
};

pan(i) = _ <: *(sqrt(1 - p)), *(sqrt(p)) with { p = 0.4 + 0.2 * i; };

process = par(i, N, voice(i) : pan(i)) :> _, _;
