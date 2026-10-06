import { guardPage, puedeEditarPagina, puedeBorrarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { historialTarifas, tarifaVigente, isoDate, type CreditRate } from "@/lib/rates";
import { RatesPanel } from "./RatesPanel";

export const metadata = { title: "Tarifario" };
export const dynamic = "force-dynamic";

export default async function RatesPage({ searchParams }: PageProps<"/rates">) {
  const identity = await guardPage("rates", "/rates");
  const sp = await searchParams;
  const db = supabaseAdmin();

  const [cats, progs] = await Promise.all([
    db.from("academic_programs_category").select("id, name, sigla").order("name"),
    db.from("academic_programs").select("id, name, code, category_id, active").order("name"),
  ]);

  const program_id = typeof sp.program_id === "string" ? sp.program_id : "";
  const category_id = typeof sp.category_id === "string" ? sp.category_id : "";
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : isoDate();

  let historial: CreditRate[] = [];
  let vigente = null;
  let error: string | null = null;
  try {
    if (program_id) {
      historial = await historialTarifas({ program_id });
      vigente = await tarifaVigente(program_id, date);
    } else if (category_id) {
      historial = await historialTarifas({ category_id });
    }
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Tarifario por crédito</h1>
      <p className="text-sm text-slate-500 mb-6">
        Inmutable por versiones: un cambio de precio es una versión nueva con fecha de vigencia. Solo se borran versiones que ninguna matrícula haya usado.
        El programa manda sobre la categoría.
      </p>
      {error && <div className="mb-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
      <RatesPanel
        categories={cats.data ?? []}
        programs={progs.data ?? []}
        selected={{ program_id, category_id, date }}
        historial={historial}
        vigente={vigente}
        today={isoDate()}
        canEdit={puedeEditarPagina(identity, "rates")}
        canDelete={puedeBorrarPagina(identity, "rates")}
      />
    </div>
  );
}
