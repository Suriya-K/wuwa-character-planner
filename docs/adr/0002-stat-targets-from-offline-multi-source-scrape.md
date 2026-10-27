# Stat Targets come from an offline, multi-source scrape

Build Guides disagree and are written as prose, so a local Bun script gathers each character's guides, has Gemini extract targets/weights/main stats per source against a fixed English stat list, and commits the merged result to `data/characters/*.json`. Stat Target = median of source minimums to median of source maximums; Substat Weight = mean across sources. Nothing is scraped at runtime.

## Sources (validated 2026-10-27)

- **Community build sheet** (published Google Sheet, one CSV per element tab): primary. Current to game version 3.7, covers every character, gives numeric targets, Crit targets for both weapon types, ordered substat priority and main stats. Each character's block of text goes to Gemini rather than a position-based parser, so a layout change in the sheet doesn't break the script.
- **Prydwen**: Cloudflare blocks curl and headless Chrome, but Gemini's `url_context` tool retrieves it. Numeric endgame ranges.
- **YouTube guide videos**: optional, hand-picked per character, passed to Gemini as video. ~60–95k tokens each.
- **Game8**: dropped; priorities only, which the sheet already gives in more detail.
- **Mobalytics**: dropped; unreachable by every method tried.

## Consequences

- A single number or "X+" in a guide is a minimum only; a Stat Target gets a maximum only when a source states a range. So High means "a guide said this is too much", not merely "above a number".
- Crit Rate/Crit DMG targets come in two variants, Crit weapon and non-Crit weapon; the user picks per Build Snapshot.
- Energy Regen is normalized to the stat-screen total (a guide saying "22% ER" means 122%).
- Per-source raw values and supporting quotes are kept in the JSON so the UI can show disagreement.
- A hand-written `override` field always wins and is never overwritten by a re-scrape.
- A failed source is skipped and recorded; the median uses whatever succeeded.
