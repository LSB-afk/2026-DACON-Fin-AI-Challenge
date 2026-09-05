/** Model request boundaries are streamed on opt-in; existing JSON consumers keep the same response. */
export const maxDuration = 180;

import { pickProvider } from "@/lib/ai/providers";
import { guardUtterance, rateLimit } from "@/lib/ai/guard";
import { runAgentRequests, type AgentEvent } from "@/lib/agentExecution";

export async function GET() {
  const p = pickProvider();
  return Response.json(p ? { provider: p.name, model: p.model } : { provider: null });
}

export async function POST(req: Request) {
  const rid = crypto.randomUUID();
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "x-request-id": rid } });
  let body: { utterance?: string; today?: string; runId?: string; inputRevision?: number; caseId?: string };
  try { body = await req.json(); }
  catch { return json({ error: "본문이 JSON 이 아닙니다." }, 400); }
  if (!body || typeof body !== "object") return json({ error: "본문이 JSON 객체여야 합니다." }, 400);

  // Input/PII protection precedes provider selection, even when no provider is configured.
  const utterance = typeof body.utterance === "string" ? body.utterance.trim() : "";
  const guard = guardUtterance(utterance);
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = rateLimit("agent:" + ip);
  if (!rl.ok) return json({ error: rl.error }, rl.status);
  const p = pickProvider();
  if (!p) return json({ error: "Agent 제공자가 없습니다 — ANTHROPIC_API_KEY 또는 OLLAMA_URL 을 설정하세요." }, 501);
  if (body.today && (typeof body.today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.today))) return json({ error: "today는 YYYY-MM-DD 형식이어야 합니다." }, 400);

  const identity = {
    runId: typeof body.runId === "string" && /^[\w-]{1,100}$/.test(body.runId) ? body.runId : rid,
    inputRevision: typeof body.inputRevision === "number" && Number.isSafeInteger(body.inputRevision) && body.inputRevision >= 0 ? body.inputRevision : 0,
    caseId: typeof body.caseId === "string" && /^[\w-]{1,100}$/.test(body.caseId) ? body.caseId : undefined,
  };
  if (!req.headers.get("accept")?.includes("application/x-ndjson")) return json(await runAgentRequests(p, utterance, identity));

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => {
        // Providers may still finish after a disconnected client. Never enqueue on a closed stream.
        if (closed || req.signal.aborted) return;
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        const result = await runAgentRequests(p, utterance, identity, send);
        send({ type: "result", ...identity, result });
      } catch (error) {
        send({ type: "error", ...identity, error: error instanceof Error ? error.message : String(error) });
      } finally {
        if (!closed) { closed = true; controller.close(); }
      }
    },
    cancel() { closed = true; },
  });
  return new Response(stream, { headers: {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store, no-transform",
    "x-accel-buffering": "no",
    "x-request-id": rid,
  } });
}
