"use client";

import { useEffect, useRef } from "react";
import type { UiLang } from "@/lib/uiLang";

/**
 * 화면 자동 번역 층 — DOM 의 한국어 텍스트를 찾아 대상 언어로 바꿔 끼운다.
 *
 * 왜 컴포넌트마다 t() 를 심지 않는가: 콘솔은 열여섯 화면에 한국어 문자열이 수천 개다.
 * 하나씩 감싸면 몇 주짜리 일이고, 그동안 번역은 없다. 이 층은 렌더된 결과(DOM)만 보므로
 * 화면 코드를 한 줄도 고치지 않고 전부를 덮는다 — 브라우저 자동 번역이 하는 방식이다.
 *
 * React 와 공존하는 규칙 (Google 번역 위젯이 React 앱을 깨뜨리는 이유의 반대):
 *   - 노드를 바꿔 끼우거나 감싸지 않는다. 텍스트 노드의 nodeValue 만 고친다.
 *   - React 가 nodeValue 를 새 한국어로 덮으면 MutationObserver 가 보고 다시 옮긴다.
 *   - 우리가 쓴 값과 같은 변화는 우리 것이라 무시한다 (기록: 원문·번역문 쌍).
 *   - translate="no" 조상 아래, script/style/textarea 안은 건드리지 않는다.
 *
 * 번역은 /api/ui-translate 가 한다(엔진·키·개인정보 차단은 서버 몫). 같은 문장은 세션
 * 캐시(sessionStorage)에서 바로 쓴다 — localStorage 금지 원칙은 그대로다.
 */

export type TranslatorStatus = {
  engine: string | null;
  detail?: string;
  busy: boolean;
  error: string | null;
  /** 이 언어로 지금까지 옮긴 문장 수 */
  done: number;
};

const HANGUL = /[가-힣ㄱ-ㆎ]/;
const ATTRS = ["placeholder", "title", "aria-label"] as const;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "SVG"]);
const BATCH = 100;

type Rec = { src: string; out: string | null };

function loadCache(lang: string): Map<string, string> {
  try {
    const raw = sessionStorage.getItem(`ui-tr:${lang}`);
    if (raw) return new Map(Object.entries(JSON.parse(raw) as Record<string, string>));
  } catch {}
  return new Map();
}

function saveCache(lang: string, m: Map<string, string>) {
  try {
    sessionStorage.setItem(`ui-tr:${lang}`, JSON.stringify(Object.fromEntries(m)));
  } catch {}
}

