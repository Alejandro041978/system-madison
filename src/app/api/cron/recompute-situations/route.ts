import { NextResponse } from "next/server";
import { recomputeSituations } from "@/lib/situations";

/**
 * Cron de respaldo del motor de situación (vercel.json). Idempotente.
 *   Authorization: Bearer ${CRON_SECRET}   ·   ?dry=1 para ensayo
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const r = await recomputeSituations({ dry, actor: "cron" });
    console.log(`[cron recompute-situations] dry=${dry} revisados=${r.revisados} cambios=${r.cambios.length}`);
    return NextResponse.json(r);
  } catch (e) {
    console.error("[cron recompute-situations]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
