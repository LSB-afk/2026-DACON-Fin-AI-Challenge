/**
 * API 입구 방어 — 개인정보 차단 · 길이 제한 · 간이 속도 제한.
 *
 * 왜 lib 에 있나: 라우트 파일은 "@/" 별칭 때문에 Node 테스트가 직접 부르지 못한다.
 * 판단 로직을 전부 여기 순수 함수로 두면 라우트는 얇은 배선이 되고,
 * 검증은 네트워크 없이 테스트로 못박힌다.
 *
 * 개인정보: 사용자 입력이 외부 모델 제공자로 나가는 길목이 이 제품의 유일한
 * 개인정보 유출면이다. 주민·외국인등록번호가 발화에 섞이면 **전송 전에** 거부한다.
 * 마스킹하지 않고 거부하는 이유 — 마스킹은 "*을 지우면 복원되나?"라는 새 질문을
 * 만들고, 판정에 그 번호가 필요한 경우도 없다.
 * 패턴은 scripts/scan.mjs(저장소 검사)와 같은 계열이다 — 대상만 다르다.
 *
 * 속도 제한: 인스턴스 메모리 기반 슬라이딩 윈도다. 서버리스에서는 인스턴스마다
 * 따로 센다는 한계를 숨기지 않는다 — 심사 기간의 단일 인스턴스 데모에는 충분하고,
 * 실서비스라면 외부 저장소 기반으로 바꿔야 한다(README 배포 절 참조).
 */

const PII_패턴: { id: string; re: RegExp; msg: string }[] = [
  {
    id: "krid",
    // 주민등록번호(뒷자리 1~4)·외국인등록번호(5~8). scan.mjs 와 같은 골격.
    re: /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[-\s]?[1-8]\d{6}(?!\d)/,
    msg: "주민·외국인등록번호로 보이는 번호",
  },
  {
    id: "phone",
    re: /\b01[016789][-. ]?\d{3,4}[-. ]?\d{4}\b/,
    msg: "휴대전화 번호",
  },
  {
    id: "account",
    // 계좌번호꼴 숫자열. 마지막 묶음을 4자리 이상으로 잡아 날짜(2026-10-15)와 갈라놓는다.
    re: /(?<!\d)\d{3,6}[- ]\d{2,6}[- ]\d{4,8}(?!\d)/,
    msg: "계좌번호로 보이는 숫자열",
  },
];

/** 걸린 패턴의 **이름만** 돌려준다 — 매칭된 값 자체를 되돌려주면 그게 또 유출이다 */
export function detectPII(text: string): string[] {
  return PII_패턴.filter((p) => p.re.test(text)).map((p) => p.msg);
}

export type GuardVerdict = { ok: true } | { ok: false; status: number; error: string };

/** 자유 발화 입력의 공통 검증 — 라우트가 provider 를 보기 전에 먼저 통과해야 한다 */
export function guardUtterance(utterance: unknown, maxLen = 2000): GuardVerdict {
  if (typeof utterance !== "string" || !utterance.trim())
    return { ok: false, status: 400, error: "utterance가 필요합니다." };
  if (utterance.length > maxLen)
    return { ok: false, status: 400, error: `발화가 너무 깁니다 (${maxLen}자 이내).` };
  const pii = detectPII(utterance);
  if (pii.length)
    return {
      ok: false,
      status: 400,
      error:
        `입력에 ${pii.join(", ")}가 있어 처리하지 않았습니다. ` +
        `지우고 다시 시도하세요 — 외부 모델로 전송되기 전에 차단했습니다. ` +
        `판정에 그 번호는 필요하지 않습니다.`,
    };
  return { ok: true };
}

/* ── 간이 속도 제한 ── */

const 창 = new Map<string, number[]>();

/**
 * key(보통 IP)별 분당 호출 수 제한. Date.now 는 판정이 아니라 운영 계측이다 —
 * 결정성 규율(판정 경로의 시계 금지)의 대상이 아니고, 테스트는 now 를 주입한다.
 */
export function rateLimit(
  key: string,
  limit = 20,
  windowMs = 60_000,
  now = Date.now(),
): GuardVerdict {
  const hits = (창.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit)
    return {
      ok: false,
      status: 429,
      error: `요청이 너무 잦습니다 — 분당 ${limit}회까지입니다. 잠시 뒤 다시 시도하세요.`,
    };
  hits.push(now);
  창.set(key, hits);
  // 무한 성장 방지 — 키가 많아지면 오래된 창부터 버린다
  if (창.size > 10_000) {
    const oldest = 창.keys().next().value;
    if (oldest !== undefined) 창.delete(oldest);
  }
  return { ok: true };
}

/** 테스트 전용 — 창을 비운다 */
export function resetRateLimit(): void {
  창.clear();
}
