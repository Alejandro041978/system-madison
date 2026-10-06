import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { embed, embedMany } from "@/lib/embeddings";

/**
 * Conocimiento de los bots (RAG).
 *  - indexarConocimiento: trocea el artículo y guarda embeddings.
 *  - buscarConocimiento: HÍBRIDA — palabras clave primero (ilike, ≤6
 *    palabras de ≥4 letras) y vectorial (umbral 0,20) en paralelo.
 *    NUNCA lanza: ante cualquier fallo devuelve lo que tenga (o nada);
 *    el bot responde sin conocimiento antes que caerse.
 */

export type Articulo = {
  id: string; bot_key: string; title: string; content: string; category: string | null;
  enabled: boolean; chunk_count: number; created_by: string | null; created_at: string; updated_at: string;
};
export const KNOWLEDGE_COLS = "id, bot_key, title, content, category, enabled, chunk_count, created_by, created_at, updated_at";

export type Resultado = { knowledge_id: string; title: string; content: string; via: "keyword" | "vector"; similarity?: number };

/** Trozos de ~1.000 caracteres cortando por párrafos (título delante para dar contexto al embedding). */
export function trocear(title: string, content: string, max = 1000): string[] {
  const parrafos = content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let actual = "";
  for (const p of parrafos) {
    if (actual && (actual.length + p.length + 2) > max) { chunks.push(actual); actual = ""; }
    actual = actual ? `${actual}\n\n${p}` : p;
    while (actual.length > max) { chunks.push(actual.slice(0, max)); actual = actual.slice(max); }
  }
  if (actual) chunks.push(actual);
  return chunks.map((c) => `${title}\n${c}`);
}

/** (Re)indexa un artículo: borra sus trozos y los vuelve a crear con embedding. Idempotente. */
export async function indexarConocimiento(knowledgeId: string): Promise<{ chunks: number; conEmbedding: number }> {
  const db = supabaseAdmin();
  const { data: art, error } = await db.from("knowledge").select(KNOWLEDGE_COLS).eq("id", knowledgeId).maybeSingle();
  if (error || !art) throw new Error(error?.message ?? "Artículo no encontrado");

  const chunks = trocear(art.title, art.content);
  const embeddings = await embedMany(chunks);
  await db.from("knowledge_chunks").delete().eq("knowledge_id", knowledgeId);
  if (chunks.length > 0) {
    const filas = chunks.map((content, i) => ({
      knowledge_id: knowledgeId, bot_key: art.bot_key, content, chunk_index: i, embedding: embeddings[i],
    }));
    const { error: e2 } = await db.from("knowledge_chunks").insert(filas);
    if (e2) throw new Error(e2.message);
  }
  await db.from("knowledge").update({ chunk_count: chunks.length }).eq("id", knowledgeId);
  return { chunks: chunks.length, conEmbedding: embeddings.filter(Boolean).length };
}

const STOPWORDS = new Set([
  "para", "como", "donde", "cuando", "sobre", "entre", "este", "esta", "estos", "estas", "pero", "porque", "puedo", "quiero",
  "necesito", "tengo", "hola", "buenas", "buenos", "gracias", "sois", "estáis", "vuestro", "vuestra", "hacer", "saber", "decir",
  "cual", "cuál", "cuánto", "cuanto", "cómo", "dónde", "también", "tiene", "tienen", "existe", "cuesta", "vale", "precio",
  // 3 letras frecuentes (se admiten palabras de 3 para no perder siglas como PPA/MBA; 2026-08-23)
  "los", "las", "por", "con", "que", "qué", "una", "uno", "del", "mas", "más", "hay", "son", "muy", "asi", "así", "sus",
  "nos", "les", "ese", "esa", "eso", "está", "esta", "aún", "aun", "hoy", "ver", "dar", "voy", "sea", "san",
]);

const sinTildes = (w: string) => w.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Palabras útiles de la consulta: ≥4 letras, sin vacías, máximo 6.
 * Conserva la forma original; el que busca añade la variante sin tildes
 * (2026-08-23: ilike es sensible a acentos y "duración"→"duracion" no
 * casaba con contenido escrito con tilde; lo cazó la prueba E2E).
 */
export function palabrasClave(q: string): string[] {
  return [...new Set(
    q.toLowerCase()
      .split(/[^a-záéíóúñü0-9]+/i)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !STOPWORDS.has(sinTildes(w))),
  )].slice(0, 6);
}

// Palabras de función puras: las únicas que no cuentan en el TÍTULO.
const FUNCION = new Set([
  "los", "las", "por", "con", "que", "qué", "una", "uno", "del", "mas", "más", "hay", "son", "muy", "asi", "así", "sus",
  "nos", "les", "ese", "esa", "eso", "está", "esta", "aún", "aun", "hoy", "ver", "dar", "voy", "sea", "para", "como",
  "pero", "este", "estos", "estas", "entre", "sobre", "hola", "buenas", "buenos", "gracias", "quiero", "puedo",
  "necesito", "tengo", "saber", "decir", "hacer", "también", "sois", "estáis", "vuestro", "vuestra", "porque",
]);

