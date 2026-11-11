// Minimal techno: a TR-909. The kick's pitch dives into a driven sine, the clap is struck four times, the hats are
// metal.
// Slots, in order: kick, clap, openhat, hat, rim. Outputs: left, right, echo send.
import("stdfaust.lib");
dr = library("garsae_drums.lib");

// One slot per voice: its gate (a hit on each rise), velocity, and the pattern's tone and decay multipliers.
gate(k) = hslider("gate%k", 0, 0, 1, 1) : dr.hit;
vel(k) = hslider("vel%k", 0.8, 0, 1, 0.001);
tone(k) = hslider("tone%k", 1, 0.25, 4, 0.001);
decay(k) = hslider("decay%k", 1, 0.05, 4, 0.001);

process =
  (dr.kick909(48 * tone(0), 3.2, 0.42 * decay(0), 2.6, vel(0), gate(0)) : dr.place(0.5, 0)),
  (dr.clap(tone(1), 0.18 * decay(1), vel(1), gate(1)) : dr.place(0.5, 0)),
  (dr.hat808(1.05 * tone(2), 0.28 * decay(2), vel(2), gate(2)) : dr.place(0.61, 0)),
  (dr.hat808(1.05 * tone(3), 0.045 * decay(3), vel(3), gate(3)) : dr.place(0.58, 0)),
  (dr.rim808(tone(4), vel(4), gate(4)) : dr.place(0.44, 0))
  :> _, _, _;
