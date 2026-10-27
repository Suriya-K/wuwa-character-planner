// Model ids get retired and the free tier returns 503 under load (ADR 0001), so walk a fallback list
const MODELS = (process.env.GEMINI_MODELS ?? "gemini-3.5-flash-lite,gemini-3.7-flash,gemini-3.8-flash").split(",");
const RETRYABLE = new Set([404, 429, 500, 503]);

type Candidate = { text: string; urlRetrieved?: boolean };

// One answer from the first model that gives a usable one; `accept` rejects answers worth retrying elsewhere
async function generate(request: object, accept: (c: Candidate) => boolean, rounds = 3): Promise<Candidate> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  let lastError = "";
  for (let round = 0; round < rounds; round++) {
    for (const model of MODELS) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(90_000),
      }).catch((e: Error) => e);
      if (res instanceof Error) {
        lastError = `${model}: ${res.message}`;
        continue;
      }
      if (res.ok) {
        const body: any = await res.json();
        const c = body.candidates?.[0];
        const urls: any[] | undefined = c?.urlContextMetadata?.urlMetadata;
        const candidate = {
          text: c?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "",
          urlRetrieved: urls?.some((u) => u.urlRetrievalStatus === "URL_RETRIEVAL_STATUS_SUCCESS"),
        };
        if (accept(candidate)) return candidate;
        // Blocked or truncated answers come back as 200; treat them like an overloaded model
        lastError = `${model}: unusable response ${JSON.stringify(body).slice(0, 300)}`;
        continue;
      }
      lastError = `${model}: ${res.status} ${await res.text()}`;
      if (!RETRYABLE.has(res.status)) throw new Error(lastError);
    }
    // setTimeout, not Bun.sleep: this module also runs in Next.js API routes on Node
    if (round < rounds - 1) await new Promise((r) => setTimeout(r, 5_000 * (round + 1)));
  }
  throw new Error(`All Gemini models failed: ${lastError}`);
}

const parses = (text: string) => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

export async function generateJson<T>(parts: unknown[], responseSchema: object): Promise<T> {
  const { text } = await generate(
    { contents: [{ parts }], generationConfig: { responseMimeType: "application/json", responseSchema } },
    (c) => parses(c.text),
  );
  return JSON.parse(text) as T;
}

// Gemini fetches the URL itself (gets past Cloudflare where plain fetch can't); url_context can't be combined
// with a response schema, so this returns free text. `retrieved` is false when the page couldn't be fetched.
export async function generateFromUrl(prompt: string): Promise<{ text: string; retrieved: boolean }> {
  const { text, urlRetrieved } = await generate(
    { contents: [{ parts: [{ text: prompt }] }], tools: [{ url_context: {} }] },
    (c) => c.text.length > 0,
  );
  return { text, retrieved: !!urlRetrieved };
}