/**
 * Palabras que cuentan en el título. 2026-09-26 (634 artículos titulados como
 * preguntas): «cuánto», «cuesta», «dura» son vacías en el CONTENIDO (salen en
 * todas partes) pero en el TÍTULO son justo lo que distingue «¿Cuánto cuesta
 * el MBA?» de los otros 90 títulos con «MBA». Con la lista antigua la consulta
 * «cuánto cuesta el MBA» quedaba en «mba» y el precio no aparecía.
 */
export function palabrasTitulo(q: string): string[] {
  return [...new Set(
    q.toLowerCase()
      .split(/[^a-záéíóúñü0-9]+/i)
      .filter((w) => w.length >= 3 && !FUNCION.has(w) && !FUNCION.has(sinTildes(w))),
  )].slice(0, 6);
}

/**
 * 2026-08-23 (con 300 artículos reales): la keyword sin ranking llenaba el
 * cupo con coincidencias débiles ("cuesta" aparece en cualquier parte) y la
 * vectorial ya no corría. Ahora la keyword se PUNTÚA (título ×3, contenido
 * ×1 por palabra), la vectorial corre SIEMPRE, y se mezclan: mejores
 * keyword primero, la vectorial completa.
 */
export async function buscarConocimiento(botKey: string, query: string, limit = 4): Promise<Resultado[]> {
  const db = supabaseAdmin();
  const out: Resultado[] = [];
  try {
    const palabras = palabrasClave(query);     // cuentan en el contenido
    const enTitulo = palabrasTitulo(query);    // cuentan en el título
    const candidatas: { id: string; title: string; content: string; score: number }[] = [];
    if (palabras.length > 0 || enTitulo.length > 0) {
      // 2026-09-26 (con 553 artículos reales): un solo OR con todas las
      // palabras recortado a 32 filas dejaba fuera al artículo correcto,
      // porque «máster» casa con 279 títulos y llenaba el lote al azar
      // («¿cuántos créditos tiene marketing digital?» no encontraba su
      // artículo). Ahora se buscan candidatos POR PALABRA (las raras traen
      // su conjunto completo) y además con TODAS las palabras a la vez en el
      // título, para que el artículo exacto entre siempre al ranking aunque
      // cada palabra suelta sea común.
      const base = () => db.from("knowledge").select("id, title, content").eq("bot_key", botKey).eq("enabled", true);
      const orTitulo = (w: string) => [...new Set([w, sinTildes(w)])].map((v) => `title.ilike.%${v}%`).join(",");
      const consultas = [
        ...enTitulo.map((w) => base().or(orTitulo(w)).limit(100)),
        ...palabras.map((w) => base().or([...new Set([w, sinTildes(w)])].map((v) => `content.ilike.%${v}%`).join(",")).limit(30)),
      ];
      if (enTitulo.length > 1) consultas.push(enTitulo.reduce((q, w) => q.or(orTitulo(w)), base()).limit(20));
      const porPalabra = await Promise.all(consultas);
      const vistos = new Set<string>();
      const data = porPalabra.flatMap((r) => r.data ?? []).filter((k) => !vistos.has(k.id) && vistos.add(k.id));
      for (const k of data) {
        const titulo = sinTildes(k.title.toLowerCase());
        const cuerpo = sinTildes(k.content.toLowerCase());
        let score = 0;
        for (const w of enTitulo) if (titulo.includes(sinTildes(w))) score += 3;
        for (const w of palabras) {
          const v = sinTildes(w);
          if (!titulo.includes(v) && cuerpo.includes(v)) score += 1;
        }
        candidatas.push({ ...k, score });
      }
      candidatas.sort((a, b) => b.score - a.score);
    }
    // Las keyword FUERTES primero (título + algo más, o varios aciertos: una
    // sola palabra común como «máster» ya no basta); máx. la mitad del cupo.
    const fuertes = candidatas.filter((c) => c.score >= 4).slice(0, Math.max(1, Math.floor(limit / 2)));
    for (const k of fuertes) out.push({ knowledge_id: k.id, title: k.title, content: k.content.slice(0, 1500), via: "keyword" });

    // Vectorial SIEMPRE (si hay clave): completa el cupo con lo semántico.
    const v = await embed(query);
    if (v) {
      const { data } = await db.rpc("match_knowledge", {
        query_embedding: v, match_threshold: 0.2, match_count: limit, p_bot_key: botKey,
      });
      for (const m of data ?? []) {
        if (out.length >= limit) break;
        if (!out.some((x) => x.knowledge_id === m.knowledge_id)) {
          out.push({ knowledge_id: m.knowledge_id, title: m.title, content: m.content, via: "vector", similarity: m.similarity });
        }
      }
    }
    // Si aún queda cupo, rellenar con las keyword restantes por puntuación.
    for (const k of candidatas) {
      if (out.length >= limit) break;
      if (k.score > 0 && !out.some((x) => x.knowledge_id === k.id)) {
        out.push({ knowledge_id: k.id, title: k.title, content: k.content.slice(0, 1500), via: "keyword" });
      }
    }
  } catch (e) {
    // Nunca lanza: el bot responde sin conocimiento antes que caerse.
    console.error("[buscarConocimiento]", (e as Error).message);
  }
  return out.slice(0, limit);
}
