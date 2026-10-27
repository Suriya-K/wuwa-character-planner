# 02: Stat check page (local)

**What to build:** A Next.js app (Bun, TypeScript) with a deliberately plain, old-school HTML-table UI in English. The user picks a Character from a dropdown, pastes (Ctrl+V) or uploads an Attributes Screenshot, waits up to ~30s while an API route has Gemini read it, corrects the values in an editable form, then sees a table of each stat against its Stat Target with a Stat Verdict (Low red / OK green / High blue). A "Crit Weapon" checkbox (default on) switches the Crit Stat Targets to the non-Crit set. Images are not stored.

Only the first Attributes page is read: HP, ATK, DEF, Energy Regen, Crit. Rate, Crit. DMG.

Gemini model id comes from env with a fallback list, because model ids get retired and the free tier returns 503 under load (ADR 0001). `gemini-3.5-flash-lite` read all three test screenshots correctly in the prototype (branch `prototype/spikes`, which also holds the working prompt and test screenshots).

**Blocked by:** 01

**Status:** done

- [x] The prototype's Attributes Screenshot reads as HP 16055, ATK 2201, DEF 1447, ER 164.0, CR 80.8, CD 255.2 (Thai client labels mapped to English)
- [x] Every read value is editable before verdicts are shown
- [x] With Yangyang: Xuanling selected and Crit Weapon ticked, CR 80.8 is OK (min 70) and CD 255.2 is Low (min 265)
- [x] Unticking Crit Weapon switches to the non-Crit targets, turning CD 255.2 OK (min 225)
- [x] A 503 from the first model falls through to the next model in the list
- [x] Works on a phone-width screen
