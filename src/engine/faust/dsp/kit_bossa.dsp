// Bossa nova: a quiet Brazilian kit. A soft surdo-like bass drum, the cross-stick on the snare's rim, a ganzá
// (metal shaker) and the hi-hat's foot.
// Slots, in order: kick, rim, shaker, hat. Outputs: left, right, echo send.
import("stdfaust.lib");
dr = library("garsae_drums.lib");

// One slot per voice: its gate (a hit on each rise), velocity, and the pattern's tone and decay multipliers.
gate(k) = hslider("gate%k", 0, 0, 1, 1) : dr.hit;
vel(k) = hslider("vel%k", 0.8, 0, 1, 0.001);
tone(k) = hslider("tone%k", 1, 0.25, 4, 0.001);
decay(k) = hslider("decay%k", 1, 0.05, 4, 0.001);

process =
  (dr.kick(70 * tone(0), 0.45 * decay(0), 550, vel(0), gate(0)) : dr.place(0.5, 0)),
  (dr.crossstick(520 * tone(1), 0.08 * decay(1), vel(1), gate(1)) : dr.place(0.44, 0)),
  (dr.shaker(1.15 * tone(2), 0.09 * decay(2), vel(2), gate(2)) : dr.place(0.39, 0)),
  (dr.hat(0.75 * tone(3), 0.035 * decay(3), vel(3), gate(3)) : dr.place(0.58, 0))
  :> _, _, _;
