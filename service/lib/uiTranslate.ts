/**
 * 화면 텍스트 자동 번역 엔진 — 서버 전용(라우트 핸들러에서만 import).
 *
 * 화면의 한국어 문자열 묶음을 받아 대상 언어 문자열 묶음으로 돌려준다. 어느 엔진을
 * 쓸지는 환경변수가 고른다:
 *
 *   GOOGLE_TRANSLATE_API_KEY 있음 → Google Cloud Translation v2 (130개 언어, 빠르고 싸다)
 *   없고 ANTHROPIC_API_KEY/OLLAMA_URL → 기존 3단 번역 제공자(lib/ai/providers.ts)로 줄 번역
 *   둘 다 없음                     → MyMemory (키 없는 공개 API — 익명 하루 5,000자 제한)
 *   UI_TRANSLATE_FALLBACK=off      → MyMemory 도 끈다 → null (화면은 한국어 그대로)
 *
 * 왜 이 순서인가: 전용 번역 API 가 품질·속도·비용 모두 낫다. LLM 은 이미 배선돼 있어
 * 키 하나로 같이 쓸 수 있지만 줄 형식 계약(contract.ts)에 걸리면 그 묶음이 통째로
 * 실패한다. MyMemory 는 "키 없이도 시연은 된다"를 위한 최후 수단이고, 한도가 작아
 * 실서비스용이 아니다 — 화면이 어느 엔진인지 그대로 보여준다.
 *
 * 개인정보: 부르는 쪽(app/api/ui-translate)이 detectPII 로 거른 뒤 넘긴다. 여기서는
 * 텍스트를 그대로 외부로 보낸다.
 */

import { pickProvider } from "./ai/providers.ts";
import { 프롬프트, unpack } from "./ai/contract.ts";

export type Target = {
  /** UI 언어 코드 (lib/uiLang.ts) */
  code: string;
  /** 외부 엔진에 넘기는 코드 — zh-CN 같은 지역 코드 */
  mt: string;
  /** LLM 프롬프트용 한국어 언어명 — "베트남어" */
  name: string;
};

export type Engine = {
  name: "google" | "llm" | "mymemory";
  /** 화면에 보이는 한 줄 — 어떤 모델·계정인지 */
  detail: string;
  /** 한 번에 넘길 수 있는 문자열 수 */
  batch: number;
  translate(texts: string[], target: Target): Promise<string[]>;
};

export const HANGUL = /[가-힣ㄱ-ㆎ]/;

/** 한글이 든 문자열만 번역 대상이다 — 숫자·영문·기호만인 줄은 그대로 둔다 */
export function needsTranslation(s: string): boolean {
  return HANGUL.test(s);
}

/** Google 이 format=text 로도 가끔 돌려주는 HTML 엔티티를 되돌린다 */
export function decodeEntities(s: string): string {
  const map: Record<string, string> = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#34;": '"', "&#39;": "'", "&#x27;": "'", "&nbsp;": " ",
  };
  return s.replace(/&(?:amp|lt|gt|quot|nbsp|#34|#39|#x27);/g, (m) => map[m] ?? m);
}

function google(key: string): Engine {
  return {
    name: "google",
    detail: "Google Cloud Translation v2",
    batch: 100,
    async translate(texts, target) {
      const r = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ q: texts, source: "ko", target: target.mt, format: "text" }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!r.ok) throw new Error(`google ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j = (await r.json()) as { data?: { translations?: { translatedText: string }[] } };
      const out = j.data?.translations?.map((t) => decodeEntities(t.translatedText)) ?? [];
      if (out.length !== texts.length) throw new Error(`google: ${texts.length}줄 보냈는데 ${out.length}줄 왔다`);
      return out;
    },
  };
}

function llm(p: NonNullable<ReturnType<typeof pickProvider>>): Engine {
  return {
    name: "llm",
    detail: `${p.name}:${p.model}`,
    // 줄 번호 계약은 묶음이 길수록 깨지기 쉽다 — 소형 모델 기준으로 짧게
    batch: 40,
    async translate(texts, target) {
      const res = await p.chat(프롬프트(target.name, texts));
      return unpack(res.text, texts.length);
    },
  };
}

function mymemory(email?: string): Engine {
  return {
    name: "mymemory",
    detail: email ? "MyMemory (이메일 등록, 하루 50,000자)" : "MyMemory (익명, 하루 5,000자)",
    batch: 20,
    async translate(texts, target) {
      // 문자열 하나에 요청 하나 — 넷씩 동시에. 한도 초과(429/403)는 즉시 던져 재시도를 막는다
      const out: string[] = new Array(texts.length);
      let next = 0;
      const worker = async () => {
        while (next < texts.length) {
          const i = next++;
          const url =
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(texts[i])}` +
            `&langpair=ko|${encodeURIComponent(target.mt)}${email ? `&de=${encodeURIComponent(email)}` : ""}`;
          const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
          if (!r.ok) throw new Error(`mymemory ${r.status}`);
          const j = (await r.json()) as {
            responseStatus?: number | string;
            responseDetails?: string;
            responseData?: { translatedText?: string };
          };
          const st = Number(j.responseStatus);
          if (st !== 200) throw new Error(`mymemory ${st}: ${j.responseDetails ?? ""}`.trim());
          const t = j.responseData?.translatedText;
          if (!t) throw new Error("mymemory: 빈 응답");
          out[i] = decodeEntities(t);
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      return out;
    },
  };
}

export type Env = Record<string, string | undefined>;

export function pickEngine(env: Env = process.env): Engine | null {
  if (env.GOOGLE_TRANSLATE_API_KEY) return google(env.GOOGLE_TRANSLATE_API_KEY);
  const p = pickProvider(env as NodeJS.ProcessEnv);
  if (p) return llm(p);
  if (env.UI_TRANSLATE_FALLBACK === "off") return null;
  return mymemory(env.MYMEMORY_EMAIL);
}

/* ── 서버 캐시 — 프로세스 안에서만. 같은 문장을 두 번 사지 않는다 ── */

const 캐시 = new Map<string, Map<string, string>>();
const 언어당상한 = 5_000;

export function cacheGet(lang: string, src: string): string | undefined {
  return 캐시.get(lang)?.get(src);
}

export function cacheSet(lang: string, src: string, out: string): void {
  let m = 캐시.get(lang);
  if (!m) {
    m = new Map();
    캐시.set(lang, m);
  }
  if (m.size >= 언어당상한) {
    const oldest = m.keys().next().value;
    if (oldest !== undefined) m.delete(oldest);
  }
  m.set(src, out);
}

/** 테스트 전용 */
export function cacheReset(): void {
  캐시.clear();
}

/** 배열을 엔진 배치 크기로 자른다 */
export function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
