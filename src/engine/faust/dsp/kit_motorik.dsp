// Motorik: a 1970s kit, undamped, as a live room hears it. The kick rings round under a harder beater, the hat is
// loose, the floor tom booms; the snare is played lightly, its wires buzzing on under a soft stick, so the backbeat
// never cuts through. Chosen in round 4 over the damped kit (kit_motorik_damped.dsp).
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
  (dr.snare(190 * tone(1), 0.2 * decay(1), 1.6, 0.85, vel(1), gate(1)) * 0.56 : dr.place(0.5, 0)),
  (dr.hat(1.0 * tone(2), 0.07 * decay(2), vel(2), gate(2)) : dr.place(0.6, 0)),
  (dr.tom(88 * tone(3), 0.6 * decay(3), 1100, vel(3), gate(3)) : dr.place(0.42, 0))
  :> _, _, _;
