import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Cliente Anthropic de los bots. Modelo fijado en CLAUDE.md: claude-opus-4-8
 * (sobreescribible con BOT_MODEL). En Opus 4.8 no se envía temperature ni
 * budget_tokens (la API los rechaza); sin `thinking` responde directo, que
 * es lo que un chat de WhatsApp necesita.
 */

let singleton: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!singleton) singleton = new Anthropic();
  return singleton;
}

export const BOT_MODEL = process.env.BOT_MODEL || "claude-opus-4-8";

export function hayAnthropic(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export type ToolHandler = (input: Record<string, unknown>) => Promise<string>;

/**
 * Conversación con bucle de tools manual (máx. 4 vueltas). Devuelve el texto
 * final. Los errores suben al llamador: el webhook decide el mensaje de
 * cortesía y deja el error en consola.
 */
export async function conversar(p: {
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
  handlers?: Record<string, ToolHandler>;
  maxTokens?: number;
}): Promise<{ texto: string; toolsUsadas: string[] }> {
  const client = anthropic();
  const messages: Anthropic.MessageParam[] = [...p.messages];
  const toolsUsadas: string[] = [];

  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const response = await client.messages.create({
      model: BOT_MODEL,
      max_tokens: p.maxTokens ?? 1024,
      system: p.system,
      messages,
      ...(p.tools?.length ? { tools: p.tools } : {}),
    });

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        toolsUsadas.push(block.name);
        const handler = p.handlers?.[block.name];
        let out = "";
        let isError = false;
        if (!handler) {
          out = `Tool ${block.name} no disponible`;
          isError = true;
        } else {
          try {
            out = await handler(block.input as Record<string, unknown>);
          } catch (e) {
            out = (e as Error).message;
            isError = true;
          }
        }
        results.push({ type: "tool_result", tool_use_id: block.id, content: out, ...(isError ? { is_error: true } : {}) });
      }
      // Todos los tool_result en UN solo mensaje user (si se parten, el modelo
      // deja de hacer llamadas en paralelo).
      messages.push({ role: "user", content: results });
      continue;
    }

    const texto = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return { texto, toolsUsadas };
  }
  return { texto: "", toolsUsadas };
}
