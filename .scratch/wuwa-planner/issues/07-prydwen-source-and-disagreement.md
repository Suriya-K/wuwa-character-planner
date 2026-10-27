# 07: Add Prydwen as a source and show where sources disagree

**What to build:** The scrape also pulls each Character's Prydwen page through Gemini's `url_context` tool (plain fetch is blocked by Cloudflare; ADR 0002) and merges it with the sheet. Character IDs are checked against Prydwen slugs, and any Character that can't be matched is reported. The stat check page shows each source's raw value beside the merged Stat Target (for example "Sheet: 120 · Prydwen: 107+").

**Blocked by:** 01, 02

**Status:** done

- [x] Prydwen values land as a second GuideSource and change the medians
- [x] An unreachable Prydwen page is recorded as a FailedSource and the sheet alone still produces targets
- [x] Characters with no Prydwen slug match are listed at the end of the run
- [x] The stat check page shows per-source values for each Stat Target
