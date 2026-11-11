// Liquid drum and bass: a breakbeat kit played fast and tuned up. A tight kick, a high, snappy snare, crisp hats,
// a shaker and an open hat.
// Slots, in order: kick, snare, hat, shaker, openhat. Outputs: left, right, echo send.
import("stdfaust.lib");
dr = library("garsae_drums.lib");

// One slot per voice: its gate (a hit on each rise), velocity, and the pattern's tone and decay multipliers.
gate(k) = hslider("gate%k", 0, 0, 1, 1) : dr.hit;
vel(k) = hslider("vel%k", 0.8, 0, 1, 0.001);
tone(k) = hslider("tone%k", 1, 0.25, 4, 0.001);
decay(k) = hslider("decay%k", 1, 0.05, 4, 0.001);

process =
  (dr.kick(60 * tone(0), 0.2 * decay(0), 3200, vel(0), gate(0)) : dr.place(0.5, 0)),
  (dr.snare(235 * tone(1), 0.16 * decay(1), 0.9, 1.2, vel(1), gate(1)) : dr.place(0.5, 0)),
  (dr.hat(1.05 * tone(2), 0.04 * decay(2), vel(2), gate(2)) : dr.place(0.58, 0)),
  (dr.shaker(1.1 * tone(3), 0.07 * decay(3), vel(3), gate(3)) : dr.place(0.39, 0)),
  (dr.hat(tone(4), 0.3 * decay(4), vel(4), gate(4)) : dr.place(0.61, 0))
  :> _, _, _;
