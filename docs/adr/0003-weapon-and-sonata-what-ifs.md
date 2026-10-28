# Weapon and Sonata Set what-ifs work from the stat screen, not a full stat model

The Attributes Screenshot already holds every bonus from the Equipped Weapon, its always-on passive and 2-piece set bonuses. So rather than rebuild a character's stats from scratch, a what-if starts from those totals and only adds or takes away the difference (`shiftStats`, `swapWeapon` in `lib/rating.ts`).

- Crit. Rate, Crit. DMG and Energy Regen add straight on. ATK%/HP%/DEF% scale Base Stats (character level 90, plus the weapon's base ATK for ATK).
- Swapping weapons also moves base ATK, which the ATK% already on screen multiplies. That ATK% is worked out from screen ATK minus flat ATK, and flat ATK comes from the Loadout (ATK substats plus the 150/100 Secondary Main Stat of 4/3-cost Echoes). So ATK is an estimate, and is closest with all five Echoes added.
- Only a weapon passive whose first sentence is unconditional ("Increases ATK by {0}.") counts; conditional passives aren't on the stat screen and aren't modelled.
- Only 3/5-piece Sonata buffs are offered as checkboxes; 2-piece bonuses are already on the screen. The "With set buff" column has no Stat Verdict because Build Guides give targets before set bonuses (Prydwen says so). DMG Bonus parts are shown as text only, since the app reads no DMG Bonus stats.
- The "With <weapon>" column is judged with the compared weapon's own Crit/non-Crit targets.
- Swapping a Candidate Echo in (`compareEchoes`) uses the same rule: flat HP/ATK/DEF substats add on, their % versions scale Base Stats. The Secondary Main Stat cancels out because both Echoes have the same cost.
- Without Base Stats, HP/ATK/DEF what-ifs show "—" (or are left out); the additive stats still work.

Considered: OCR the stat breakdown or ask for Base Stats by hand. Rejected: Prydwen has them for nearly every character, and the estimate is good enough for "is this weapon better?".
