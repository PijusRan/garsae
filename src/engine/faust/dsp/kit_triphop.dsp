// Trip hop: a slow, heavy break off a dusty record. A boomy kick, a big dark snare with loose wires that goes to the
// room echo, a dark hat and a cross-stick; then a 12-bit sampler at 22 kHz.
// Slots, in order: kick, snare, hat, rim. Outputs: left, right, echo send.
import("stdfaust.lib");
dr = library("garsae_drums.lib");

// One slot per voice: its gate (a hit on each rise), velocity, and the pattern's tone and decay multipliers.
gate(k) = hslider("gate%k", 0, 0, 1, 1) : dr.hit;
vel(k) = hslider("vel%k", 0.8, 0, 1, 0.001);
tone(k) = hslider("tone%k", 1, 0.25, 4, 0.001);
decay(k) = hslider("decay%k", 1, 0.05, 4, 0.001);

process =
  (dr.kick(50 * tone(0), 0.45 * decay(0), 1400, vel(0), gate(0)) : dr.place(0.5, 0)),
  (dr.snare(175 * tone(1), 0.28 * decay(1), 1.4, 0.6, vel(1), gate(1)) : dr.place(0.5, 1)),
  (dr.hat(0.7 * tone(2), 0.05 * decay(2), vel(2), gate(2)) : dr.place(0.58, 0)),
  (dr.crossstick(480 * tone(3), 0.08 * decay(3), vel(3), gate(3)) : dr.place(0.44, 0))
  :> dr.grit(12, 22050), dr.grit(12, 22050), _;
