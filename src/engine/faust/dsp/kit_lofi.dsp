// Lo-fi hip hop: a dusty acoustic kit off an old record, chopped on a 12-bit sampler. A soft, pillowed kick, a loose
// snare with rattling wires, a dark closed hat; then the sampler's grit (12 bits at 26 kHz).
// Slots, in order: kick, snare, hat. Outputs: left, right, echo send.
import("stdfaust.lib");
dr = library("garsae_drums.lib");

// One slot per voice: its gate (a hit on each rise), velocity, and the pattern's tone and decay multipliers.
gate(k) = hslider("gate%k", 0, 0, 1, 1) : dr.hit;
vel(k) = hslider("vel%k", 0.8, 0, 1, 0.001);
tone(k) = hslider("tone%k", 1, 0.25, 4, 0.001);
decay(k) = hslider("decay%k", 1, 0.05, 4, 0.001);

process =
  (dr.kick(52 * tone(0), 0.3 * decay(0), 800, vel(0), gate(0)) : dr.place(0.5, 0)),
  (dr.snare(185 * tone(1), 0.17 * decay(1), 1.5, 0.75, vel(1), gate(1)) : dr.place(0.5, 0)),
  (dr.hat(0.8 * tone(2), 0.05 * decay(2), vel(2), gate(2)) : dr.place(0.58, 0))
  :> dr.grit(12, 26040), dr.grit(12, 26040), _;