export function UiTranslator({
  lang,
  onStatus,
}: {
  lang: UiLang;
  onStatus?: (s: TranslatorStatus) => void;
}) {
  const statusRef = useRef<TranslatorStatus>({ engine: null, busy: false, error: null, done: 0 });
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  });

  /* 엔진 정보는 한 번만 묻는다 — 화면이 "미연결"을 지어내지 않는다 */
  useEffect(() => {
    let alive = true;
    fetch("/api/ui-translate")
      .then((r) => r.json())
      .then((j: { engine: string | null; detail?: string }) => {
        if (!alive) return;
        statusRef.current = { ...statusRef.current, engine: j.engine, detail: j.detail };
        onStatusRef.current?.(statusRef.current);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (lang === "ko") {
      statusRef.current = { ...statusRef.current, busy: false, error: null, done: 0 };
      onStatusRef.current?.(statusRef.current);
      return; // 원문 언어 — 아무것도 하지 않는다 (복원은 아래 정리 함수가 이미 했다)
    }

    const textRecs = new WeakMap<Text, Rec>();
    const attrRecs = new WeakMap<Element, Map<string, Rec>>();
    /*
     * 실제로 바꿔 쓴 자리의 원문·번역문 — 복원 전용 장부. textRecs 와 따로 두는 이유:
     * 스캔 기록(textRecs)은 상황에 따라 교체될 수 있는데, 복원은 "우리가 마지막에 무엇을
     * 썼는가"만 알면 된다. 이 장부가 곧 언어를 바꿀 때 한국어로 되돌리는 근거다 —
     * 영어 → 중국어로 바꿨는데 영어가 남던 사고(2026-09-02)의 재발 방지.
     */
    const appliedTexts = new Map<Text, { src: string; out: string }>();
    const appliedAttrs = new Map<Element, Map<string, { src: string; out: string }>>();
    const cache = loadCache(lang);
    const waiting = new Map<string, Array<(t: string) => void>>();
    const requested = new Set<string>();
    let queue: string[] = [];
    let flushing = false;
    let disposed = false;
    let backoffUntil = 0;
    let saveTimer: number | null = null;

    const report = (patch: Partial<TranslatorStatus>) => {
      const next = { ...statusRef.current, ...patch, done: cache.size };
      const changed = JSON.stringify(next) !== JSON.stringify(statusRef.current);
      statusRef.current = next;
      if (changed) onStatusRef.current?.(next);
    };

    const scheduleSave = () => {
      if (saveTimer) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveCache(lang, cache), 400);
    };

    /*
     * 건너뛰는 요소:
     *   - script/style/textarea/svg, translate="no" 아래
     *   - value 속성 없는 <option> — 그 값은 글자 자체다. "베트남"을 "Vietnam"으로 바꾸면
     *     select.value 가 바뀌어 판정 입력이 틀어진다. 데이터 무결성이 번역보다 먼저다.
     */
    const skipEl = (el: Element) => {
      const tag = el.tagName.toUpperCase();
      if (SKIP_TAGS.has(tag)) return true;
      if (tag === "OPTION" && !el.hasAttribute("value")) return true;
      return el.getAttribute("translate") === "no";
    };
    /* 못 옮긴 줄(개인정보·엔진 실패로 null) — 다시 묻지 않는다. 안 그러면 스캔마다 재요청한다 */
    const untranslatable = new Set<string>();

    /** 번역이 도착했을 때 실행할 적용 함수를 등록하고, 요청 대기열에 넣는다 */
    const want = (src: string, apply: (t: string) => void) => {
      const hit = cache.get(src);
      if (hit !== undefined) {
        apply(hit);
        return;
      }
      if (untranslatable.has(src)) return;
      const list = waiting.get(src);
      if (list) list.push(apply);
      else waiting.set(src, [apply]);
      if (!requested.has(src)) {
        requested.add(src);
        queue.push(src);
      }
    };

    const scan = () => {
      if (disposed) return;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          if (n.nodeType === Node.ELEMENT_NODE)
            return skipEl(n as Element) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) {
          const t = n as Text;
          const v = t.nodeValue ?? "";
          const r = textRecs.get(t);
          if (r && r.out !== null && v === r.out) continue; // 우리가 쓴 번역문 그대로
          if (r && r.out === null && r.src === v) continue; // 이미 요청 중 — 적용 함수를 또 쌓지 않는다
          if (!HANGUL.test(v)) continue;
          const rec: Rec = { src: v, out: null };
          textRecs.set(t, rec);
          want(v, (out) => {
            if (t.nodeValue !== v) return; // 그새 React 가 바꿨다 — 다음 스캔이 맡는다
            rec.out = out;
            t.nodeValue = out;
            appliedTexts.set(t, { src: v, out });
          });
        } else {
          const el = n as Element;
          for (const a of ATTRS) {
            const v = el.getAttribute(a);
            if (v === null) continue;
            let m = attrRecs.get(el);
            const r = m?.get(a);
            if (r && r.out !== null && v === r.out) continue;
            if (r && r.out === null && r.src === v) continue;
            if (!HANGUL.test(v)) continue;
            if (!m) {
              m = new Map();
              attrRecs.set(el, m);
            }
            const rec: Rec = { src: v, out: null };
            m.set(a, rec);
            want(v, (out) => {
              if (el.getAttribute(a) !== v) return;
              rec.out = out;
              el.setAttribute(a, out);
              let am = appliedAttrs.get(el);
              if (!am) {
                am = new Map();
                appliedAttrs.set(el, am);
              }
              am.set(a, { src: v, out });
            });
          }
        }
      }
      void flush();
    };

    const flush = async () => {
      if (flushing || disposed) return;
      if (queue.length === 0) {
        report({ busy: false });
        return;
      }
      if (Date.now() < backoffUntil) return; // 엔진 실패 직후 — 잠시 쉰다
      flushing = true;
      report({ busy: true });
      try {
        while (queue.length && !disposed) {
          const batch = queue.splice(0, BATCH);
          const r = await fetch("/api/ui-translate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ lang, texts: batch }),
          });
          const j = (await r.json()) as {
            engine?: string | null;
            detail?: string;
            translations?: (string | null)[];
            error?: string;
          };
          if (disposed) return;
          if (j.engine !== undefined) report({ engine: j.engine, detail: j.detail });
          (j.translations ?? []).forEach((out, i) => {
            const src = batch[i];
            requested.delete(src);
            if (!out || out === src) {
              // 못 옮긴 줄(개인정보·실패)은 한국어 그대로. 요청이 성공했는데 null 이면
              // 서버가 일부러 막은 것 — 다시 묻지 않는다. 요청 실패분은 재시도 대상으로 남긴다
              if (r.ok) untranslatable.add(src);
              waiting.delete(src);
              return;
            }
            cache.set(src, out);
            for (const apply of waiting.get(src) ?? []) apply(out);
            waiting.delete(src);
          });
          scheduleSave();
          if (!r.ok) {
            // 501(엔진 없음)은 조용히 멈춘다. 그 외는 이유를 보여주고 30초 뒤 다시 시도한다
            for (const src of batch) requested.delete(src);
            backoffUntil = Date.now() + 30_000;
            report({ error: j.error ?? `HTTP ${r.status}` });
            break;
          }
          report({ error: null });
        }
      } catch (e) {
        backoffUntil = Date.now() + 30_000;
        report({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        flushing = false;
        report({ busy: false });
      }
    };

    let timer: number | null = null;
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(scan, 60);
    };

    const mo = new MutationObserver((muts) => {
      // 우리가 쓴 값만 바뀐 경우는 건너뛴다 — 스캔이 어차피 무시하지만 타이머라도 아낀다
      let relevant = false;
      for (const m of muts) {
        if (m.type === "characterData") {
          const t = m.target as Text;
          const r = textRecs.get(t);
          if (r && r.out !== null && t.nodeValue === r.out) continue;
        }
        relevant = true;
        break;
      }
      if (relevant) schedule();
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });
    scan();

    return () => {
      disposed = true;
      mo.disconnect();
      if (timer) window.clearTimeout(timer);
      if (saveTimer) {
        window.clearTimeout(saveTimer);
        saveCache(lang, cache);
      }
      // 원문 복원 — 우리가 쓴 값이 그대로 있을 때만. React 가 그새 바꿨으면 그대로 둔다
      for (const [t, a] of appliedTexts) if (t.nodeValue === a.out) t.nodeValue = a.src;
      for (const [el, m] of appliedAttrs)
        for (const [attr, a] of m) if (el.getAttribute(attr) === a.out) el.setAttribute(attr, a.src);
      appliedTexts.clear();
      appliedAttrs.clear();
      queue = [];
    };
  }, [lang]);

  return null;
}
