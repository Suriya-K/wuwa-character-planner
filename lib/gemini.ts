// Model ids get retired and the free tier returns 503 under load (ADR 0001), so walk a fallback list
const MODELS = (process.env.GEMINI_MODELS ?? "gemini-3.5-flash-lite,gemini-3.7-flash,gemini-3.8-flash").split(",");
const RETRYABLE = new Set([404, 429, 500, 503]);

export async function generateJson<T>(parts: unknown[], responseSchema: object, rounds = 3): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  let lastError = "";
  for (let round = 0; round < rounds; round++) {
    for (const model of MODELS) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: "application/json", responseSchema },
        }),
        signal: AbortSignal.timeout(90_000),
      }).catch((e: Error) => e);
      if (res instanceof Error) {
        lastError = `${model}: ${res.message}`;
        continue;
      }
      if (res.ok) {
        const body: any = await res.json();
        const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
        try {
          return JSON.parse(text) as T;
        } catch {
          // Blocked or truncated answers come back as 200; treat them like an overloaded model
          lastError = `${model}: unusable response ${JSON.stringify(body).slice(0, 300)}`;
          continue;
        }
      }
      lastError = `${model}: ${res.status} ${await res.text()}`;
      if (!RETRYABLE.has(res.status)) throw new Error(lastError);
    }
    // setTimeout, not Bun.sleep: this module also runs in Next.js API routes on Node
    if (round < rounds - 1) await new Promise((r) => setTimeout(r, 5_000 * (round + 1)));
  }
  throw new Error(`All Gemini models failed: ${lastError}`);
}
