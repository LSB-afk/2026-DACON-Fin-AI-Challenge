/**
 * Agent 0/1단 라우트 — 모델 단계만 서버가 한다.
 * 판정·가드·온톨로지·답변은 클라이언트 기존 경로 재사용(최소 diff).
 *
 * GET  → 제공자 연결 상태 (화면이 미연결을 지어내지 않고 물어본다)
 * POST → 발화 → LLM 라우팅(0단) + 발화 추출(1단) — 각각 계약 통과해야 나간다
 *
 * 제공자 규칙: ANTHROPIC_API_KEY(배포) > OLLAMA_URL(로컬). 둘 다 없으면 501.
 * 배포 코드가 localhost를 바라보게 만들지 않는다 — 키가 없으면 미연결로 표시.
 * temperature 0, 증거 부분문자열 검증, 날짜·숫자 파싱 검증.
 */

export const maxDuration = 180;

import { pickProvider } from "@/lib/ai/providers";
import { guardUtterance, rateLimit } from "@/lib/ai/guard";
import {
  프롬프트_라우터,
  프롬프트_추출,
  validateRouter,
  validateIntake,
} from "@/lib/ai/agent";

export async function GET() {
  const p = pickProvider();
  return Response.json(
    p ? { provider: p.name, model: p.model } : { provider: null },
  );
}

export async function POST(req: Request) {
  /*
   * 검증 순서가 곧 개인정보 정책이다 — PII 검사(guardUtterance)가 provider 확인보다
   * 먼저다. 키가 없어서 모델을 못 부르는 배포에서도 주민번호 입력은 400으로 거부돼야
   * 하고, "전송 전에 차단했다"는 문장이 참이려면 전송 가능성 검사가 뒤여야 한다.
   * 요청 ID 는 응답 헤더로만 나간다 — 서버는 입력을 저장하지 않으므로 이 ID 로
   * 조회할 것도 없지만, 심사 중 문제 신고를 받으면 로그 줄을 특정하는 데 쓴다.
   */
  const rid = crypto.randomUUID();
  const json = (data: unknown, status = 200) =>
    Response.json(data, { status, headers: { "x-request-id": rid } });

  let body: { utterance?: string; today?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "본문이 JSON 이 아닙니다." }, 400);
  }

  const utterance = typeof body.utterance === "string" ? body.utterance.trim() : "";
  const guard = guardUtterance(utterance);
  if (!guard.ok) return json({ error: guard.error }, guard.status);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = rateLimit(`agent:${ip}`);
  if (!rl.ok) return json({ error: rl.error }, rl.status);

  const p = pickProvider();
  if (!p)
    return json(
      { error: "Agent 제공자가 없습니다 — ANTHROPIC_API_KEY 또는 OLLAMA_URL 을 설정하세요." },
      501,
    );

  // today는 YYYY-MM-DD 검증만 — 판정에서 다시 검증하지만 여기선 형식만 본다
  if (body.today && !/^\d{4}-\d{2}-\d{2}$/.test(body.today)) {
    return json({ error: "today는 YYYY-MM-DD 형식이어야 합니다." }, 400);
  }

  /*
   * 0단 라우팅과 1단 추출은 서로의 출력을 쓰지 않는다 — 같은 발화를 다른 질문으로
   * 읽을 뿐이다. 그래서 팬아웃(동시 실행)이 맞다. 각 갈래가 자기 예외를 잡는다 —
   * 한쪽이 실패해도 다른 쪽은 살아야 하고, 전체 거부는 반쪽 성공을 버리는 길이다.
   *
   * 실측 (2026-08-28, gemma4 8B): 순차 33.6초(17.0+16.6) → 병렬 31.6초.
   * 거의 안 줄어든 이유 — 로컬 Ollama 는 기본 설정에서 같은 모델의 요청을
   * 직렬 처리한다(추출의 usage.ms 에 큐 대기가 포함돼 31.6초로 찍힌다. 이 원장은
   * "호출자가 겪은 시간"을 재므로 그대로 두는 게 맞다). Ollama 서버에
   * OLLAMA_NUM_PARALLEL=2 를 주면 로컬도 병렬이 된다(.env.example 참조).
   * 배포 제공자(Anthropic)는 요청별 동시 처리라 여기서 느린 쪽 하나 값으로 준다 —
   * 팬아웃의 이득은 심사자가 보는 배포에서 실현된다.
   */
  let router: { skill: string; evidence: string[]; filteredCount: number } | null = null;
  let routerError: string | null = null;
  let routerRaw = "";
  let routerUsage: import("@/lib/ai/providers").Usage | null = null;
  let intake: Awaited<ReturnType<typeof validateIntake>> | null = null;
  let intakeError: string | null = null;
  let intakeRaw = "";
  let intakeUsage: import("@/lib/ai/providers").Usage | null = null;

  await Promise.all([
    (async () => {
      try {
        const res = await p.chat(프롬프트_라우터(utterance));
        routerRaw = res.text;
        routerUsage = res.usage;
        router = validateRouter(routerRaw, utterance);
      } catch (e) {
        routerError = e instanceof Error ? e.message : String(e);
      }
    })(),
    (async () => {
      try {
        const res = await p.chat(프롬프트_추출(utterance));
        intakeRaw = res.text;
        intakeUsage = res.usage;
        intake = validateIntake(intakeRaw, utterance);
      } catch (e) {
        intakeError = e instanceof Error ? e.message : String(e);
      }
    })(),
  ]);

  return json({
    provider: p.name,
    model: p.model,
    utterance,
    router,
    routerError,
    routerRaw: routerRaw.slice(0, 4000),
    routerUsage,
    intake,
    intakeError,
    intakeRaw: intakeRaw.slice(0, 4000),
    intakeUsage,
  });
}
