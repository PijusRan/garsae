// Vibraphone: six voices of modal synthesis. A yarn mallet (a soft pulse, brighter when harder) strikes an aluminium
// bar, whose modes are tuned to 1, 4 and 10 times the fundamental, with a slightly mistuned twin of the fundamental
// that beats slowly. The tile's motor (the rotating discs over the resonators) is added after, in the tile.
import("stdfaust.lib");

N = 6;

voice(i) = mallet <: mode(1, 0, 1, 1), mode(1, 2.5, 0.35, 0.8), mode(4, 0, 0.3 * vel, 0.2), mode(10, 0, 0.09 * vel, 0.07) :> *(0.2)
with {
  freq = hslider("freq%i", 440, 20, 4000, 0.001);
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.6, 0, 1, 0.001);
  soft = 900 + 4000 * vel * vel;
  mallet = gate : ba.impulsify : *(vel) : fi.lowpass(2, soft);
  ring = 4.2 * sqrt(262 / freq) : max(1.8) : min(5);
  mode(ratio, cents, level, decay) = pm.modeFilter(f, ring * decay, select2(f < ma.SR / 2 - 200, 0, level))
  with {
    f = freq * ratio * pow(2, cents / 1200);
  };
};

pan(i) = _ <: *(sqrt(1 - p)), *(sqrt(p)) with { p = 0.3 + 0.4 * i / (N - 1); };

process = par(i, N, voice(i) : pan(i)) :> _, _;
