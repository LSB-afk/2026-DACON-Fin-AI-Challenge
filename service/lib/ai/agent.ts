/**
 * Agent 0/1단 계약 — 모델이 무엇을 돌려줄 수 있고 무엇은 버리는가.
 *
 * 3단 분리 불변: 이 파일은 판정을 모른다(lib/rules를 import하지 않는다).
 * 네트워크 없는 순수 함수라 모델 없이 테스트로 못 박는다.
 * 어떤 모델이 와도 같은 계약을 통과해야 화면에 나간다.
 *
 * 0단 LLM 라우터: 발화 → {skill, evidence} — id가 등록되지 않으면 던진다.
 * 1단 발화 추출: 발화 → Departure 부분집합 — evidence가 원문에 없으면 버린다.
 * 날짜·숫자는 검증, 못 뽑으면 되묻기 질문으로 돌린다(G5 문법).
 */

export const 등록스킬 = ["payslip", "departure", "none"] as const;
export type AgentSkill = (typeof 등록스킬)[number];

export const 국적옵션 = [
  "베트남", "캄보디아", "인도네시아", "스리랑카", "태국", "필리핀",
  "중국", "몽골", "라오스", "키르기스스탄",
  "네팔", "미얀마", "방글라데시", "파키스탄", "동티모르",
  "우즈베키스탄", "가나",
] as const;

export const 비자옵션 = ["E-9", "H-2", "E-8", "기타"] as const;
export type VisaOpt = (typeof 비자옵션)[number];
export const 규모옵션 = ["5인이상", "5인미만", "모름"] as const;

// ── JSON 추출 ──

/**
 * 모델 출력에서 JSON 객체를 꺼낸다.
 * gemma4는 ```json 펜스와 thinking을 섞는다.
 */
export function extractJson(raw: string): unknown {
  let s = raw.trim();
  // 펜스 제거
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  // 그대로 파싱 시도
  try {
    return JSON.parse(s);
  } catch {
    // 가장 바깥 { } 추출 재시도
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`JSON을 찾을 수 없습니다 — 원문: ${s.slice(0, 200)}`);
    return JSON.parse(m[0]);
  }
}

// ── 0단 라우터 계약 ──

export type RouterValidated = {
  skill: AgentSkill;
  evidence: string[];
  /** 원문에 없던 근거는 걸러졌다 */
  filteredCount: number;
};

export function 프롬프트_라우터(utterance: string): string {
  return (
    `너는 금융정착 상담 발화를 스킬로 분류한다.\n` +
    `선택지: payslip(급여명세서 대조 - 월급·공제·최저임금·연장수당·숙식비), departure(출국정산 - 출국·퇴직금·연금·국민연금·귀국비용), none(해당없음 - 계좌·은행·대출 등 이 두 스킬과 무관)\n` +
    `규칙:\n` +
    `1. 출력은 JSON 한 객체만: {"skill":"payslip|departure|none","evidence":["근거낱말1","근거낱말2"]}\n` +
    `2. evidence는 발화 원문에 실제로 있는 부분 문자열만 — 지어내지 마라.\n` +
    `3. 다른 글자·설명·인사 금지.\n` +
    `발화: ${JSON.stringify(utterance)}\n`
  );
}

export function validateRouter(raw: string, utterance: string): RouterValidated {
  const data = extractJson(raw) as Record<string, unknown>;
  if (!data || typeof data !== "object") throw new Error("라우터 출력이 JSON 객체가 아닙니다");
  const idRaw = (data as Record<string, unknown>).skill
    ?? (data as Record<string, unknown>).id
    ?? (data as Record<string, unknown>).skillId;
  if (typeof idRaw !== "string" || !idRaw.trim()) throw new Error("skill이 비었습니다");
  const skill = idRaw.trim().toLowerCase();
  if (!(등록스킬 as readonly string[]).includes(skill)) {
    throw new Error(`등록되지 않은 스킬 id "${idRaw}" — 허용: ${등록스킬.join(", ")}`);
  }
  const ev: unknown = (data as Record<string, unknown>).evidence
    ?? (data as Record<string, unknown>).근거
    ?? (data as Record<string, unknown>).evidenceWords;
  let evidences: string[] = [];
  if (Array.isArray(ev)) evidences = ev.map((x) => String(x).trim()).filter(Boolean);
  else if (typeof ev === "string" && ev.trim()) evidences = [ev.trim()];
  const before = evidences.length;
  // evidence가 발화에 실제로 있는지 대조 — 없으면 걸러낸다
  evidences = evidences.filter((e) => utterance.includes(e));
  return {
    skill: skill as AgentSkill,
    evidence: evidences,
    filteredCount: before - evidences.length,
  };
}

