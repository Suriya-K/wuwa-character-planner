# Gemini vision for screenshot reading, not Tesseract

Screenshots come from a Thai-language PC client with stylized fonts over textured backgrounds, which Tesseract reads poorly. We send them to Gemini Flash (free tier) through a Next.js API route that returns structured JSON, and the user confirms every value in an editable form before it is used.

Validated 2026-10-27 by `prototype/spike.ts`: `gemini-3.5-flash-lite` read 3/3 Thai-client screenshots with every value correct (Thai stat names, flat vs %, Secondary Main Stat). Latency 3–30s.

## Consequences

- Model ids churn (`gemini-2.5-flash` was closed to new keys) and bigger free-tier models return 503 under load, so the model is an env var with a fallback list, and the UI must tolerate a ~30s read.

- The Gemini key lives in Vercel env, so the API route is public and the whole app sits behind a single-password gate (`APP_PASSWORD`).
- Free-tier requests may be used by Google for training; acceptable because inputs are game screenshots only. Images are discarded after reading.
