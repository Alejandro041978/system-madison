import "server-only";

/**
 * PostgREST corta en 1.000 filas SIN avisar (CLAUDE.md). Toda lectura que
 * pueda superarlas pasa por aquí: pagina con .range() hasta recibir menos
 * de 1.000. Requiere que la consulta venga ORDENADA por una columna estable.
 *
 * Uso: const rows = await fetchAll(db.from("x").select("*").order("id"));
 */
const PAGE = 1000;

type Paginable = {
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

export async function fetchAll<T>(query: Paginable): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

/** Parte una lista de ids en lotes (~150) para .in(): las URL largas fallan. */
export function lotes<T>(items: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
