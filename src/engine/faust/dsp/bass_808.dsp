// 808 bass (a listening-test candidate): two voices of the TR-808 bass drum's bridged-T resonator, tuned to the note
// and rung by a pulse. Its pitch starts high and falls to the note in tens of milliseconds (the punch), then it booms
// for as long as the note is held ("len" seconds to fade), and is choked when let go.
import("stdfaust.lib");

N = 2;

voice(i) = h * vel * 30 : fi.lowpass(2, 2000) : pm.modeFilter(f, t60, 1) : *(0.02)
with {
  freq = hslider("freq%i", 55, 20, 1000, 0.001);
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.8, 0, 1, 0.001);
  len = hslider("len%i", 1, 0.05, 4, 0.001);
  h = gate : ba.impulsify;
  fall(t) = h : (max ~ *(exp(-6.9078 / max(1, t * ma.SR))));
  f = freq * (1 + 1.1 * fall(0.1));
  t60 = select2(gate > 0, 0.03, len);
};

process = par(i, N, voice(i)) :> _ <: _, _;
