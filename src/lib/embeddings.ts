import "server-only";

/**
 * Embeddings con OpenAI text-embedding-3-small (1536 dims). ÚNICO uso de
 * OpenAI en el proyecto (CLAUDE.md); los bots hablan con Anthropic.
 * Sin OPENAI_API_KEY devuelve null y la búsqueda queda solo por palabras
 * clave: el conocimiento degrada, no se rompe.
 */
export async function embed(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
    });
    if (!res.ok) {
      console.error("[embeddings] OpenAI", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const json = await res.json();
    return json.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.error("[embeddings]", (e as Error).message);
    return null;
  }
}

export async function embedMany(texts: string[]): Promise<(number[] | null)[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || texts.length === 0) return texts.map(() => null);
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: texts.map((t) => t.slice(0, 8000)) }),
    });
    if (!res.ok) {
      console.error("[embeddings] OpenAI", res.status, (await res.text()).slice(0, 200));
      return texts.map(() => null);
    }
    const json = await res.json();
    const out: (number[] | null)[] = texts.map(() => null);
    for (const d of json.data ?? []) out[d.index] = d.embedding;
    return out;
  } catch (e) {
    console.error("[embeddings]", (e as Error).message);
    return texts.map(() => null);
  }
}
