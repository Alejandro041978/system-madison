import { NextResponse } from "next/server";
import { despacharCampanasActivas } from "@/lib/campaigns";

export const maxDuration = 300;

/**
 * Despacho de campañas salientes (vercel.json: cada hora de 09 a 19 UTC).
 * Idempotente: cada destinatario pasa de pendiente a enviado/error una vez;
 * el tope diario por campaña se respeta contando enviados de hoy.
 * ?dry=1 solo cuenta cupos y pendientes.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const resultados = await despacharCampanasActivas(dry);
    console.log(`[cron campaign-dispatch] dry=${dry}`, resultados.map((r) => `${r.campaign}: ${r.enviados}/${r.pendientes} (err ${r.errores})`).join(" · ") || "sin campañas activas");
    return NextResponse.json({ dry, resultados });
  } catch (e) {
    console.error("[cron campaign-dispatch]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
