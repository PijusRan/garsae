// Deep house: drum machines, rounder than techno. A 909 kick with less dive and drive, a clap with a longer tail,
// 909 open hats, a real shaker and an 808 rim.
// Slots, in order: kick, clap, openhat, shaker, rim. Outputs: left, right, echo send.
import("stdfaust.lib");
dr = library("garsae_drums.lib");

// One slot per voice: its gate (a hit on each rise), velocity, and the pattern's tone and decay multipliers.
gate(k) = hslider("gate%k", 0, 0, 1, 1) : dr.hit;
vel(k) = hslider("vel%k", 0.8, 0, 1, 0.001);
tone(k) = hslider("tone%k", 1, 0.25, 4, 0.001);
decay(k) = hslider("decay%k", 1, 0.05, 4, 0.001);

process =
  (dr.kick909(50 * tone(0), 2.2, 0.5 * decay(0), 1.6, vel(0), gate(0)) : dr.place(0.5, 0)),
  (dr.clap(0.95 * tone(1), 0.3 * decay(1), vel(1), gate(1)) : dr.place(0.5, 0)),
  (dr.hat808(tone(2), 0.3 * decay(2), vel(2), gate(2)) : dr.place(0.61, 0)),
  (dr.shaker(1.1 * tone(3), 0.08 * decay(3), vel(3), gate(3)) : dr.place(0.39, 0)),
  (dr.rim808(tone(4), vel(4), gate(4)) : dr.place(0.44, 0))
  :> _, _, _;
