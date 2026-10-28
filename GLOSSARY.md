# WuWa Character Planner

A personal tool for checking a Wuthering Waves character's stats and echoes against a recommended build.

## Language

**Character**:
A playable resonator in one specific form; a different form or element of the same name (Yangyang vs Yangyang Xuanling, each Rover element) is a different Character.
_Avoid_: Resonator, unit

### Inputs

**Attributes Screenshot**:
A capture of the in-game character Attributes screen showing final stat totals.
_Avoid_: Stat image, character screenshot

**Echo Screenshot**:
A capture of a single echo's detail screen showing its main stat and substats.
_Avoid_: Echo image

### Build targets

**Build Guide**:
A community-published recommendation for how to build a specific character, used as the source of Stat Targets and Substat Weights.
_Avoid_: Guide, meta

**Stat Target**:
A recommended floor for one stat on one character, merged from several Build Guides, with a ceiling only when a guide states one.

**Crit Weapon**:
A weapon whose secondary stat is Crit. Rate or Crit. DMG; whether the Equipped Weapon is one decides which Crit Stat Targets apply.

**Equipped Weapon**:
The weapon a character holds, with its rank (R1-R5); its base ATK, secondary stat and always-on passive are already in the Attributes Screenshot.

**Compared Weapon**:
A weapon being considered instead of the Equipped Weapon; the stat screen it would give is estimated from Base Stats.

**Base Stats**:
A character's level 90 HP, ATK and DEF before any % bonus, which ATK%/HP%/DEF% bonuses scale from.

**Sonata Set**:
An in-game Echo set bonus at 2, 3 or 5 pieces. 2-piece bonuses are always on and already on the stat screen; the 3/5-piece buffs are conditional and shown as a Set Buff what-if.
_Avoid_: Echo set
_Avoid_: Recommended stat, benchmark

**Stat Verdict**:
The result of comparing a stat to its Stat Target: Low, OK, or High.
_Avoid_: Too much/too little

### Echoes

**Echo**:
An equippable item with a cost (1, 3, or 4), one main stat, and up to five substats.

**Main Stat**:
The fixed primary stat of an Echo, chosen from a pool determined by its cost.

**Secondary Main Stat**:
A flat stat fixed by an Echo's cost that sits under the Main Stat; never rolled, never scored.
_Avoid_: Sub main stat

**Recommended Main Stats**:
The Main Stats a Build Guide endorses for a character at each Echo cost.

**Maxed Echo**:
An Echo at level +25 with all five substats revealed; the only kind this tool rates.

**Substat**:
A secondary stat rolled on an Echo, each with a known maximum roll value.
_Avoid_: Sub, secondary

**Low Roll**:
A Substat whose value is one of the two lowest values that Substat can roll.

**Dead Substat**:
A Substat worth little or nothing to a specific character (Substat Weight under 0.25), however high it rolled.
_Avoid_: Bad substat (ambiguous between Low Roll and Dead Substat)

**Substat Weight**:
How valuable a Substat type is to a specific character, from 0 (useless) to 1 (ideal).

**Echo Score**:
An Echo's weighted substat value as a percentage of the best possible score for that character.
_Avoid_: Rating, CV

**Echo Verdict**:
The action suggested by an Echo Score and Main Stat check: Replace, Usable, or Keep.

**Loadout**:
The set of Echoes currently equipped on a character.
_Avoid_: Echo set (that is an in-game set bonus), build

**Equipped Echo**:
An Echo that is part of a character's Loadout.

**Candidate Echo**:
An Echo being considered as a replacement for an Equipped Echo.
_Avoid_: New echo

### Saved state

**Build Snapshot**:
A character's most recently confirmed stats and Loadout, saved so it can be viewed from any device.
_Avoid_: Save, profile
