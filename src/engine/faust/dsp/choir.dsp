// Choir: five parts of Faust's FOF voice (pm.SFFormantModelFofSmooth): a glottal pulse train shaped by five formants
// whose centres, gains and bandwidths come from measured sung vowels (the Csound tables), with the formant shifts real
// singers make at high pitches. One singer per part, each with their own vibrato; the tile's ensemble chorus spreads
// them into a section. "vowel" sits between o (3) and u (4) (a fractional vowel passes through the ones in between);
// the tile steps it gradually. The formants follow the steady pitch, only the glottal pulse carries the vibrato: the
// formant tables are then looked up once a block, not every sample.
import("stdfaust.lib");

N = 5;

vowel = hslider("vowel", 4, 3, 4, 0.001);

// The library's FOF filterbank, but without smoothing its bandwidths every sample: the vowel only ever moves in small
// steps, so the formants can be worked out once a block.
formant(type, vowel, n, i, freq) = pm.fof(fc, bw, sw, g)
with {
  index = type * n + vowel;
  gender = pm.voiceGender(type);
  fc = ba.listInterp(pm.formantValues.f(i), index) : pm.autobendFreq(i, freq, type);
  g = ba.listInterp(pm.formantValues.g(i), index) : pm.vocalEffort(freq, gender);
  bw = ba.listInterp(pm.formantValues.bw(i), index);
  sw = pm.skirtWidthMultiplier(vowel, freq, gender) * bw;
};
bank(type, vowel, freq) = pm.formantFilterbank(type, vowel, formant, freq);

voice(i) = pm.SFFormantModel(type, vowel, 0, freq, level, os.lf_imptrain(sung), bank, 1)
with {
  freq = hslider("freq%i", 220, 50, 2000, 0.001);
  gate = hslider("gate%i", 0, 0, 1, 1);
  vel = hslider("vel%i", 0.8, 0, 1, 0.001);
  type = hslider("type%i", 0, 0, 4, 1);
  // Sung in over a couple of seconds, like the synth choir.
  level = gate * (0.6 + 0.4 * vel) * 2 : si.smooth(ba.tau2pole(0.9));
  // The vibrato fades in after the attack, like a held sung note.
  late = gate : si.smooth(ba.tau2pole(0.8));
  sung = freq * (1 + os.osc(4.9 + 0.31 * i) * 0.006 * late * late);
};

pan(i) = _ <: *(sqrt(1 - p)), *(sqrt(p)) with { p = 0.2 + 0.6 * i / (N - 1); };

// Sung softly: the top rounded off, so the formants above 3 kHz (the bright "ring" of projected singing) stay back.
process = par(i, N, voice(i) : pan(i)) :> par(c, 2, fi.lowpass(2, 2800));
