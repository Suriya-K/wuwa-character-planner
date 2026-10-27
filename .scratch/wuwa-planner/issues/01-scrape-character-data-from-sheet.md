# 01: Scrape character data from the community build sheet

**What to build:** One command produces a merged build file per Character from the community build sheet (published Google Sheet, one CSV per element tab). Each Character's block of text goes to Gemini, which returns a GuideSource; GuideSources are merged with `mergeGuides`. Raw per-source values and supporting quotes are kept so later UI can show where a number came from. See ADR 0002 for the source rules.

Extraction rules (decided during design, must be in the prompt):
- Stat and Substat names come from the fixed English list in the rating module (same names the OCR returns).
- A single number or "X+" is a minimum only; a maximum only when the sheet gives a range.
- Crit targets: "Crit. Weapon" row → statTargets, "Non-Crit." row → nonCritWeaponTargets.
- Substat priority ("A / B > C (until 120%) > D") becomes Substat Weights 0–1, ties share a weight, unlisted = 0.
- Echo Mainstats columns become Recommended Main Stats per cost (4/3/1).
- Character ID follows the Prydwen slug style (lowercase, hyphenated, form included: `yangyang-xuanling`); ticket 07 verifies against Prydwen.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Running the scrape writes one file per Character in the sheet plus a roster list
- [ ] Yangyang: Xuanling's file has ATK min 2000, Energy Regen min 120, Crit weapon CR/CD min 70/265, non-Crit CR/CD min 65/225, cost 4 mains Crit. Rate + Crit. DMG
- [ ] Re-running skips Characters already scraped; a force flag re-scrapes one Character
- [ ] A hand-written `override` in a Character's file survives a re-scrape
- [ ] A Character whose block fails to extract is recorded as a FailedSource, not silently dropped
