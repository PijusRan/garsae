// Motorik, round 4 reference: the kit it first shipped with. A dry, deadened 1970s kit, close-miked in a small room: a
// felt beater on a pillowed kick, a snare damped with a towel so its wires speak briefly, a tight closed hat, and a low
// floor tom for the odd fill.
// Slots, in order: kick, snare, hat, tom. Outputs: left, right, echo send.
import("stdfaust.lib");
dr = library("garsae_drums.lib");

// One slot per voice: its gate (a hit on each rise), velocity, and the pattern's tone and decay multipliers.
gate(k) = hslider("gate%k", 0, 0, 1, 1) : dr.hit;
vel(k) = hslider("vel%k", 0.8, 0, 1, 0.001);
tone(k) = hslider("tone%k", 1, 0.25, 4, 0.001);
decay(k) = hslider("decay%k", 1, 0.05, 4, 0.001);

process =
  (dr.kick(56 * tone(0), 0.22 * decay(0), 1100, vel(0), gate(0)) : dr.place(0.5, 0)),
  (dr.snare(200 * tone(1), 0.12 * decay(1), 1.1, 0.7, vel(1), gate(1)) : dr.place(0.5, 0)),
  (dr.hat(0.9 * tone(2), 0.04 * decay(2), vel(2), gate(2)) : dr.place(0.6, 0)),
  (dr.tom(92 * tone(3), 0.35 * decay(3), 900, vel(3), gate(3)) : dr.place(0.42, 0))
  :> _, _, _;