// ── 1단 추출 계약 ──

export type ExtractedFields = {
  nationality?: string;
  visa?: VisaOpt;
  hireDate?: string;
  departureDate?: string;
  monthlyWage?: number;
  workplaceSize?: (typeof 규모옵션)[number];
};

export type IntakeValidated = {
  fields: ExtractedFields;
  evidences: Partial<Record<keyof ExtractedFields, string>>;
  questions: string[];
  discarded: { field: string; reason: string }[];
};

const 날짜RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(iso: string): boolean {
  return 날짜RE.test(iso) && !Number.isNaN(Date.parse(iso));
}

function parseWage(raw: unknown): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return Math.round(raw);
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/,/g, "");
  if (!s) return null;
  // 만 단위 처리: "215만원" "215만" "215.5만"
  const man = s.match(/([\d.]+)\s*만/);
  if (man) {
    const n = Number(man[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    // 뒤에 천 단위 보조가 있을 수도 있지만 무시 (MVP)
    return Math.round(n * 10000);
  }
  // 억 처리
  const eok = s.match(/([\d.]+)\s*억/);
  if (eok) {
    const n = Number(eok[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100000000);
  }
  const digits = s.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function normalizeVisa(raw: unknown): VisaOpt | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
  if (s === "E9") return "E-9";
  if (s === "H2") return "H-2";
  if (s === "E8") return "E-8";
  if (s === "기타" || s === "ETC" || s === "OTHER") return "기타";
  // 원형 유지 시도
  const orig = String(raw).trim().toUpperCase();
  if ((비자옵션 as readonly string[]).includes(orig)) return orig as VisaOpt;
  // 하이픈 포함 원형
  if ((비자옵션 as readonly string[]).includes(String(raw).trim())) return String(raw).trim() as VisaOpt;
  return null;
}

function normalizeWorkplace(raw: unknown): ExtractedFields["workplaceSize"] | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if ((규모옵션 as readonly string[]).includes(s)) return s as ExtractedFields["workplaceSize"];
  // 흔한 변형: "5인 이상" -> "5인이상"
  const compact = s.replace(/\s+/g, "");
  if ((규모옵션 as readonly string[]).includes(compact)) return compact as ExtractedFields["workplaceSize"];
  return null;
}

export function 프롬프트_추출(utterance: string): string {
  return (
    `너는 상담 발화에서 출국정산에 필요한 값을 뽑는다.\n` +
    `뽑을 수 있는 항목: nationality(국적, 예: 베트남), visa(체류자격 E-9/H-2/E-8/기타), hireDate(입사일 YYYY-MM-DD), departureDate(출국일 YYYY-MM-DD), monthlyWage(월 평균임금 숫자, 원 단위), workplaceSize(사업장규모 5인이상/5인미만/모름)\n` +
    `규칙:\n` +
    `1. 출력은 JSON 한 객체만. 각 항목은 {"value":값,"evidence":"발화 원문의 부분 문자열"} 형태로. 예: {"nationality":{"value":"베트남","evidence":"베트남"},"hireDate":{"value":"2023-09-01","evidence":"2023년 9월 1일"}}\n` +
    `2. evidence는 반드시 발화 원문에 그대로 있는 부분 문자열 — 없으면 그 항목을 빼라. 지어내지 마라.\n` +
    `3. 날짜는 반드시 YYYY-MM-DD. numbers는 숫자만.\n` +
    `4. 못 뽑은 항목은 빼고, 지어내지 마라.\n` +
    `5. 다른 글자·설명 금지.\n` +
    `발화: ${JSON.stringify(utterance)}\n`
  );
}

type Flat = Record<string, unknown>;

function pickField(data: Flat, key: string): { value: unknown; evidence: unknown } {
  // 중첩 형태: data[key] = {value, evidence}
  const direct = data[key];
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    const o = direct as Flat;
    if ("value" in o) return { value: o.value, evidence: (o.evidence ?? o.evidenceText ?? o.ev) as unknown };
  }
  // 평탄 형태: data[key] = 값, data[key+"_evidence"] = 근거
  const v = data[key] ?? data[toCamel(key)] ?? data[key.replace(/([A-Z])/g, "_$1").toLowerCase()];
  const evKeys = [`${key}_evidence`, `${key}Evidence`, `${key}_ev`, `${key} evidence`, `${toCamel(key)}Evidence`];
  let ev: unknown;
  for (const k of evKeys) if (k in data) { ev = data[k]; break; }
  // fields 래퍼가 있을 수도
  if (!v && data.fields && typeof data.fields === "object") {
    const inner = data.fields as Flat;
    return pickField(inner, key);
  }
  // values 래퍼
  if (!v && data.values && typeof data.values === "object") {
    const inner = data.values as Flat;
    return pickField(inner, key);
  }
  return { value: v, evidence: ev };
}

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

