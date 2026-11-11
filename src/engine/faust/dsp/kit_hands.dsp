// Hand drums: two congas (open tones, and muted strokes when the pattern's decay is short), the slap, a frame drum
// and a shaker.
// Slots, in order: conga, conga, congaslap, tom, shaker. Outputs: left, right, echo send.
import("stdfaust.lib");
dr = library("garsae_drums.lib");

// One slot per voice: its gate (a hit on each rise), velocity, and the pattern's tone and decay multipliers.
gate(k) = hslider("gate%k", 0, 0, 1, 1) : dr.hit;
vel(k) = hslider("vel%k", 0.8, 0, 1, 0.001);
tone(k) = hslider("tone%k", 1, 0.25, 4, 0.001);
decay(k) = hslider("decay%k", 1, 0.05, 4, 0.001);

process =
  (dr.conga(220 * tone(0), select2(decay(0) < 0.5, 0, 2), vel(0), gate(0)) : dr.place(0.57, 0)),
  (dr.conga(220 * tone(1), select2(decay(1) < 0.5, 0, 2), vel(1), gate(1)) : dr.place(0.6, 0)),
  (dr.conga(220 * tone(2), 1, vel(2), gate(2)) : dr.place(0.57, 0)),
  (dr.tom(150 * tone(3), 0.4 * decay(3), 600, vel(3), gate(3)) : dr.place(0.43, 0)),
  (dr.shaker(tone(4), 0.12 * decay(4), vel(4), gate(4)) : dr.place(0.39, 0))
  :> _, _, _;
