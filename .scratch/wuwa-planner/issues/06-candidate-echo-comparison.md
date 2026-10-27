# 06: Compare a Candidate Echo against an Equipped Echo

**What to build:** The user uploads one Candidate Echo, picks which Equipped Echo of the same cost it would replace (preselected when only one matches), and sees both Echo Scores side by side, the score difference, and a what-if table showing Energy Regen, Crit. Rate and Crit. DMG before and after the swap with their new Stat Verdicts (`compareEchoes`). ATK%/HP%/DEF% are not projected.

**Blocked by:** 05

**Status:** done

- [x] Only Equipped Echoes of the Candidate's cost are offered
- [x] Score difference and what-if values match `compareEchoes` for the same inputs
- [x] A what-if stat that falls below its Stat Target shows Low
- [x] Optionally replacing the Equipped Echo with the Candidate updates the Loadout
