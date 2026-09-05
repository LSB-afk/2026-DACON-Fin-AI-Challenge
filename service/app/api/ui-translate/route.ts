/**
 * 화면 자동 번역 라우트.
 *
 * GET  → 어떤 엔진이 연결돼 있는지 (화면이 "미연결"을 지어내지 않고 물어본다)
 * POST → { lang, texts[] } 를 { engine, translations[] } 로. 못 옮긴 줄은 null.
 *
 * 규율:
 *   - 키는 서버 환경변수에만 산다. 이 파일 밖에서 읽지 않는다.
 *   - 주민번호·전화번호류가 든 줄은 외부로 보내지 않고 null 로 돌려준다 (detectPII).
 *     화면은 그 줄을 한국어 그대로 둔다.
 *   - 같은 문장은 프로세스 캐시에서 준다 — 엔진을 두 번 부르지 않는다.
 *   - 한 요청에 120줄·줄당 600자까지. 그보다 크면 화면 번역이 아니라 오용이다.
 */

import { isUiLang, mtCode, uiLangInfo } from "@/lib/uiLang";
import { pickEngine, cacheGet, cacheSet, chunk, needsTranslation } from "@/lib/uiTranslate";
import { detectPII, rateLimit } from "@/lib/ai/guard";

export const maxDuration = 60;

export async function GET() {
  const e = pickEngine();
  return Response.json(e ? { engine: e.name, detail: e.detail } : { engine: null });
}

export async function POST(req: Request) {
  let body: { lang?: string; texts?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "본문이 JSON 이 아닙니다." }, { status: 400 });
  }
  const lang = body.lang;
  if (!lang || !isUiLang(lang) || lang === "ko")
    return Response.json({ error: "lang 이 필요합니다 (한국어 제외)." }, { status: 400 });
  const texts = body.texts;
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > 120)
    return Response.json({ error: "texts 는 1~120줄이어야 합니다." }, { status: 400 });
  if (!texts.every((t) => typeof t === "string" && t.length <= 600))
    return Response.json({ error: "줄당 600자까지입니다." }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  // 화면 하나가 묶음 몇 개를 연달아 보낸다 — 답변 번역(20/분)보다 넉넉히
  const rl = rateLimit(`ui-translate:${ip}`, 90);
  if (!rl.ok) return Response.json({ error: rl.error }, { status: rl.status });

  const engine = pickEngine();
  if (!engine)
    return Response.json(
      { engine: null, error: "번역 엔진이 없습니다 — GOOGLE_TRANSLATE_API_KEY 또는 ANTHROPIC_API_KEY/OLLAMA_URL 을 설정하세요." },
      { status: 501 },
    );

  const out: (string | null)[] = new Array(texts.length).fill(null);
  const 보낼: { i: number; src: string }[] = [];
  const 보낼중복 = new Map<string, number[]>();
  (texts as string[]).forEach((src, i) => {
    if (!needsTranslation(src)) {
      out[i] = src; // 한글 없음 — 옮길 것이 없다
      return;
    }
    if (detectPII(src).length) return; // 외부로 내보내지 않는다
    const hit = cacheGet(lang, src);
    if (hit !== undefined) {
      out[i] = hit;
      return;
    }
    const dup = 보낼중복.get(src);
    if (dup) {
      dup.push(i);
      return;
    }
    보낼중복.set(src, [i]);
    보낼.push({ i, src });
  });

  const target = { code: lang, mt: mtCode(lang), name: uiLangInfo(lang).name };
  try {
    for (const 묶음 of chunk(보낼, engine.batch)) {
      const got = await engine.translate(묶음.map((x) => x.src), target);
      묶음.forEach((x, k) => {
        const t = got[k];
        if (!t) return;
        cacheSet(lang, x.src, t);
        for (const idx of 보낼중복.get(x.src) ?? [x.i]) out[idx] = t;
      });
    }
    return Response.json({ engine: engine.name, detail: engine.detail, translations: out });
  } catch (e) {
    // 부분 성공분은 이미 out 에 있다 — 실패 이유와 함께 돌려준다. 화면은 나머지를 한국어로 둔다
    return Response.json(
      { engine: engine.name, detail: engine.detail, translations: out, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
