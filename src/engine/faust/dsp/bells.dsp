// Glass bells: four voices of modal synthesis. A hard mallet strikes a free bar, whose modes fall at 1, 2.756 and
// 5.404 times the fundamental (an ideal free bar, as on a glockenspiel), each dying faster than the one below, with a
// twin of the fundamental a few cents sharp that beats slowly against it.
import("stdfaust.lib");

N = 4;

voice(i) = mallet <: mode(1, 0, 1, 4.2), mode(1, 4, 0.45, 3.3), mode(2.756, 0, 0.36 * vel, 1.4), mode(5.404, 0, 0.13 * vel, 0.42) :> *(0.15)
with {
  freq = hslider("freq%i", 880, 20, 6000, 0.001);
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.6, 0, 1, 0.001);
  mallet = gate : ba.impulsify : *(vel) : fi.lowpass(2, 7000);
  mode(ratio, cents, level, t60) = pm.modeFilter(f, t60, select2(f < ma.SR / 2 - 200, 0, level))
  with {
    f = freq * ratio * pow(2, cents / 1200);
  };
};

pan(i) = _ <: *(sqrt(1 - p)), *(sqrt(p)) with { p = 0.15 + 0.7 * i / (N - 1); };

process = par(i, N, voice(i) : pan(i)) :> _, _;
