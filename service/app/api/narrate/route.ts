/**
 * 3단 번역 라우트 — 이 저장소에서 유일하게 모델을 부르는 자리.
 *
 * GET  → 어떤 제공자가 연결돼 있는지 (화면이 '미연결'을 지어내지 않고 물어본다)
 * POST → 조립된 답변(Answer)을 대상 언어로 번역
 *
 * 규율: 번역은 lib/narrate.ts 가 조립한 문장을 옮길 뿐이다. 금액·날짜·조문이
 * 하나라도 어긋나면 contract.ts 의 숫자 보존 검증이 던지고, 이 라우트는 502 로
 * 답한다 — 클라이언트는 한국어 원문으로 폴백한다. 틀린 번역이 나가는 길은 없다.
 *
 * 키는 서버 환경변수에만 산다. 클라이언트 번들에 NEXT_PUBLIC_ 로 새는 순간
 * 심사 기간에 아무나 키를 뽑아 쓸 수 있다 — 그래서 이 파일 밖에서 키를 읽지 않는다.
 */

import { pickProvider } from "@/lib/ai/providers";
import { detectPII, rateLimit } from "@/lib/ai/guard";

/** Vercel 함수 시간제한 — Anthropic 시한(60초)과 같게. 기본값이 더 짧으면 여기서 잘린다 */
export const maxDuration = 60;
import {
  pack,
  unpack,
  rebuild,
  숫자보존위반,
  프롬프트,
  언어들,
} from "@/lib/ai/contract";
import type { Answer } from "@/lib/narrate";

export async function GET() {
  const p = pickProvider();
  return Response.json(
    p ? { provider: p.name, model: p.model } : { provider: null },
  );
}

export async function POST(req: Request) {
  const rid = crypto.randomUUID();
  const json = (data: unknown, status = 200) =>
    Response.json(data, { status, headers: { "x-request-id": rid } });

  let body: { answer?: Answer; lang?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "본문이 JSON 이 아닙니다." }, 400);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = rateLimit(`narrate:${ip}`);
  if (!rl.ok) return json({ error: rl.error }, rl.status);

  const p = pickProvider();
  if (!p)
    return json(
      { error: "번역 제공자가 없습니다 — ANTHROPIC_API_KEY 또는 OLLAMA_URL 을 설정하세요." },
      501,
    );
  const 언어 = 언어들.find((l) => l.code === body.lang);
  const a = body.answer;
  if (!언어 || !a || !Array.isArray(a.blocks))
    return Response.json({ error: "answer 와 lang 이 필요합니다." }, { status: 400 });

  const lines = pack(a);
  // 실행당 문장 십수 줄이 정상이다. 그보다 훨씬 크면 답변이 아니라 오용이다
  if (lines.length === 0 || lines.length > 120)
    return json({ error: "줄 수가 답변 범위를 벗어났습니다." }, 400);
  // 조립된 답변은 판정·픽스처에서 오지만, 사용자가 폼에 넣은 자유 텍스트(공제 라벨 등)가
  // 섞일 수 있다 — 전송 전에 한 번 더 거른다
  const pii = detectPII(lines.join("\n"));
  if (pii.length)
    return json(
      { error: `답변에 ${pii.join(", ")}가 있어 번역하지 않았습니다. 입력에서 지우고 다시 판정하세요.` },
      400,
    );

  // 사용량은 실패해도 돌려준다 — 계약에 걸려 버린 호출도 돈은 이미 쓴 호출이다.
  // 원장이 통과한 호출만 세면 "비용 추적"이 아니라 "성공 추적"이다.
  let usage: import("@/lib/ai/providers").Usage | null = null;
  try {
    const res = await p.chat(프롬프트(언어.name, lines));
    usage = res.usage;
    const t = unpack(res.text, lines.length);
    const 위반 = 숫자보존위반(lines, t);
    if (위반.length)
      throw new Error(`숫자 보존 위반 ${위반.length}건 — ${위반[0]}`);
    return Response.json({
      provider: p.name,
      model: p.model,
      usage,
      answer: rebuild(a, t),
    });
  } catch (e) {
    // 실패의 이유를 그대로 돌려준다 — 화면은 원문 폴백 + 이유 표시로 정직하게 남는다
    return Response.json(
      { error: e instanceof Error ? e.message : String(e), usage },
      { status: 502 },
    );
  }
}
