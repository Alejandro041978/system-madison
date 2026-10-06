import { NextResponse } from "next/server";
import { sincronizarEntregas } from "@/lib/campaigns";

export const maxDuration = 300;

/**
 * Respaldo del aviso de estado de Twilio (vercel.json: cada hora, minuto 30).
 * Pregunta a Twilio por los envíos cuyo estado de entrega aún puede cambiar
 * y lo registra. Idempotente: el estado solo avanza. ?dry=1 solo cuenta.
 * La primera pasada tras el SQL 012 rellena los envíos anteriores al aviso.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const r = await sincronizarEntregas(dry);
    console.log(`[cron delivery-sync] dry=${dry} revisados=${r.revisados} cambiados=${r.cambiados} fallos=${r.fallosConsulta}`);
    return NextResponse.json(r);
  } catch (e) {
    console.error("[cron delivery-sync]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