const 질문템플: Record<keyof ExtractedFields, string> = {
  nationality: "국적을 알려주세요 (예: 베트남)",
  visa: "체류자격을 알려주세요 (E-9 / H-2 / E-8 / 기타)",
  hireDate: "입사일을 알려주세요 (예: 2023-09-01)",
  departureDate: "출국(예정)일을 알려주세요 (예: 2026-10-15)",
  monthlyWage: "월 평균임금을 알려주세요 (예: 2150000)",
  workplaceSize: "사업장 규모를 알려주세요 (5인이상 / 5인미만 / 모름)",
};

export function validateIntake(raw: string, utterance: string): IntakeValidated {
  const data = extractJson(raw) as Flat;
  if (!data || typeof data !== "object") throw new Error("추출 출력이 JSON 객체가 아닙니다");

  const fields: ExtractedFields = {};
  const evidences: Partial<Record<keyof ExtractedFields, string>> = {};
  const discarded: { field: string; reason: string }[] = [];

  const keys: (keyof ExtractedFields)[] = ["nationality", "visa", "hireDate", "departureDate", "monthlyWage", "workplaceSize"];

  for (const k of keys) {
    let { value, evidence } = pickField(data, k);
    // 일부 모델은 hireDate를 hire_date로 내보낸다
    if (value === undefined) {
      const altKeys: Record<string, string[]> = {
        hireDate: ["hire_date", "hiredate", "입사일"],
        departureDate: ["departure_date", "departuredate", "출국일", "출국_일"],
        monthlyWage: ["monthly_wage", "monthlywage", "wage", "월급", "임금"],
        workplaceSize: ["workplace_size", "workplacesize", "size", "규모"],
        nationality: ["국적", "nationality", "country"],
        visa: ["체류자격", "visa", "visaType"],
      };
      for (const ak of altKeys[k] ?? []) {
        if (ak in data) { value = data[ak]; evidence = data[`${ak}_evidence`] ?? data[`${ak}Evidence`]; break; }
        if (data.fields && typeof data.fields === "object" && ak in (data.fields as Flat)) {
          const f = (data.fields as Flat)[ak];
          if (f && typeof f === "object" && "value" in (f as Flat)) { value = (f as Flat).value; evidence = (f as Flat).evidence; break; }
          else { value = f; break; }
        }
      }
    }
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      continue; // 못 뽑은 것은 버리고 질문으로
    }

    // evidence 검증 — 반드시 문자열이고 원문에 있어야 한다
    const evStr = typeof evidence === "string" ? evidence.trim() : "";
    if (!evStr) {
      discarded.push({ field: k, reason: `evidence 없음 — 값 "${String(value).slice(0, 30)}" 버림` });
      continue;
    }
    if (!utterance.includes(evStr)) {
      discarded.push({ field: k, reason: `evidence "${evStr.slice(0, 30)}"가 발화에 없음 — 값 버림` });
      continue;
    }

    // 값 형식 검증
    let ok = false;
    const normalized: unknown = value;

    if (k === "nationality") {
      const v = String(value).trim();
      if (!v) discarded.push({ field: k, reason: "국적 빈 문자열" });
      else if (!(국적옵션 as readonly string[]).includes(v)) {
        discarded.push({ field: k, reason: `국적 "${v}"이 허용 목록에 없음` });
      } else {
        fields[k] = v; evidences[k] = evStr; ok = true;
      }
    } else if (k === "visa") {
      const nv = normalizeVisa(value);
      if (!nv) discarded.push({ field: k, reason: `체류자격 "${String(value)}" 형식 아님` });
      else { fields[k] = nv; evidences[k] = evStr; ok = true; }
    } else if (k === "hireDate" || k === "departureDate") {
      const vs = String(value).trim();
      if (!isValidDate(vs)) discarded.push({ field: k, reason: `날짜 "${vs}"가 YYYY-MM-DD가 아님` });
      else { (fields as Record<string, unknown>)[k] = vs; evidences[k] = evStr; ok = true; }
    } else if (k === "monthlyWage") {
      let n = parseWage(value);
      if (n === null) discarded.push({ field: k, reason: `숫자 파싱 실패 "${String(value)}"` });
      else {
        // 증거에 "만"이 있고 값이 만 단위로 보이면 원 단위로 보정 (예: 215 + "215만원" → 2150000)
        if (evStr.includes("만") && n < 100000) n = n * 10000;
        else if (evStr.includes("천") && n < 10000) n = n * 1000;
        fields[k] = n; evidences[k] = evStr; ok = true;
      }
    } else if (k === "workplaceSize") {
      const nv = normalizeWorkplace(value);
      if (!nv) discarded.push({ field: k, reason: `규모 "${String(value)}" 허용값 아님` });
      else { fields[k] = nv; evidences[k] = evStr; ok = true; }
    }

    if (!ok && !discarded.some((d) => d.field === k)) {
      // 이미 discarded에 넣지 않은 경우 일반 실패
      discarded.push({ field: k, reason: "검증 실패" });
    }
    // normalized 미사용 경고 방지
    void normalized;
  }

  // 되묻기 질문: 추출에 실패한 필수 항목 중 실제 업무에 필요한 것만?
  // 여기서는 모든 빠진 항목에 대해 질문을 만든다 — G5 문법: 빠진 것을 묻는다
  const questions: string[] = [];
  for (const k of keys) {
    if (!(k in fields)) {
      // 모든 필드가 필수는 아니지만, 일단 빠진 것은 질문 후보
      // 실제로는 departure 스킬이면 nationality, hireDate, departureDate, monthlyWage가 중요
      // payslip이면 workplaceSize가 중요 — 여기서는 전부 질문으로 돌린다 (클라이언트가 스킬에 따라 걸러도 됨)
      questions.push(질문템플[k]);
    }
  }

  return { fields, evidences, questions, discarded };
}

// 키워드 vs LLM 비교 헬퍼 — 화면이 LLM이 이기는 구조로 만들지 않도록
export function compareRoute(
  keyword: { skill: string } | null,
  llm: { skill: AgentSkill } | null,
): { mismatch: boolean; winner: string | null } {
  const kw = keyword?.skill ?? null;
  const lm = llm?.skill ?? null;
  if (!kw && !lm) return { mismatch: false, winner: null };
  if (!kw || !lm) return { mismatch: true, winner: kw ?? lm };
  // LLM이 none을 말하고 키워드가 스킬을 찾았으면 키워드가 이긴다
  // 반대로 키워드가 none인데 LLM만 스킬을 찾았으면? 이때도 키워드(없음)가 이기므로 none
  // 규칙: 항상 키워드가 우선
  const mismatch = kw !== lm;
  return { mismatch, winner: kw };
}
