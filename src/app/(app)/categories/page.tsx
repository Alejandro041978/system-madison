import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { CategoriesTable, type CategoryRow } from "./CategoriesTable";

export const metadata = { title: "Categorías" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const identity = await guardPage("categories", "/categories");
  const db = supabaseAdmin();
  const [cats, progs] = await Promise.all([
    db.from("academic_programs_category").select("id, name, sigla, passing_score, description, external_id").order("name"),
    db.from("academic_programs").select("id, category_id"),
  ]);
  const conteo: Record<string, number> = {};
  for (const p of progs.data ?? []) conteo[p.category_id] = (conteo[p.category_id] ?? 0) + 1;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Categorías de programa</h1>
      <p className="text-sm text-slate-500 mb-6">
        La nota mínima aprobatoria es de la categoría y manda sobre cualquier valor guardado en una nota.
      </p>
      {cats.error && <div className="mb-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{cats.error.message}</div>}
      <CategoriesTable rows={(cats.data ?? []) as CategoryRow[]} programas={conteo} canEdit={puedeEditarPagina(identity, "categories")} />
    </div>
  );
}
