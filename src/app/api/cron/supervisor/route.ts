import { NextResponse } from "next/server";
import { evaluarTodos } from "@/lib/supervisor";
import { isoDate } from "@/lib/rates";

export const maxDuration = 300; // el análisis por bot puede tardar

/**
 * Cron diario del evaluador (vercel.json, 04:30). Idempotente: upsert por
 * (fecha, bot). ?dry=1 solo cuenta; ?date=YYYY-MM-DD evalúa otro día
 * (por defecto, AYER).
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const dry = sp.get("dry") === "1";
  const ayer = isoDate(new Date(Date.now() - 24 * 3600 * 1000));
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("date") ?? "") ? sp.get("date")! : ayer;
  try {
    const resultados = await evaluarTodos(fecha, dry);
    console.log(`[cron supervisor] ${fecha} dry=${dry}`, resultados.map((r) => `${r.bot_key}:${r.status}`).join(" "));
    return NextResponse.json({ fecha, dry, resultados });
  } catch (e) {
    console.error("[cron supervisor]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
