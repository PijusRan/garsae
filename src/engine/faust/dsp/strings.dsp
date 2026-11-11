// String ensemble: six voices of Faust's bowed string (pm.violinModel): a string with the bow's stick-slip friction
// at 70% of its length, the nut and bridge reflections, and the violin body's resonances. The bow speed swells in
// slowly; the left hand's vibrato arrives late, at a slightly different rate on each desk.
import("stdfaust.lib");

N = 6;

voice(i) = pm.violinModel(string, 0.48, bow, 0.7) * 0.22
with {
  freq = hslider("freq%i", 440, 50, 2000, 0.001) : si.smooth(ba.tau2pole(0.025));
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.8, 0, 1, 0.001);
  bow = gate * (0.5 + 0.3 * vel) : si.smooth(ba.tau2pole(0.35));
  late = gate : si.smooth(ba.tau2pole(0.9));
  vibrato = 1 + os.osc(5.1 + 0.17 * i) * 0.0035 * late * late;
  // The model shortens the string by 0.08 m and its filters add 12 samples to the loop: undo both, at any rate.
  string = 340 * (1 / (freq * vibrato) - 12 / ma.SR) + 0.08;
};

pan(i) = _ <: *(sqrt(1 - p)), *(sqrt(p)) with { p = 0.2 + 0.6 * i / (N - 1); };

process = par(i, N, voice(i) : pan(i)) :> _, _ : par(c, 2, fi.lowpass(2, 6500));
