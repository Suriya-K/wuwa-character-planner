# 05: Loadout upload and Echo rating

**What to build:** On a Character with a Build Snapshot, the user uploads several Echo Screenshots at once. Each is read in parallel and appears as an editable row (cost, level, Main Stat, Secondary Main Stat, five Substats). Echoes below +25 are rejected with a clear message. Each row shows its Echo Score and Echo Verdict from `rateEcho`, using the Build Snapshot's stats so Energy Regen counts only while it is still needed. Saving stores the rows as the Loadout in the Build Snapshot.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] The prototype's two Echo Screenshots read correctly, Secondary Main Stat kept out of Substats
- [ ] A +20 Echo is rejected and not added to the table
- [ ] An Echo whose Main Stat is not in Recommended Main Stats shows Replace
- [ ] With ER 164 saved, an Energy Regen Substat adds nothing to the Echo Score
- [ ] The Loadout reloads on another device
