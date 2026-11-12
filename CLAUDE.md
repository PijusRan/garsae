Commit after every change. The commit should be short (1-2 lines). Don't credit yourself. Additionally, don't make branches for new features.

Every new A/B test on the compare page is a new round: give its candidates the next round number in `src/engine/alternates/index.ts` and add the round to `ROUNDS` with a title and what to listen for, so the page opens on it, marked to test, with earlier rounds folded away. Once a round is decided, set `shipped: true` on it.
