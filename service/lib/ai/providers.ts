/**
 * 3단 번역 제공자 — 환경변수가 고른다. 서버 전용(라우트 핸들러에서만 import).
 *
 *   ANTHROPIC_API_KEY 있음 → Anthropic (배포 기본. Vercel 서버리스에서 돈다)
 *   없고 OLLAMA_URL 있음   → Ollama   (로컬 개발·내부망 온프레미스 실증)
 *   둘 다 없음             → null     (화면은 '미연결'을 정직하게 표시)
 *
 * 왜 이 순서인가: 배포 환경에 둘 다 설정돼 있으면 품질이 검증된 쪽이 이겨야 한다.
 * 크메르어·네팔어 같은 저자원 언어에서 8B 로컬 모델은 자주 틀리고, 틀린 번역은
 * 계약(contract.ts)이 걸러 원문 폴백이 되므로 사용자 피해는 없지만, 폴백만 나가는
 * 배포는 번역 기능이 없는 것과 같다.
 *
 * SDK 를 쓰지 않고 fetch 만 쓰는 이유: 의존성 하나가 늘면 9/7~9/11 무중단 구간에
 * 깨질 수 있는 것이 하나 는다. 두 API 모두 POST 한 번이면 충분하다.
 *
 * 사용량(usage) — 2026-08-28: 두 API 모두 응답에 토큰 수를 실어 주는데 버리고 있었다.
 * 모델 호출은 이 제품에서 돈이 드는 유일한 자리라, 감사 기록이 호출·토큰·시간을
 * 원장으로 세지 않으면 "비용 통제"가 말뿐이 된다. chat 은 이제 본문과 사용량을
 * 함께 돌려준다. 시간은 performance.now() 로 잰다 — 지연은 측정값이지 판정 입력이
 * 아니므로 결정성 규율(시계 금지)의 대상이 아니다.
 */

export type Usage = {
  /** 왕복 시간 (ms, 정수) */
  ms: number;
  /** 프롬프트 토큰 — 제공자가 알려줄 때만 */
  inTok?: number;
  /** 생성 토큰 — 제공자가 알려줄 때만 */
  outTok?: number;
};

export type ChatResult = { text: string; usage: Usage };

export type Provider = {
  name: "anthropic" | "ollama";
  model: string;
  /** 프롬프트 하나 → 본문 + 사용량. 실패는 던진다 — 부르는 쪽이 원문 폴백한다 */
  chat(prompt: string): Promise<ChatResult>;
};

/*
 * 시한은 제공자별이다. 실측 — 2026-08-28, gemma4 8B(Q4)가 답변 22줄 번역에 60초를
 * 넘겼다. 로컬 모델은 돌리는 기계에 따라 몇 배씩 느려질 수 있어 여유를 크게 두고,
 * 배포용 Anthropic 은 몇 초면 끝나므로 짧게 유지한다 — 심사자가 죽은 요청을
 * 3분씩 기다리게 만들지 않는다.
 */
const 시한 = { anthropic: 60_000, ollama: 180_000 } as const;

/** 시한 초과를 읽을 수 있는 문장으로 바꾼다 — 화면이 이 메시지를 그대로 보여준다 */
async function 응답(
  name: "anthropic" | "ollama",
  run: () => Promise<ChatResult>,
): Promise<ChatResult> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError")
      throw new Error(
        `${name} 응답 시한(${시한[name] / 1000}초) 초과 — 로컬 모델이면 기계 성능에 따라 느릴 수 있습니다. 다시 시도하거나 짧은 케이스로 확인하세요.`,
      );
    throw e;
  }
}

export function pickProvider(env = process.env): Provider | null {
  if (env.ANTHROPIC_API_KEY) {
    const key = env.ANTHROPIC_API_KEY;
    const model = env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
    return {
      name: "anthropic",
      model,
      chat: (prompt) =>
        응답("anthropic", async () => {
          const t0 = performance.now();
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model,
              max_tokens: 4096,
              messages: [{ role: "user", content: prompt }],
            }),
            signal: AbortSignal.timeout(시한.anthropic),
          });
          if (!r.ok) throw new Error(`anthropic ${r.status}: ${await r.text()}`);
          const j = (await r.json()) as {
            content: { type: string; text?: string }[];
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          return {
            text: j.content
              .filter((c) => c.type === "text")
              .map((c) => c.text ?? "")
              .join(""),
            usage: {
              ms: Math.round(performance.now() - t0),
              inTok: j.usage?.input_tokens,
              outTok: j.usage?.output_tokens,
            },
          };
        }),
    };
  }

  if (env.OLLAMA_URL) {
    const base = env.OLLAMA_URL.replace(/\/$/, "");
    const model = env.OLLAMA_MODEL ?? "gemma4:latest";
    return {
      name: "ollama",
      model,
      chat: (prompt) =>
        응답("ollama", async () => {
          const t0 = performance.now();
          const r = await fetch(`${base}/api/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              model,
              stream: false,
              // 번역은 같은 입력 → 같은 출력이어야 재현된다. 창의성은 여기서 결함이다
              options: { temperature: 0 },
              messages: [{ role: "user", content: prompt }],
            }),
            signal: AbortSignal.timeout(시한.ollama),
          });
          if (!r.ok) throw new Error(`ollama ${r.status}: ${await r.text()}`);
          const j = (await r.json()) as {
            message?: { content?: string };
            prompt_eval_count?: number;
            eval_count?: number;
          };
          return {
            text: j.message?.content ?? "",
            usage: {
              ms: Math.round(performance.now() - t0),
              inTok: j.prompt_eval_count,
              outTok: j.eval_count,
            },
          };
        }),
    };
  }

  return null;
}
