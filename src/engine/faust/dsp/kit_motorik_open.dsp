// Motorik, round 4 candidate: the same 1970s kit with the damping taken off, as a live room hears it. The kick rings
// round under a harder beater, the snare's wires buzz on, the hat is looser, and the floor tom booms.
// Slots, in order: kick, snare, hat, tom. Outputs: left, right, echo send.
import("stdfaust.lib");
dr = library("garsae_drums.lib");

// One slot per voice: its gate (a hit on each rise), velocity, and the pattern's tone and decay multipliers.
gate(k) = hslider("gate%k", 0, 0, 1, 1) : dr.hit;
vel(k) = hslider("vel%k", 0.8, 0, 1, 0.001);
tone(k) = hslider("tone%k", 1, 0.25, 4, 0.001);
decay(k) = hslider("decay%k", 1, 0.05, 4, 0.001);

process =
  (dr.kick(52 * tone(0), 0.45 * decay(0), 1700, vel(0), gate(0)) : dr.place(0.5, 0)),
  (dr.snare(190 * tone(1), 0.2 * decay(1), 1.6, 0.95, vel(1), gate(1)) : dr.place(0.5, 0)),
  (dr.hat(1.0 * tone(2), 0.07 * decay(2), vel(2), gate(2)) : dr.place(0.6, 0)),
  (dr.tom(88 * tone(3), 0.6 * decay(3), 1100, vel(3), gate(3)) : dr.place(0.42, 0))
  :> _, _, _;
