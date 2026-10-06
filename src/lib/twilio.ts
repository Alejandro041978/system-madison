import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio (WhatsApp). Credenciales SOLO en variables de entorno.
 *  - validarWebhook: AccountSid + firma HMAC-SHA1 (X-Twilio-Signature).
 *  - twiml: respuesta XML al webhook (no necesita credenciales).
 *  - enviarWhatsApp: envío proactivo por REST (campañas de retención,
 *    plantillas fuera de la ventana de 24 h).
 *
 * Trampa conocida (BLUEPRINT): fuera de la ventana de 24 h solo sale
 * plantilla aprobada; los envíos libres fallan con 63016.
 */

export function validarWebhook(url: string, params: Record<string, string>, firma: string | null): { ok: boolean; motivo?: string } {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { ok: false, motivo: "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN sin configurar" };
  if (params.AccountSid !== sid) return { ok: false, motivo: "AccountSid no coincide" };
  if (!firma) return { ok: false, motivo: "Sin X-Twilio-Signature" };

  // Algoritmo oficial: url + claves ordenadas con sus valores, HMAC-SHA1 base64.
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const esperada = createHmac("sha1", token).update(Buffer.from(data, "utf8")).digest("base64");
  const a = Buffer.from(esperada);
  const b = Buffer.from(firma);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, motivo: "Firma inválida" };
  return { ok: true };
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Respuesta TwiML. WhatsApp corta en ~1600 caracteres: se parte en varios <Message>. */
export function twiml(...mensajes: string[]): Response {
  const partes: string[] = [];
  for (const m of mensajes.filter((x) => x && x.trim())) {
    let resto = m.trim();
    while (resto.length > 1500) {
      const corte = resto.lastIndexOf("\n", 1500);
      const i = corte > 800 ? corte : 1500;
      partes.push(resto.slice(0, i));
      resto = resto.slice(i).trim();
    }
    if (resto) partes.push(resto);
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?><Response>${partes.map((p) => `<Message>${xmlEscape(p)}</Message>`).join("")}</Response>`;
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}

/** Envío proactivo. `to`/`from` en formato whatsapp:+34… ; contentSid para plantillas. */
export async function enviarWhatsApp(p: { to: string; from: string; body?: string; contentSid?: string; contentVariables?: Record<string, string> }): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { ok: false, error: "Twilio sin configurar" };
  const form = new URLSearchParams({ To: p.to, From: p.from });
  // 2026-10-02: sin StatusCallback no sabíamos si un envío llegó (93 de 500 no se entregaron y figuraban «enviados»).
  const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (app?.startsWith("https://")) form.set("StatusCallback", `${app}/api/whatsapp/status`);
  if (p.contentSid) {
    form.set("ContentSid", p.contentSid);
    if (p.contentVariables) form.set("ContentVariables", JSON.stringify(p.contentVariables));
  } else if (p.body) {
    form.set("Body", p.body);
  } else {
    return { ok: false, error: "Falta body o contentSid" };
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: `${json.code}: ${json.message}` };
    return { ok: true, sid: json.sid };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
