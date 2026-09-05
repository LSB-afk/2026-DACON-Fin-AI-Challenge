/** Observed model request boundaries. These describe HTTP requests, not provider-internal inference. */
import { 프롬프트_라우터, 프롬프트_추출, validateRouter, validateIntake } from "./ai/agent.ts";
import type { Provider, Usage } from "./ai/providers.ts";
import type { IntakeFields } from "./ai/apply.ts";

export type AgentResponse = {
  provider: string;
  model: string;
  utterance: string;
  router: { skill: string; evidence: string[]; filteredCount: number } | null;
  routerError: string | null;
  routerRaw: string;
  intake: {
    fields: IntakeFields;
    evidences: Partial<Record<keyof IntakeFields, string>>;
    questions: string[];
    discarded: { field: string; reason: string }[];
  } | null;
  intakeError: string | null;
  intakeRaw: string;
  routerUsage: Usage | null;
  intakeUsage: Usage | null;
};
export type RequestStage = "routing" | "extract";
export type RequestState = { status: "idle" | "running" | "completed" | "failed"; detail?: string; ms?: number };
export type AgentRequests = Record<RequestStage, RequestState>;
export const emptyAgentRequests = (): AgentRequests => ({ routing: { status: "idle" }, extract: { status: "idle" } });
export type RunIdentity = { runId: string; inputRevision: number; caseId?: string };
export type AgentEvent = RunIdentity & (
  | { type: "request"; stage: RequestStage; request: RequestState }
  | { type: "result"; result: AgentResponse }
  | { type: "error"; error: string }
);

export async function runAgentRequests(
  provider: Provider,
  utterance: string,
  identity: RunIdentity,
  emit: (event: AgentEvent) => void = () => {},
): Promise<AgentResponse> {
  const result: AgentResponse = {
    provider: provider.name, model: provider.model, utterance,
    router: null, routerError: null, routerRaw: "", routerUsage: null,
    intake: null, intakeError: null, intakeRaw: "", intakeUsage: null,
  };
  async function request(stage: RequestStage) {
    const start = performance.now();
    emit({ type: "request", ...identity, stage, request: { status: "running", detail: "제공자에 요청했습니다. 내부 대기·추론 상태는 제공되지 않습니다." } });
    try {
      if (stage === "routing") {
        const res = await provider.chat(프롬프트_라우터(utterance));
        result.routerUsage = res.usage;
        result.routerRaw = res.text.slice(0, 4000);
        result.router = validateRouter(res.text, utterance);
      } else {
        const res = await provider.chat(프롬프트_추출(utterance));
        result.intakeUsage = res.usage;
        result.intakeRaw = res.text.slice(0, 4000);
        result.intake = validateIntake(res.text, utterance);
      }
      emit({ type: "request", ...identity, stage, request: { status: "completed", ms: Math.round(performance.now() - start), detail: "응답을 수신하고 근거 계약을 검증했습니다." } });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (stage === "routing") result.routerError = detail;
      else result.intakeError = detail;
      emit({ type: "request", ...identity, stage, request: { status: "failed", ms: Math.round(performance.now() - start), detail } });
    }
  }
  await Promise.all([request("routing"), request("extract")]);
  return result;
}

/** Identity checks protect success, failure and finally callbacks even if a provider ignores abort. */
export class AgentRunScope {
  generation = 0;
  bumpGeneration() { this.generation += 1; }
  private current: (RunIdentity & { signal: AbortSignal; controller: AbortController }) | null = null;
  start(runId: string, inputRevision: number, caseId?: string) {
    this.invalidate();
    const controller = new AbortController();
    this.current = { runId, inputRevision, caseId, controller, signal: controller.signal };
    return this.current;
  }
  isCurrent(identity: RunIdentity) {
    return !!this.current && !this.current.signal.aborted && this.current.runId === identity.runId && this.current.inputRevision === identity.inputRevision && this.current.caseId === identity.caseId;
  }
  invalidate() {
    this.generation += 1;
    this.current?.controller.abort();
    this.current = null;
  }
}

/** Consume incremental events while preserving the existing JSON API for older servers/tools. */
export async function readAgentResponse(response: Response, identity: RunIdentity, onEvent: (event: AgentEvent) => void): Promise<AgentResponse> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `HTTP ${response.status}`);
  }
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) return response.json();
  if (!response.body) throw new Error("완료 응답을 받지 못했습니다.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let result: AgentResponse | null = null;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as AgentEvent;
    if (event.runId !== identity.runId || event.inputRevision !== identity.inputRevision) throw new Error("다른 실행의 응답을 받았습니다.");
    if (event.caseId !== undefined && event.caseId !== identity.caseId) throw new Error("다른 상담의 실행 응답을 받았습니다.");
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "result") result = event.result;
    else if (event.type !== "request" || !["routing", "extract"].includes(event.stage) || !["idle", "running", "completed", "failed"].includes(event.request?.status)) throw new Error("실행 이벤트 형식이 올바르지 않습니다.");
    onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffered += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      lines.forEach(consume);
      if (done) break;
    }
    consume(buffered);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!result) throw new Error("완료 응답을 받지 못했습니다. 연결이 중간에 끊겼습니다.");
  return result;
}
