# Stat Targets come from an offline, multi-source scrape

Build Guides disagree and are written as prose, so a local Bun script gathers each character's guides, has Gemini extract targets/priorities/main stats per source against a fixed English stat list, and commits the merged result to `data/characters/*.json`. Stat Target = median of source minimums to median of source maximums; Substat Weight = mean across sources. Nothing is scraped at runtime.

## Sources (validated 2026-10-27 by `prototype/spike.ts`)

- **Prydwen**: Cloudflare blocks curl and headless Chrome, but Gemini's `url_context` tool retrieves it. Richest source: numeric endgame ranges for most stats.
- **Game8**: plain fetch works (`url_context` does not). Star priorities and main stats only, no numbers.
- **YouTube guide videos**: hand-picked URLs passed to Gemini as video. Usually only ER and a Crit Rate cap are numeric. ~60–95k tokens per video.
- **Mobalytics**: dropped; unreachable by every method tried.

## Consequences

- Per-source raw values and supporting quotes are kept in the JSON so the UI can show disagreement.
- Energy Regen is normalized to the stat-screen total (a guide saying "22% ER" means 122%).
- A hand-written `override` field always wins and is never overwritten by a re-scrape.
- A failed source is skipped and recorded; the median uses whatever succeeded.
- YouTube URLs are curated by hand, guide videos only — showcase videos would inflate targets.
