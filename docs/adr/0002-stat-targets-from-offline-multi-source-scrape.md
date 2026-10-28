# Stat Targets come from an offline, multi-source scrape

Build Guides disagree and are written as prose, so a local Bun script gathers each character's guides, has Gemini extract targets/weights/main stats per source against a fixed English stat list, and commits the merged result to `data/characters/*.json`. Stat Target = median of source minimums to median of source maximums, where a source that names the stat without a ceiling votes "no ceiling"; Substat Weight = mean across sources; Recommended Main Stats = those at least half the sources that cover that cost endorse (one misread source, e.g. a Thai video heard as "Aero", can't add a Main Stat alone). Nothing is scraped at runtime.

## Sources (validated 2026-10-27)

- **Community build sheet** (published Google Sheet, one CSV per element tab): primary. Current to game version 3.7, covers every character, gives numeric targets, Crit targets for both weapon types, ordered substat priority and main stats. Each character's block of text goes to Gemini rather than a position-based parser, so a layout change in the sheet doesn't break the script.
- **Prydwen**: Cloudflare blocks curl, but Gemini's `url_context` tool retrieves it. Numeric endgame ranges. `url_context` truncates long pages (aemeath, chisa, hsin), so on NOT_FOUND the script renders the page with local headless Chrome (a desktop user agent passes Cloudflare) and sends only the "Best Echo Stats".."Skill Priority" text to Gemini (2026-10-28).
- **Prydwen, rendered with Chrome** (no Gemini): the weapons page's embedded Next.js JSON gives every weapon's type, level 90 base ATK, secondary stat and passive; each character page gives weapon type and level 90 Base Stats (the "Include minor fortes" toggle is off by default, so they are true base). Icons come straight from `cdn.prydwen.gg`, which curl can reach.
- **Sheet "Substat Ranges + Sonata Sets" tab**: every Sonata Set. The grid is read by column in code (collapsing empty cells shifted effects across sets); Gemini only turns each effect's text into stat bonuses.
- **Wuthering Waves Optimizer** ([GitHub](https://github.com/ryanbenson/wuthering-waves-optimizer), GPL-3.0; this tool is personal and unpublished, 2026-10-28): plain TypeScript, fetched raw from GitHub with no Gemini. `substatPriorities.ts` gives DPR-derived Substat Weights (0-4, from Tacet Lab) for 50 of our characters; divided by 4 they join the mean as source `optimizer`, with no Stat Target or Main Stat vote. Its level 90 Base Stats are the fallback when Prydwen has none; all 51 characters both cover matched within rounding (Jingran's DEF really is 0).
- **YouTube guide videos**: optional, hand-picked per character in `data/youtube.json`, passed to Gemini as video. ~60–95k tokens each. The prompt must forbid reading the creator's own stat screen, or showcase numbers come back as targets.
- **Game8**: dropped; priorities only, which the sheet already gives in more detail.
- **Mobalytics**: dropped; unreachable by every method tried.

## Consequences

- A single number or "X+" in a guide is a minimum only; a Stat Target gets a maximum only when a source states a range. So High means "a guide said this is too much", not merely "above a number".
- Crit Rate/Crit DMG targets come in two variants, Crit weapon and non-Crit weapon; the Equipped Weapon's secondary stat picks one.
- Gemini sometimes reads "2000-2400+" as a closed range; merging drops the max whenever a source's own quote shows the range ends in "+".
- Energy Regen is normalized to the stat-screen total (a guide saying "22% ER" means 122%).
- Per-source raw values and supporting quotes are kept in the JSON so the UI can show disagreement.
- A hand-written `override` field always wins and is never overwritten by a re-scrape.
- A failed source is skipped and recorded; the median uses whatever succeeded.
- Running the scrape needs `google-chrome-stable` on the machine. Each Chrome gets its own profile directory and a 90s timeout; parallel runs sharing the default profile hang.
- Weapons are re-read every run (one render). Profiles are scraped once and retried until Prydwen has Base Stats (8 newer characters have none yet). Sonata Sets are re-read only when the sheet tab changes, or with `--force sonata`.
