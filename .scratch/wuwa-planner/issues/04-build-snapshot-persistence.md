# 04: Save Build Snapshots to Upstash Redis

**What to build:** After confirming stats, the user saves them as the Character's Build Snapshot (one JSON document per Character in Upstash Redis, added through the Vercel Marketplace). Opening the Character on any device shows the last saved stats and their Stat Verdicts, plus the Crit Weapon choice, without uploading again.

**Blocked by:** 02

**Status:** done

- [x] Saving then reloading on another browser shows the same stats and Crit Weapon choice
- [x] Saving again replaces the previous Build Snapshot
- [x] Works against a local/dev Redis before ticket 03 deploys
