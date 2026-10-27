# 08: Add hand-picked YouTube guide videos as sources

**What to build:** The user lists YouTube guide video URLs per Character in a hand-edited file. The scrape passes each video to Gemini as video input and merges the result as one more GuideSource. Only guide videos, not showcases (showcase builds would inflate targets). Prompt must normalize bonus-only Energy Regen ("22% ER" means 122%) and map Thai stat names to the English list; the prototype showed both problems.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A listed video for Yangyang: Xuanling adds a GuideSource with Energy Regen around 122 and Crit. Rate max 80
- [ ] A Thai-language video produces English stat names only
- [ ] Characters with no listed videos are unaffected
