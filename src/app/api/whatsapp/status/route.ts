import { validarWebhook } from "@/lib/twilio";
import { normalizarEstadoEntrega, registrarEntrega } from "@/lib/campaigns";

/**
 * Aviso de estado de Twilio (StatusCallback de cada envío de campaña):
 * sent → delivered → read, o undelivered/failed con ErrorCode.
 * Público a propósito, como el webhook de mensajes: lo autentica la firma
 * HMAC de Twilio. Siempre responde 200 salvo firma inválida: un 5xx haría
 * que Twilio reintente, y el cron delivery-sync ya cubre lo que se pierda.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const v = validarWebhook(`${proto}://${host}${url.pathname}`, params, req.headers.get("x-twilio-signature"));
  if (!v.ok) {
    console.warn("[status] rechazado:", v.motivo);
    return new Response("Forbidden", { status: 403 });
  }

  const estado = normalizarEstadoEntrega(params.MessageStatus);
  if (estado && params.MessageSid) {
    try {
      await registrarEntrega(params.MessageSid, estado, params.ErrorCode || null);
    } catch (e) {
      console.error("[status]", params.MessageSid, (e as Error).message);
    }
  }
  return new Response(null, { status: 200 });
}
