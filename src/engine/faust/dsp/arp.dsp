// Soft arpeggio: five voices of a marimba, after Faust's (pm.marimbaBarModel and pm.marimbaResTube): a yarn mallet
// strikes a rosewood bar near its centre, over a tuned resonator tube. The bar's first twelve measured modes, with the
// library's frequencies, gains and decay curve; the soft mallet hardly reaches the other thirty-eight, so they are left
// out (a quarter of the cost). Low bars ring longer.
import("stdfaust.lib");

N = 5;
RATIOS = (1, 3.31356, 3.83469, 8.06313, 9.44778, 14.1169, 18.384, 21.0102, 26.1775, 28.9944, 37.0728, 37.8703);
GAINS = (1, 0.776725, 0.625723, 0.855223, 0.760159, 0.698373, 0.768011, 0.641127, 0.244034, 0.707754, 0.634013, 0.247527);

bar(freq, t60) = _ <: par(k, 12, mode(k)) :> /(12)
with {
  mode(k) = pm.modeFilter(f, t60 * pow(1 - ba.take(k + 1, RATIOS) / 195.955, 5), select2(f < ma.SR / 2 - 200, 0, ba.take(k + 1, GAINS)))
  with {
    f = freq * ba.take(k + 1, RATIOS);
  };
};

voice(i) = pm.strikeModel(10, soft, 0.6, vel, gate) : bar(freq, t60) : pm.marimbaResTube(tube) : *(0.6)
with {
  freq = hslider("freq%i", 330, 50, 2000, 0.001);
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.6, 0, 1, 0.001);
  // Yarn: soft enough that the fundamental leads and the bar's upper modes only colour it.
  soft = 500 + 1500 * vel * vel;
  t60 = 1.6 * sqrt(262 / freq) : max(0.7) : min(2.2);
  tube = freq : pm.f2l;
};

pan(i) = _ <: *(sqrt(1 - p)), *(sqrt(p)) with { p = 0.3 + 0.4 * i / (N - 1); };

process = par(i, N, voice(i) : pan(i)) :> _, _;
