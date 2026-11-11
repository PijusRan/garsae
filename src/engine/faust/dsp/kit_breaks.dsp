// Breakbeat: the Amen, a 1969 funk kit as it was sampled. A tight, punchy kick, a bright snare with a ring, a stick
// ride and the crash; a little sampler grit (14 bits at 32 kHz).
// Slots, in order: kick, snare, ride, openhat. Outputs: left, right, echo send.
import("stdfaust.lib");
dr = library("garsae_drums.lib");

// One slot per voice: its gate (a hit on each rise), velocity, and the pattern's tone and decay multipliers.
gate(k) = hslider("gate%k", 0, 0, 1, 1) : dr.hit;
vel(k) = hslider("vel%k", 0.8, 0, 1, 0.001);
tone(k) = hslider("tone%k", 1, 0.25, 4, 0.001);
decay(k) = hslider("decay%k", 1, 0.05, 4, 0.001);

process =
  (dr.kick(58 * tone(0), 0.22 * decay(0), 3000, vel(0), gate(0)) : dr.place(0.5, 0)),
  (dr.snare(215 * tone(1), 0.2 * decay(1), 1.1, 1.1, vel(1), gate(1)) : dr.place(0.5, 0)),
  (dr.ride(tone(2), 0.9 * decay(2), vel(2), gate(2)) : dr.place(0.6, 0)),
  (dr.hat(0.9 * tone(3), 0.45 * decay(3), vel(3), gate(3)) : dr.place(0.4, 0))
  :> dr.grit(14, 32000), dr.grit(14, 32000), _;
