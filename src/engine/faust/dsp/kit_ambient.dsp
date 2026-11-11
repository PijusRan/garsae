// Ambient pulse: soft mallets. A big concert bass drum with a felt beater, a gentle shaker and a felt-mallet tom.
// Slots, in order: kick, shaker, tom. Outputs: left, right, echo send.
import("stdfaust.lib");
dr = library("garsae_drums.lib");

// One slot per voice: its gate (a hit on each rise), velocity, and the pattern's tone and decay multipliers.
gate(k) = hslider("gate%k", 0, 0, 1, 1) : dr.hit;
vel(k) = hslider("vel%k", 0.8, 0, 1, 0.001);
tone(k) = hslider("tone%k", 1, 0.25, 4, 0.001);
decay(k) = hslider("decay%k", 1, 0.05, 4, 0.001);

process =
  (dr.kick(44 * tone(0), 0.8 * decay(0), 380, vel(0), gate(0)) : dr.place(0.5, 0)),
  (dr.shaker(0.75 * tone(1), 0.14 * decay(1), vel(1), gate(1)) : dr.place(0.39, 0)),
  (dr.tom(120 * tone(2), 0.6 * decay(2), 450, vel(2), gate(2)) : dr.place(0.43, 0))
  :> _, _, _;
