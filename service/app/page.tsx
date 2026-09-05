"use client";

/**
 * 페이체크 관제 콘솔.
 *
 * 에이전트 루프(발화 → 라우팅 → 입력 수집 → 판정 → 설명)를 **API 키 없이** 끝까지 돌린다.
 * 0·1·3단이 LLM으로 바뀌어도 이 화면은 그대로다 — 각 단계의 상태만 갱신된다.
 *
 * 밀도 원칙: 한 화면에 한 가지 일만. 본문은 탭으로 쪼개고, 좌우 패널은 접힌다.
 * 정보를 지우는 게 아니라 **동시에 보이는 양**을 줄인다.
 *
 * 화면이 일부러 드러내는 것 넷:
 *   1. 라우팅 근거 — 어떤 키워드가 어느 스킬을 불렀는가
 *   2. 미연결 단계 — 무엇이 아직 안 붙었는지 숨기지 않는다
 *   3. 기준일(today) — 시간을 옮겨야 기한 분기를 눌러볼 수 있다
 *   4. 근거 문서의 검증 상태 — 2차 출처가 남아 있다는 사실을 그대로 띄운다
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { cases, getCase, type Case } from "@/lib/cases";
import { routeByKeyword, needsClarification, getSkill } from "@/lib/skills";
import { judgePayslip, type Payslip, type WorkplaceSize } from "@/lib/rules/payslip";
import { judgeDeparture, type DepartureInput, type Visa } from "@/lib/rules/departure";
import { moneyTotals, type Finding } from "@/lib/rules/types";
import { samples } from "@/lib/samples";
import { verifyCounts } from "@/lib/standards";
import {
  harnessBySkill,
  runHooks,
  runSelfTest,
  hookLog,
  type HookLogEntry,
} from "@/lib/harness/core";
import { checkAllGuardrails, GUARDRAIL_CATALOG } from "@/lib/harness/guardrails";
import "@/lib/harness/registry"; // import 자체가 manifest 등록이다
import { buildRunABox, validateABox } from "@/lib/ontology/abox";
import { narrate, type Answer } from "@/lib/narrate";
import { 언어들 } from "@/lib/ai/contract";
import { UI_LANGS, entranceText, isUiLang, uiLangInfo, type UiLang } from "@/lib/uiLang";
import { Flag } from "./_flags";
import { UiTranslator, type TranslatorStatus } from "./_uiTranslator";
import { Tutorial } from "./_tutorial";
import { tutorialStep as 튜토리얼장 } from "@/lib/tutorial";
// flow.test.ts가 page→@/lib/flow 참조(단일 출처 사슬)를 강제한다 — 상수 자체는 steps 문자열에 녹아 있다
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { FLOW } from "@/lib/flow";
import {
  SideNav,
  CaseQueue,
  Tabs,
  PanelToggle,
  Eyebrow,
  Icon,
  Pill,
  Sentences,
  useNarrow,
  navGroupOf,
  badgeTone,
  type ViewId,
  type NavGroupId,
} from "./_ui";
import { useAgentLoop } from "./_agent-core";
import { AgentChatDrawer } from "./_chat";
import { Paygent } from "./_paygent";
import { nextQuest, progress, boardRows, progressBar, celebrationMessage, GOALS, goalById, type Goal, type PaygentState } from "@/lib/paygent";
import {
  InputTab,
  LoopTab,
  FindingsTab,
  AnswerTab,
  EvidenceTab,
  VerifyTab,
  type Step,
  type MonitorTab,
  type TranslateState,
} from "./_tabs";
import { AgentRunView } from "./_agent";
import { GoldenView } from "./_golden";
import { UserView } from "./_user";
import {
  AuditView,
  ArtifactsView,
  StandardsMapView,
  SkillsView,
  QueueView,
  HarnessView,
  SearchView,
  ExplainView,
  OntologyView,
  OrgView,
  ScenariosView,
  ApprovalsView,
  type RunEntry,
  type ModelCall,
  type ScenarioPreset,
} from "./_views";

const 필드 =
  "w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-sm";
const 라벨 = "block text-2xs font-semibold text-[var(--muted)]";

/** 실행 전의 빈 판정. 모듈 상수인 이유 — 렌더마다 새 []를 주면 이걸 deps로 갖는
 *  memo(가드레일·A-Box)가 실행 전에도 매 렌더 다시 돈다. */
const 실행전: Finding[] = [];


export default function Console() {
  /*
   * 홈 = 내 급여 확인하기(근로자용 화면). 초기값이 "monitor"였을 때, 새로고침으로 입장 씬을
   * 건너뛰면 판정 모니터가 먼저 떴다 (2026-09-03 수정). 운영자는 좌측 메뉴로 모니터에 간다.
   */
  const [view, setView] = useState<ViewId>("user");
  const [tab, setTab] = useState<MonitorTab>("findings");
  const [caseId, setCaseId] = useState(cases[0].id);
  /*
   * 상담 큐의 주인은 사용자다 (2026-09-05). 픽스처 6건은 운영·관리 → 상담 사례 목록에만
   * 남기고, 판정 결과 보기의 큐에는 내 급여 확인하기에서 넘어온 입력(userCase)과
   * 사용자가 목록·시나리오에서 직접 고른 케이스만 놓는다. casePicked 가 false 인 동안
   * (아직 아무것도 고르지 않음) 본문은 빈 상태 안내를 보인다. caseId 자체는 판정
   * 파이프라인의 초기값으로 계속 유효해야 하므로 픽스처 첫 건을 유지한다.
   */
  const [userCase, setUserCase] = useState<Case | null>(null);
  const [casePicked, setCasePicked] = useState(false);
  const findCase = (id: string): Case => (userCase && userCase.id === id ? userCase : getCase(id));
  // ── 페이전트 입장·동행 상태 (세션 메모리만 — localStorage 금지) ──
  const [entrance, setEntrance] = useState(true);
  const [entranceGreeted, setEntranceGreeted] = useState(false);
  /*
   * 입장 튜토리얼 — 언어를 고르면 다섯 장으로 페이체크를 소개하고, 마지막 장의 단추나
   * [건너뛰기]는 곧장 홈(내 급여 확인하기)으로 간다. 그 사이에 "화면 고르기" 같은 중간
   * 정거장은 없다 (2026-09-02 제거) — 첫 방문자에게 필요한 문은 하나다.
   * 입장 씬에 다시 오면(페이전트 메뉴 ④) 사용법도 처음부터 다시 보인다.
   */
  const [tutorialIdx, setTutorialIdx] = useState(0);
  /*
   * 동행 캐릭터 자기소개 — 콘솔에 처음 들어온 순간 한 번. 우하단 44~72px 캐릭터는
   * 안 보이고 지나치기 쉬워서, 들어오자마자 크게(medium) 나타나 맥동 링·축하 동작과
   * 함께 "저 여기 있어요, 잡아서 옮길 수 있어요"를 말한다. 누르거나 옮기거나 [알겠어요]
   * 를 누르면 끝나고, 세션 안에서는 다시 하지 않는다. 튜토리얼에서 읽은 것은 잊히지만
   * 그 자리에서 본 것은 남는다.
   */
  const [companionIntro, setCompanionIntro] = useState(false);
  const [introSeen, setIntroSeen] = useState(false);
  function endIntro() {
    if (!companionIntro) return;
    setCompanionIntro(false);
    setIntroSeen(true);
    try { sessionStorage.setItem("paygent-intro-seen", "1"); } catch {}
  }
  useEffect(() => {
    if (!companionIntro) return;
    const id = window.setTimeout(() => {
      setCompanionIntro(false);
      setIntroSeen(true);
      try { sessionStorage.setItem("paygent-intro-seen", "1"); } catch {}
    }, 14_000);
    return () => window.clearTimeout(id);
  }, [companionIntro]);
  function finishTutorial() {
    setTutorialIdx(0);
    enterFromEntrance("user");
  }
  const [paygentMenuOpen, setPaygentMenuOpen] = useState(false);
  /* ✕는 사라짐이 아니라 최소화다 — 작은 아이콘으로 줄었다가 누르면 돌아온다 */
  const [paygentMinimized, setPaygentMinimized] = useState(false);
  /* 드래그 배치 — null이면 기본 우하단. 사용자가 집어 옮기면 좌표를 기억한다(세션만) */
  const [pgPos, setPgPos] = useState<{ x: number; y: number } | null>(null);
  const [pgDragging, setPgDragging] = useState(false);
  const pgWrapRef = useRef<HTMLDivElement>(null);
  const pgDragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);
  const pgSuppressClickRef = useRef(false);
  const [paygentCelebrateKey, setPaygentCelebrateKey] = useState(0);
  const [celebratedGoals, setCelebratedGoals] = useState<Set<string>>(new Set());
  const [deadlineViewed, setDeadlineViewed] = useState(false);
  const [actionsViewed, setActionsViewed] = useState(false);
  const [evidenceViewed, setEvidenceViewed] = useState(false);
  const [goldenViewed, setGoldenViewed] = useState(false);
  const [recordDownloaded, setRecordDownloaded] = useState(false);
  /* 입장 화면 표시 언어 — 캐릭터를 누르기 전에 고른다. 세션만 기억(무저장 원칙) */
  const [uiLang, setUiLang] = useState<UiLang>("ko");
  function pickUiLang(l: UiLang) {
    setUiLang(l);
    try { sessionStorage.setItem("paygent-ui-lang", l); } catch {}
  }
  /*
   * 입장 순서 (2026-09-02): 캐릭터 → 인사 → **언어 선택(국기)** → 사용법 → 홈.
   * 언어를 고르기 전에는 사용법을 열지 않는다 — 못 읽는 언어로 사용법을 보여줘 봐야 소용없다.
   * 국기를 누르면 미리보기(화면이 그 언어로 바뀐다)이고, 그 아래 [확인] — 고른 언어로 쓰인
   * 단추 — 를 눌러야 확정된다 (2026-09-03). 사용법 화면에서 되돌아가는 [변경]은 없앴다.
   * 한 번 고르면 세션 안에서는 이 단계를 건너뛰고, 페이전트 메뉴 ⑤로만 다시 연다.
   */
  const [langChosen, setLangChosen] = useState(false);
  function chooseLang(l: UiLang) {
    pickUiLang(l);
    setLangChosen(true);
    try { sessionStorage.setItem("paygent-lang-chosen", "1"); } catch {}
  }
  /* 문서 언어 태그를 따라 바꾼다 — 스크린리더 발음·자동 번역 판단이 이 값을 본다 */
  useEffect(() => {
    document.documentElement.lang = uiLang;
  }, [uiLang]);
  /*
   * 화면 자동 번역 층 — 입장 씬과 콘솔 전 화면에 상주한다. 한국어가 아닌 언어를 고르면
   * DOM 의 한국어 텍스트를 /api/ui-translate 로 옮겨 끼운다 (app/_uiTranslator.tsx).
   * 상태(엔진·진행·오류)는 언어 선택 칸과 좌측 메뉴가 그대로 보여준다.
   */
  const [trStatus, setTrStatus] = useState<TranslatorStatus>({ engine: null, busy: false, error: null, done: 0 });
  const translatorUi = <UiTranslator lang={uiLang} onStatus={setTrStatus} />;
  const 현재언어 = uiLangInfo(uiLang);
  const 엔진표시 =
    trStatus.engine === "google" ? "Google 번역"
    : trStatus.engine === "llm" ? `LLM (${trStatus.detail ?? ""})`
    : trStatus.engine === "mymemory" ? "MyMemory (무료 · 한도 있음)"
    : null;
  /**
   * 표시 경로의 초기값이다 — 판정 경로가 아니다.
   *
   * 화면은 오늘 날짜로 시작하고 사용자가 기준일을 옮겨 기한 분기를 눌러볼 수 있어야 한다.
   * 그래서 여기서만 시계를 읽는다. 판정 쪽(lib/rules/departure.ts)은 시각을 스스로 읽지 않고
   * 이 값을 인자로 받는다. 테스트와 골든셋은 각자 today 를 주입하므로 이 줄을 타지 않는다.
   * 결정성 금지 목록(`grep "new Date("`)에 걸리는 이 파일의 유일한 자리이고 이 주석이 그 정당화다.
   *
   * 알려진 한계: 서버 렌더와 브라우저 렌더가 UTC 자정을 사이에 두면 하루가 어긋나
   * 하이드레이션 경고가 난다. 판정 결과는 사용자가 고른 기준일만 따르므로 값이 틀리지는 않는다.
   */
  const [today, setToday] = useState(new Date().toISOString().slice(0, 10));
  const [ledger, setLedger] = useState<RunEntry[]>([]);
  const [log, setLog] = useState<HookLogEntry[]>([]);
  const [ran, setRan] = useState(false);
  const [navMini, setNavMini] = useState(false);
  /* 좌측 메뉴 대분류 펼침 — 사용자가 손수 연 것만. 현재 화면의 대분류는 SideNav가 항상 연다 */
  const [navOpenGroups, setNavOpenGroups] = useState<Partial<Record<NavGroupId, boolean>>>({});
  const [propsOpen, setPropsOpen] = useState(true);

  const c = findCase(caseId);

  const [nationality, setNationality] = useState(
    c.departure?.nationality ?? "베트남",
  );
  const [visa, setVisa] = useState<Visa>(c.departure?.visa ?? "E-9");
  const [hireDate, setHireDate] = useState(c.departure?.hireDate ?? "2023-09-01");
  const [departureDate, setDepartureDate] = useState(
    c.departure?.departureDate ?? "2026-09-01",
  );
  const [wage, setWage] = useState(c.departure?.monthlyWage ?? 2_150_000);
  const [size, setSize] = useState<WorkplaceSize>(c.workplaceSize ?? "5인이상");

  /**
   * 급여명세서 편집본 — 고정 샘플 의존 제거 (2026-08-28).
   *
   * 예전에는 판정이 samples.ts 픽스처를 직접 읽어, 심사자가 무엇을 바꿔도 결과가
   * 같았다. "입력을 바꾸면 결과가 달라진다"는 판정 제품의 최소 조건이다.
   * 샘플은 이제 **초기값**일 뿐이고, 판정은 항상 이 편집본을 받는다.
   * 속성 패널에서 금액을 고치거나 공제 항목을 더하면 판정이 즉시 다시 계산된다.
   */
  const 명세서초안 = (sampleId: string): Payslip => {
    const 원본 = samples.find((x) => x.id === sampleId)!.payslip;
    return structuredClone(원본);
  };
  const [payslipDraft, setPayslipDraft] = useState<Payslip>(() =>
    명세서초안(c.payslipSampleId ?? "02"),
  );
  const 항목수정 = (
    k: "earnings" | "deductions",
    idx: number,
    patch: Partial<{ label: string; amount: number }>,
  ) =>
    setPayslipDraft((d) => ({
      ...d,
      [k]: d[k].map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  const 공제추가 = () =>
    setPayslipDraft((d) => ({
      ...d,
      deductions: [...d.deductions, { label: "새 공제 항목", amount: 0 }],
    }));
  const 공제삭제 = (idx: number) =>
    setPayslipDraft((d) => ({
      ...d,
      deductions: d.deductions.filter((_, i) => i !== idx),
    }));
  const 시간수정 = (
    hk: "scheduled" | "overtime" | "night" | "holiday",
    v: number,
  ) => setPayslipDraft((d) => ({ ...d, hours: { ...d.hours, [hk]: v } }));

  /** known — 방금 만든 케이스는 아직 상태에 없으므로 직접 넘긴다 */
  function selectCase(id: string, known?: Case) {
    const n = known ?? findCase(id);
    setCaseId(id);
    setCasePicked(true);
    setRan(false);
    setTab("findings");
    if (n.departure) {
      setNationality(n.departure.nationality);
      setVisa(n.departure.visa);
      setHireDate(n.departure.hireDate);
      setDepartureDate(n.departure.departureDate);
      setWage(n.departure.monthlyWage);
    }
    if (n.workplaceSize) setSize(n.workplaceSize);
    setPayslipDraft(명세서초안(n.payslipSampleId ?? "02"));
  }

  /**
   * 내 급여 확인하기 → 상담 큐. 입력 다섯 칸을 그대로 케이스로 만들어 큐에 넣고 선택한다.
   * 발화는 라우팅 트리거(출국·귀국비용·국민연금)를 품은 고정 문장이다 — 입력값을
   * 발화에 섞으면 "월급" 같은 단어가 급여명세서 스킬까지 불러 라우팅이 모호해진다.
   * 입력값은 summary 와 departure 에 실린다.
   */
  function submitUserCase(d: Omit<DepartureInput, "today">) {
    const uc: Case = {
      id: "U-01",
      badge: "내 입력",
      utterance: "출국 전에 받을 돈(출국만기보험·귀국비용보험·국민연금)을 확인하고 싶어요",
      summary: `${d.nationality} · ${d.visa} · ${d.hireDate}부터 ${d.departureDate}까지 · 월급 ${d.monthlyWage.toLocaleString("ko-KR")}원. 내 급여 확인하기에서 입력한 내용입니다.`,
      kind: "departure",
      demonstrates: "사용자가 직접 입력한 상황을 그대로 판정합니다. 같은 입력이면 언제나 같은 결과가 나옵니다.",
      departure: d,
      source: "user",
    };
    setUserCase(uc);
    selectCase(uc.id, uc);
  }

  /* 큐에 보이는 것 — 사용자 케이스 + (목록·시나리오에서 고른) 현재 케이스. 중복은 하나로 */
  const queueCases: Case[] = [
    ...(userCase ? [userCase] : []),
    ...(casePicked && c.id !== userCase?.id ? [c] : []),
  ];

  const routes = useMemo(() => routeByKeyword(c.utterance), [c.utterance]);
  const 모호 = needsClarification(routes);
  const skillId = routes[0]?.skill.id ?? null;
  const skill = skillId ? getSkill(skillId) : null;
  const harness = skillId ? harnessBySkill(skillId) : null;

  /**
   * 판정은 실행 여부와 무관하게 항상 최신 입력으로 계산해 둔다.
   *
   * 사고 — 2026-08-27 이전: 이 계산이 `ran` 게이트 안에 있었다. setRan 은 다음
   * 렌더에야 반영되므로, 첫 클릭의 run() 은 ran=false 시절의 빈 배열을 읽어
   * **원장 첫 줄이 항상 "판정 0건 · 금액 —"** 로 적혔다. 감사 기록의 첫 줄이
   * 거짓말인 제품이었다. 계산을 게이트 밖으로 빼면 run() 이 클릭 시점의 진짜
   * 판정을 읽는다. 화면 표시는 아래 findings 가 따로 거른다 — 실행 전에는
   * 비어 보여야 "실행"이라는 행위가 뜻을 갖는다.
   */
  const computed: Finding[] = useMemo(() => {
    if (!skillId) return [];
    if (skillId === "departure")
      return judgeDeparture({
        nationality,
        visa,
        hireDate,
        departureDate,
        monthlyWage: wage,
        today,
      });
    return judgePayslip({ ...payslipDraft, workplaceSize: size });
  }, [
    skillId, nationality, visa, hireDate, departureDate, wage, today,
    size, payslipDraft,
  ]);
  const findings: Finding[] = ran ? computed : 실행전;

  /** 가드레일은 순수 함수라 입력이 바뀌면 즉시 다시 계산된다 (기록은 실행 시에만) */
  const guardViolations = useMemo(
    () => (harness && findings.length ? checkAllGuardrails(findings, harness) : []),
    [harness, findings],
  );

  /**
   * 실행 하나를 온톨로지 개체 그래프로 푼다 (A-Box).
   *
   * 판정 결과가 T-Box(lib/ontology/schema.ts)의 어휘로 정확히 쓰이는지 여기서 대조한다.
   * 위반이 나오면 루프 단계에서 차단으로 보인다 — 스키마가 장식이 됐다는 뜻이므로.
   */
  const abox = useMemo(() => {
    if (!ran || !skillId || !findings.length) return null;
    const g = buildRunABox({
      caseId: c.id,
      utterance: c.utterance,
      routes: routes.map((r) => ({
        skill: r.skill.name,
        score: r.score,
        matched: r.matched,
      })),
      skillId,
      departure:
        skillId === "departure"
          ? { nationality, visa, hireDate, departureDate, monthlyWage: wage, today }
          : undefined,
      workplaceSize: skillId === "payslip" ? size : undefined,
      findings,
    });
    return { graph: g, check: validateABox(g) };
  }, [
    ran, skillId, findings, c.id, c.utterance, routes,
    nationality, visa, hireDate, departureDate, wage, today, size,
  ]);

  const selfTest = useMemo(
    () => (harness ? runSelfTest(harness.id) : null),
    [harness],
  );

  /** 사용자에게 나갈 답변 — 조립은 순수 함수라 판정이 바뀌면 즉시 따라온다 */
  const answer = useMemo(
    () =>
      ran && skillId && harness
        ? narrate(findings, harness.rules.requiredNotices)
        : null,
    [ran, skillId, harness, findings],
  );

  /*
   * ── 3단 번역 상태 ──
   *
   * 제공자는 서버 환경변수만 안다(키가 클라이언트로 새면 안 되므로). 그래서 화면은
   * GET /api/narrate 로 물어보고, 그 답으로 언어 단추를 열거나 잠근다 — 미연결을
   * 지어내지도, 연결을 과장하지도 않는다.
   */
  /**
   * 모델 호출 원장 — 이 세션에서 모델이 불린 자리 전부. 원장과 같은 규율:
   * 추가만 되고, 순번을 쓰고, 실패(계약 차단)도 지우지 않는다.
   */
  const [modelCalls, setModelCalls] = useState<ModelCall[]>([]);
  const 호출기록 = (c: Omit<ModelCall, "seq">) =>
    setModelCalls((prev) => [{ seq: prev.length + 1, ...c }, ...prev]);

  const [provider, setProvider] = useState<TranslateState["provider"]>(null);
  useEffect(() => {
    fetch("/api/narrate")
      .then((r) => r.json())
      .then(setProvider)
      .catch(() => setProvider({ provider: null }));
  }, []);

  /*
   * Agent 상태 기계 — 한 벌을 페이지가 들고 Agent 실행 화면과 채팅 드로어가 공유한다.
   * 드로어에서 시작한 상담을 전체 화면에서 이어보려면 인스턴스가 하나여야 한다.
   * 0/1단 제공자 조회도 이 훅이 하므로(OrgView·LoopTab이 읽는다) 따로 fetch하지 않는다.
   */
  const agentLoop = useAgentLoop({
    today,
    onModelCalls: (calls, meta) =>
      calls.forEach((c) =>
        호출기록({ ...c, provider: meta.provider, model: meta.model }),
      ),
  });
  const agentProvider = agentLoop.provider;
  const [chatOpen, setChatOpen] = useState(false);

  const [lang, setLang] = useState<TranslateState["lang"]>("ko");
  const [transDone, setTransDone] = useState<TranslateState["done"]>(null);
  const [transBusy, setTransBusy] = useState(false);
  const [transError, setTransError] = useState<string | null>(null);

  /* 답변이 바뀌면(다른 상담·재실행) 이전 번역은 다른 판정의 번역이다 — 즉시 무효.
     이펙트가 아니라 렌더 중 조정 패턴을 쓴다 — 한 프레임짜리 낡은 번역 표시와
     계단식 렌더를 둘 다 없앤다 (react.dev: adjusting state during render). */
  const [prevAnswer, setPrevAnswer] = useState<Answer | null>(answer);
  if (prevAnswer !== answer) {
    setPrevAnswer(answer);
    setLang("ko");
    setTransDone(null);
    setTransError(null);
  }

  function requestLang(code: TranslateState["lang"]) {
    setLang(code);
    setTransError(null);
    if (code === "ko" || !answer) return;
    if (transDone?.lang === code) return; // 같은 답변·같은 언어는 다시 부르지 않는다
    setTransBusy(true);
    fetch("/api/narrate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer, lang: code }),
    })
      .then(async (r) => {
        const j = await r.json();
        const 단계 = `3단 번역 · ${언어들.find((l) => l.code === code)?.name ?? code}`;
        // 실패한 호출도 원장에 적는다 — 계약에 걸려 버려진 호출도 돈은 쓴 호출이다
        호출기록({
          stage: 단계,
          provider: j.provider ?? provider?.provider ?? "?",
          model: j.model ?? provider?.model ?? "?",
          ok: r.ok,
          note: r.ok ? undefined : j.error,
          ...(j.usage ?? {}),
        });
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setTransDone({ lang: code, answer: j.answer as Answer, model: j.model });
      })
      .catch((e) => {
        // 실패는 원문 폴백 — 이유를 화면에 그대로 적는다. 조용한 실패가 최악이다
        setTransError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setTransBusy(false));
  }

  const translateState: TranslateState = {
    lang,
    done: transDone,
    busy: transBusy,
    error: transError,
    provider,
  };

  // ── 페이전트 세션 기억 (입장 스킵, 최소화) ──
  // sessionStorage는 서버에 없어 첫 렌더에서 읽을 수 없다. 이펙트 동기 setState는
  // 계단식 렌더로 lint가 막으므로, 프레임 하나 뒤(rAF)에 복원한다 — autoRun과 같은 문법.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        if (sessionStorage.getItem("paygent-entrance-seen")) setEntrance(false);
      } catch {}
      try {
        if (sessionStorage.getItem("paygent-minimized")) setPaygentMinimized(true);
      } catch {}
      try {
        const l = sessionStorage.getItem("paygent-ui-lang");
        if (l && isUiLang(l)) setUiLang(l);
      } catch {}
      try {
        if (sessionStorage.getItem("paygent-intro-seen")) setIntroSeen(true);
      } catch {}
      try {
        if (sessionStorage.getItem("paygent-lang-chosen")) setLangChosen(true);
      } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, []);
  function dismissEntrance() {
    setEntrance(false);
    try { sessionStorage.setItem("paygent-entrance-seen", "1"); } catch {}
    // 콘솔 첫 진입 — 캐릭터가 자기소개한다 (최소화돼 있으면 보이지 않으니 건너뛴다)
    if (!introSeen && !paygentMinimized) {
      setCompanionIntro(true);
      setPaygentCelebrateKey((k) => k + 1);
    }
  }
  function enterFromEntrance(v: ViewId) {
    dismissEntrance();
    setView(v);
  }

  const steps: Step[] = useMemo(() => {
    if (!ran) return [];
    const llmLive = !!agentProvider?.provider;
    const s: Step[] = [
      {
        n: "0단",
        label: "라우팅",
        status: routes.length ? "완료" : "중단",
        detail: routes.length
          ? `후보 ${routes.length}개 중 «${routes[0].skill.name}»을 골랐습니다. 걸린 단어: «${routes[0].matched.join(", ")}»${llmLive ? `. AI 라우터도 연결되어 있습니다(${agentProvider?.provider}:${agentProvider?.model}). 둘의 비교는 AI 상담 진행 화면에서 볼 수 있습니다` : ""}`
          : `해당하는 검사가 없습니다. 추측하지 않고 사용자에게 다시 묻습니다.${llmLive ? " AI 라우터도 같은 판단이면 확실히 해당 없음으로 봅니다." : ""}`,
      },
    ];
    if (!routes.length) return s;
    s.push({
      n: "1단",
      label: "추출",
      status: !llmLive ? "미연결" : "대기",
      detail: !llmLive
        ? skillId === "payslip"
          ? "사진 인식 기능이 연결되지 않아 미리 준비한 예시 명세서 값을 대신 사용했습니다."
          : "말에서 국적과 날짜를 뽑는 기능이 연결되지 않아 오른쪽 입력값을 그대로 사용했습니다."
        : skillId === "payslip"
          ? `AI 추출이 연결되어 있습니다 (${agentProvider?.provider}:${agentProvider?.model}). AI 상담 진행 화면에서는 말에서 값을 뽑을 수 있습니다. 명세서 사진 인식은 아직 준비 중이라 예시 값을 사용합니다.`
          : `AI 추출이 연결되어 있습니다 (${agentProvider?.provider}:${agentProvider?.model}). AI 상담 진행 화면에서는 말에서 국적과 날짜를 뽑고, 실패하면 다시 묻습니다. 이 화면은 직접 입력한 값을 사용합니다.`,
    });
    s.push({
      n: "가드",
      label: "beforeJudge",
      status: "완료",
      detail: "입력 검사를 통과했습니다. 지급 항목이 있는지, 출국일이 입사일보다 빠르지 않은지 확인했습니다.",
    });
    s.push({
      n: "2단",
      label: "판정",
      status: "완료",
      detail: `규칙 ${skill!.ruleCatalog.length}개를 검사해 ${findings.length}건의 결과를 냈습니다. 같은 입력이면 항상 같은 결과가 나옵니다.`,
    });
    s.push({
      n: "가드",
      label: "afterJudge",
      status: guardViolations.length ? "차단" : "완료",
      detail: guardViolations.length
        ? `가드레일 위반 ${guardViolations.length}건: ${guardViolations.join(" / ")}`
        : // 개수와 이름을 카탈로그에서 뽑는다 — G8을 넣고도 이 줄이 "7종"이라 말하던 사고의 재발 방지
          `가드레일 ${GUARDRAIL_CATALOG.length}종을 모두 통과했습니다: ${GUARDRAIL_CATALOG.map((g) => g.name).join(" · ")}.`,
    });
    s.push({
      n: "온톨로지",
      label: "A-Box 대조",
      status: abox?.check.violations.length ? "차단" : "완료",
      detail: abox
        ? abox.check.violations.length
          ? `용어 사전 대조 실패 ${abox.check.violations.length}건: ${abox.check.violations.join(" / ")}`
          : `이 실행을 개체 ${abox.check.counts.individuals}개, 관계 ${abox.check.counts.links}개로 풀어 ` +
            `용어 사전(T-Box)과 대조했습니다. 어긋난 곳이 없습니다.`
        : "판정 결과가 없어 개체 그래프를 만들지 않았습니다.",
    });
    /*
     * 3단은 넷 중 하나다 — 상태를 지어내지 않고 실제 배선에서 읽는다:
     *   미연결: 제공자 없음(키·URL 미설정). 조립(한국어)은 그래도 돈다.
     *   대기:   제공자 연결됨, 아직 번역을 누르지 않음.
     *   완료:   번역이 숫자 보존 검증까지 통과해 화면에 나감.
     *   차단:   모델이 계약(줄 형식·숫자 보존)을 어겨 원문 폴백 — 가드가 일한 것이다.
     */
    const 언어명 = 언어들.find((l) => l.code === lang)?.name;
    s.push({
      n: "3단",
      label: "설명",
      status: !provider?.provider
        ? "미연결"
        : transError
          ? "차단"
          : transDone && lang !== "ko"
            ? "완료"
            : "대기",
      detail: !provider?.provider
        ? "한국어 답변은 코드가 이미 만들었습니다. 번역 서비스만 연결되지 않았습니다. " +
          "서버에 ANTHROPIC_API_KEY 또는 OLLAMA_URL을 설정하면 이 단계가 열립니다."
        : transError
          ? `번역이 확인을 통과하지 못해 한국어 원문을 보여 줍니다: ${transError}`
          : transDone && lang !== "ko"
            ? `${언어명} 번역을 마쳤습니다 (${transDone.model}). 금액, 날짜, 조문이 원문과 같은지 확인했습니다.`
            : `번역 서비스가 연결되어 있습니다 (${provider.provider}:${provider.model}). 답변 탭에서 언어를 고르면 번역하고, ` +
              "금액과 날짜가 원문과 같은지 확인한 뒤 보여 줍니다.",
    });
    return s;
  }, [
    ran, routes, skillId, skill, findings.length, guardViolations, abox,
    provider, lang, transDone, transError, agentProvider,
  ]);

  const totals = moneyTotals(findings);
  const vc = verifyCounts();

  function run() {
    setRan(true);
    setTab("findings");
    // 원장과 훅은 화면용 findings(실행 게이트)가 아니라 클릭 시점의 계산값을 쓴다 —
    // 게이트 값을 쓰면 첫 클릭이 지난 렌더의 빈 배열을 기록한다 (위 computed 주석의 사고)
    const 지금 = computed;
    const 위반 = harness && 지금.length ? checkAllGuardrails(지금, harness) : [];
    if (harness) {
      runHooks(harness.id, "beforeJudge", {
        input: { earnings: [1], hireDate, departureDate },
      });
      runHooks(harness.id, "afterJudge", { findings: 지금 });
      setLog(hookLog().slice(0, 8));
    }
    setLedger((prev) => [
      {
        seq: prev.length + 1,
        caseId: c.id,
        utterance: c.utterance,
        skill: skill?.name ?? "라우팅 실패",
        findings: 지금.length,
        ...(() => {
          const t = moneyTotals(지금);
          return {
            확정: t.확정,
            추정min: t.추정?.min ?? null,
            추정max: t.추정?.max ?? null,
          };
        })(),
        guardViolations: 위반.length,
        today,
      },
      ...prev,
    ]);
  }

  /** 키보드 우선 — 마우스를 잡지 않고 반복 실행할 수 있어야 한다 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (entrance) return;
        if (view === "monitor") run();
      }
      if (e.key === "Escape") {
        // ESC 우선순위: 메뉴 > 채팅 드로어 > (운영 패널 — _agent 소관) > 모니터 복귀.
        // 운영 패널은 자식이 관리해 상태를 모른다 — DOM 존재로 확인하고 양보한다.
        if (paygentMenuOpen) setPaygentMenuOpen(false);
        else if (chatOpen) setChatOpen(false);
        else if (!entrance && !document.getElementById("ops-panel")) setView("monitor");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /**
   * 시나리오 적용 → 자동 실행.
   *
   * setState 는 다음 렌더에야 반영되므로 여기서 run() 을 곧장 부르면 지난 값을
   * 판정한다. 순번을 하나 올리고, 새 값으로 그려진 뒤의 렌더에서 실행한다.
   */
  const [autoRun, setAutoRun] = useState(0);
  useEffect(() => {
    if (autoRun === 0) return;
    // 새 값으로 그려진 프레임 뒤에 실행한다 — 동기 실행은 계단식 렌더가 된다
    const id = requestAnimationFrame(() => run());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  function applyScenario(p: ScenarioPreset) {
    selectCase(p.caseId);
    if (p.today) setToday(p.today);
    if (p.nationality) setNationality(p.nationality);
    if (p.visa) setVisa(p.visa);
    if (p.hireDate) setHireDate(p.hireDate);
    if (p.departureDate) setDepartureDate(p.departureDate);
    if (p.wage) setWage(p.wage);
    if (p.size) setSize(p.size);
    setView("monitor");
    setAutoRun((v) => v + 1);
  }

  /* ── 페이전트 퀘스트 플래그 — 실제 사용자 행동(화면·탭 도달)에서만 세운다 ──
     이펙트 동기 setState 대신 렌더 중 조정 패턴(react.dev: adjusting state during
     render) — 이 파일의 prevAnswer·prevNarrow와 같은 문법이다. */
  const [prevViewTab, setPrevViewTab] = useState({ view, tab });
  if (prevViewTab.view !== view || prevViewTab.tab !== tab) {
    setPrevViewTab({ view, tab });
    // 화면이 바뀌면 그 화면이 든 대분류를 연다 — 접어 둔 채 들어와도 현재 위치가 보인다
    if (prevViewTab.view !== view) setNavOpenGroups((s) => ({ ...s, [navGroupOf(view)]: true }));
    if (view === "search" || view === "standards-map" || tab === "evidence") setEvidenceViewed(true);
    if (view === "golden") setGoldenViewed(true);
  }
  const hasDeadlineFlag = computed.some((f) => !!f.deadline) || findings.some((f) => !!f.deadline);
  const paygentState: PaygentState = useMemo(() => ({
    view: view as PaygentState["view"],
    ran,
    findingsCount: ran ? findings.length : 0,
    hasDeadline: hasDeadlineFlag,
    deadlineViewed,
    actionsViewed,
    agentResultExists: !!agentLoop.result,
    approvedAt: agentLoop.approvedAt,
    recordDownloaded,
    providerLive: !!(agentLoop.provider?.provider || provider?.provider),
    userFieldsFilled: !!(nationality && visa && hireDate && departureDate && wage > 0),
    evidenceViewed,
    goldenViewed,
  }), [view, ran, findings.length, hasDeadlineFlag, deadlineViewed, actionsViewed, agentLoop.result, agentLoop.approvedAt, recordDownloaded, agentLoop.provider, provider, nationality, visa, hireDate, departureDate, wage, evidenceViewed, goldenViewed]);

  const quest = useMemo(() => nextQuest(paygentState), [paygentState]);
  const prog = useMemo(() => progress(paygentState), [paygentState]);
  const rows = useMemo(() => boardRows(paygentState), [paygentState]);

  // 골 달성 축하 — 같은 골 두 번 축하 금지(세션 기억)
  const prevDoneRef = useRef<Set<string>>(new Set());
  const [celebrateMsg, setCelebrateMsg] = useState<string | null>(null);
  useEffect(() => {
    const nowDone = new Set(GOALS.filter((g) => g.chain && g.isDone(paygentState)).map((g) => g.id));
    for (const id of nowDone) {
      if (!prevDoneRef.current.has(id) && !celebratedGoals.has(id)) {
        const g = GOALS.find((x) => x.id === id)!;
        const next = GOALS.filter((x) => x.chain).find((x) => !x.isDone(paygentState) && !x.isLocked(paygentState)) ?? null;
        setCelebrateMsg(celebrationMessage(g, next));
        setPaygentCelebrateKey((k) => k + 1);
        setCelebratedGoals((prev) => new Set([...prev, id]));
        setTimeout(() => setCelebrateMsg(null), 3200);
        break;
      }
    }
    prevDoneRef.current = nowDone;
  }, [paygentState, celebratedGoals]);

  const counts = {
    queue: cases.length,
    evidence: vc.원본확인 + vc.판례 + vc["2차출처"],
    runs: ledger.length,
  };

  const latestJson = JSON.stringify(
    {
      case: c.id,
      utterance: c.utterance,
      today,
      findings,
      // 실행의 A-Box — 이 결과가 T-Box 어휘로만 쓰였다는 증명이 함께 나간다
      ...(abox
        ? {
            ontology: {
              runId: abox.graph.runId,
              individuals: abox.graph.individuals,
              tboxViolations: abox.check.violations,
            },
          }
        : {}),
    },
    null,
    2,
  );

  const payslipInput =
    skillId === "payslip" ? { ...payslipDraft, workplaceSize: size } : null;

  /* 1024 미만이면 레일을 아이콘으로 줄이고 큐를 겹친다. 1288 미만은 속성 패널만 겹친다 */
  const narrow = useNarrow(1024);
  const [queueOpen, setQueueOpen] = useState(false);
  /* 넓은 화면에서 큐를 얇은 레일로 접는다 — 세션 메모리만 (무저장 원칙) */
  const [queueCollapsed, setQueueCollapsed] = useState(false);

  // 기록 다운로드 래핑 — G6 플래그 세우기
  const wrappedDownloadRecord = () => {
    agentLoop.downloadRecord();
    setRecordDownloaded(true);
  };
  const wrappedAgentLoop = { ...agentLoop, downloadRecord: wrappedDownloadRecord } as typeof agentLoop;

  /*
   * ── 원터치 행동 실행 (2026-08-29) ──
   *
   * [다음 행동]은 이동만 하던 버튼이었다. 목적지가 이미 현재 화면이면 no-op이라
   * "하나도 안 눌린다"로 느껴졌다 (실측: 클릭은 적중, 상태 변화 0).
   * 이제 골의 act 서술자를 여기서 결정적으로 실행한다 — 이동·스크롤·포커스·
   * 순수 계산·본인 파일 다운로드까지만. 승인·모델 호출 자동 클릭은 없다.
   */
  const pendingDomActRef = useRef<{ kind: string; step?: number } | null>(null);
  const [actTick, setActTick] = useState(0);
  /* 걸음 스크롤 원터치는 사용자 화면 판정을 대신 실행한다 — ④~⑤는 판정 후에만 있다 */
  const [userAutoRunKey, setUserAutoRunKey] = useState(0);

  function runAct(goal: Goal) {
    const a = goal.act;
    if (entrance) dismissEntrance();
    setPaygentMenuOpen(false);
    switch (a.kind) {
      case "focus-user-input":
        setView("user");
        pendingDomActRef.current = { kind: a.kind };
        setActTick((t) => t + 1);
        break;
      case "run-judge":
        // 판정은 순수 계산이라 대행해도 안전하다 — 페이전트가 실제로 실행한다
        if (!casePicked) {
          // 아직 큐에 상담이 없다 — 내 급여 확인하기의 입력으로 판정하고, 그 입력이 큐로 온다
          setView("user");
          setUserAutoRunKey((k) => k + 1);
          break;
        }
        setView("monitor");
        setTab("findings");
        run();
        break;
      case "scroll-user-step":
        setView("user");
        setUserAutoRunKey((k) => k + 1); // ④~⑤ 걸음은 판정 후에만 렌더된다
        if (a.step === 4) setDeadlineViewed(true);
        if (a.step === 5) setActionsViewed(true);
        pendingDomActRef.current = { kind: a.kind, step: a.step };
        setActTick((t) => t + 1);
        break;
      case "highlight-approval":
        // 승인 패널까지 데려다주고 하이라이트한다 — 승인 클릭은 사람의 것.
        // 운영 패널이 닫혀 있을 수 있어 열라는 신호를 먼저 보낸다.
        setView("agent-run");
        window.dispatchEvent(new Event("paygent-open-ops"));
        pendingDomActRef.current = { kind: a.kind };
        setActTick((t) => t + 1);
        break;
      case "download-record":
        wrappedDownloadRecord();
        break;
      case "navigate":
        setView(goal.dest.view as ViewId);
        if (goal.dest.tab) setTab(goal.dest.tab as MonitorTab);
        break;
    }
    // 실행 피드백 — 페이전트가 짧게 반응한다. "눌렀는데 그대로"는 다시 없다
    setPaygentCelebrateKey((k) => k + 1);
  }

  /* 뷰 전환이 커밋된 다음 프레임에 스크롤·포커스·하이라이트 — DOM만 만지고
     상태는 건드리지 않는다(계단식 렌더 규칙과 무관한 안전 지대) */
  useEffect(() => {
    const a = pendingDomActRef.current;
    if (!a) return;
    pendingDomActRef.current = null;
    /* 대상은 뷰 전환·자동 판정 뒤에야 생긴다 — 프레임 단위로 몇 번 다시 찾는다 */
    let cancelled = false;
    const 찾아서 = (id: string, fn: (el: HTMLElement) => void, attempt = 0) => {
      if (cancelled) return;
      const el = document.getElementById(id);
      if (el) fn(el);
      else if (attempt < 40) requestAnimationFrame(() => 찾아서(id, fn, attempt + 1));
    };
    const raf = requestAnimationFrame(() => {
      if (a.kind === "focus-user-input") {
        찾아서("user-first-field", (el) => {
          el.scrollIntoView({ block: "center" });
          el.focus();
        });
      } else if (a.kind === "scroll-user-step") {
        찾아서(`user-step-${a.step}`, (el) => el.scrollIntoView({ block: "start" }));
      } else if (a.kind === "highlight-approval") {
        찾아서("approval-panel", (el) => {
          el.scrollIntoView({ block: "center" });
          el.classList.add("paygent-highlight");
          setTimeout(() => el.classList.remove("paygent-highlight"), 2400);
        });
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [actTick]);

  /* ── 페이전트 드래그 배치 — 5px 미만은 클릭, 이상은 드래그. 좌표는 세션만 ── */
  function pgPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const host = pgWrapRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    pgDragRef.current = { startX: e.clientX, startY: e.clientY, baseX: r.left, baseY: r.top, moved: false };
    const onMove = (ev: PointerEvent) => {
      const d = pgDragRef.current;
      const el = pgWrapRef.current;
      if (!d || !el) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      d.moved = true;
      setPgDragging(true);
      setPgPos({
        x: Math.min(Math.max(d.baseX + dx, 8), window.innerWidth - el.offsetWidth - 8),
        y: Math.min(Math.max(d.baseY + dy, 8), window.innerHeight - el.offsetHeight - 8),
      });
    };
    const onUp = () => {
      const d = pgDragRef.current;
      pgDragRef.current = null;
      setPgDragging(false);
      if (d?.moved) {
        // 드래그 직후 발사되는 click은 "집어 옮김"이지 부른 게 아니다 — 한 번만 무시
        pgSuppressClickRef.current = true;
        setTimeout(() => { pgSuppressClickRef.current = false; }, 0);
        endIntro(); // 옮겨 봤다 = 소개는 끝났다
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  /* 말풍선·메뉴는 캐릭터 위치를 따라 방향을 바꾼다 — 가장자리에서 자동 반전.
     pgPos가 null(기본 우하단)이면 window를 읽지 않아 SSR과도 일치한다 */
  const pgSide: "left" | "right" =
    pgPos && pgPos.x + 44 < window.innerWidth / 2 ? "right" : "left";
  const pgVert: "up" | "down" = pgPos && pgPos.y < 460 ? "down" : "up";

  /* 페이전트 동행 모드 — 콘솔 전 화면 상주. ✕는 최소화(도킹 아이콘)로만 줄어든다.
     운영 도시(agent-run)에서는 자동 도킹 — 화면의 1순위는 도시고, 페이전트는
     보조다. 아이콘을 누르면 메뉴가 그 자리에서 열린다 (말풍선은 상태 바가 대신한다). */
  const cityDock = view === "agent-run";
  const companionUi = !entrance && (
    <div
      ref={pgWrapRef}
      className={`fixed z-40 ${pgDragging ? "paygent-dragging" : ""} ${companionIntro ? "paygent-intro" : ""}`}
      style={pgPos ? { left: pgPos.x, top: pgPos.y } : { right: 16, bottom: 16 }}
    >
      {paygentMinimized || cityDock ? (
        /* 최소화 도킹 — 아이콘 하나. 누르면 페이전트 복원, 드래그도 그대로 된다 */
        <div onPointerDown={pgPointerDown} onClickCapture={(e) => { if (pgSuppressClickRef.current) { e.preventDefault(); e.stopPropagation(); } }} className="cursor-grab">
          <button
            onClick={() => {
              if (cityDock) {
                setPaygentMenuOpen((v) => !v);
                return;
              }
              setPaygentMinimized(false);
              try { sessionStorage.removeItem("paygent-minimized"); } catch {}
            }}
            aria-label={cityDock ? "페이전트 메뉴 열기" : "페이전트 펼치기"}
            title={cityDock ? "페이전트 메뉴" : "페이전트 펼치기"}
            className="paygent-pop grid h-11 w-11 place-items-center rounded-full border-2 border-[var(--accent)] bg-[var(--panel)] shadow-[var(--shadow-2)] hover:bg-[var(--accent-tint)]"
          >
            {/* 픽셀 아트 — next/image 리샘플링이 도트를 뭉갠다 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/paygent-256.png" alt="" width={30} height={30} draggable={false} style={{ imageRendering: "pixelated" }} />
          </button>
        </div>
      ) : (
        <>
          {/* 캐릭터 — 이 손잡이로만 드래그가 시작된다 (메뉴·말풍선 클릭과 안 섞인다) */}
          <div onPointerDown={pgPointerDown} onClickCapture={(e) => { if (pgSuppressClickRef.current) { e.preventDefault(); e.stopPropagation(); } }} className="cursor-grab">
            <Paygent size={companionIntro ? "medium" : "small"} celebrateKey={paygentCelebrateKey} label="페이전트 메뉴 열기" onAction={() => { endIntro(); setPaygentMenuOpen((v) => !v); }} />
          </div>

          {/* 말풍선 — 현재 퀘스트 대사. 캐릭터의 좌/우 중 여유 있는 쪽에 붙는다 */}
          {/* 자기소개 말풍선 — 퀘스트 말풍선보다 먼저, 끝나면 퀘스트로 자연스럽게 바뀐다 */}
          {companionIntro && !paygentMenuOpen && (
            <div
              role="status"
              className={`paygent-pop absolute bottom-1 w-[280px] max-w-[70vw] rounded-xl border-2 border-[var(--accent)] bg-[var(--panel)] px-3 py-2.5 shadow-[var(--shadow-2)] ${pgSide === "left" ? "right-full mr-2" : "left-full ml-2"}`}
            >
              <p className="text-xs font-bold">저 여기 있어요! 페이전트예요.</p>
              {/* 한 문장 = 한 줄 (2026-09-05) — 문장 둘이 한 줄에 이어지면 끊김이 안 보인다 */}
              <Sentences
                className="mt-1 text-xs leading-relaxed text-[var(--muted)]"
                text={
                  "누르면 지금 할 일을 알려드려요." +
                  (!narrow ? " 마우스로 잡아서 아무 데나 옮길 수 있어요. 새로고침하면 제자리로 돌아와요." : "")
                }
              />
              <button
                onClick={endIntro}
                className="mt-2 rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-bold text-white hover:bg-[var(--accent-hover)] motion-press"
              >
                알겠어요
              </button>
            </div>
          )}
          {quest && !paygentMenuOpen && !companionIntro && (
            <div
              role="status"
              className={`paygent-pop absolute bottom-1 w-[260px] max-w-[70vw] rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 shadow-[var(--shadow-2)] ${pgSide === "left" ? "right-full mr-2" : "left-full ml-2"}`}
            >
              <Sentences className="text-xs font-semibold leading-relaxed" text={quest.quest} />
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  onClick={() => runAct(quest.goal)}
                  className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-bold text-white hover:bg-[var(--accent-hover)] motion-press"
                >
                  다음 행동 실행
                </button>
                <span className="text-2xs text-[var(--muted-soft)]">진행 {prog.done}/{prog.total}</span>
                <button
                  onClick={() => {
                    setPaygentMinimized(true);
                    try { sessionStorage.setItem("paygent-minimized", "1"); } catch {}
                  }}
                  aria-label="페이전트 최소화"
                  title="작게 줄이기"
                  className="ml-auto grid h-5 w-5 place-items-center rounded text-[var(--muted)] hover:bg-[var(--surface)]"
                >
                  ✕
                </button>
              </div>
              {celebrateMsg && (
                <div role="status" className="mt-1.5 rounded-md border border-[var(--accent-tint-line)] bg-[var(--accent-tint)] px-2 py-1 text-xs font-bold text-[var(--accent)]">
                  <Sentences text={celebrateMsg} />
                </div>
              )}
            </div>
          )}


        </>
      )}
      {/* 메뉴 팝오버 — 도킹(도시)·전체 두 모드 공용. 위치는 캐릭터 기준 자동 반전 */}
          {/* 메뉴 팝오버 — 캐릭터가 화면 위쪽이면 아래로, 아래쪽이면 위로 연다 */}
          {paygentMenuOpen && (
            <>
              <button aria-label="메뉴 닫기" onClick={() => setPaygentMenuOpen(false)} className="fixed inset-0 z-30 cursor-default bg-transparent" />
              <div className={`absolute z-40 w-[320px] max-w-[88vw] rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 shadow-[var(--shadow-2)] motion-fade ${pgVert === "up" ? "bottom-full mb-2" : "top-full mt-2"} ${pgSide === "left" ? "right-0" : "left-0"}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">페이전트 메뉴</span>
              <button onClick={() => setPaygentMenuOpen(false)} aria-label="메뉴 닫기" className="grid h-7 w-7 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface)]">✕</button>
            </div>
            {/* ① 지금 할 일 */}
            <div className="mt-3 rounded-lg border border-[var(--accent-tint-line)] bg-[var(--accent-tint)] p-2.5">
              <p className="text-xs font-bold text-[var(--accent)]">① 지금 할 일</p>
              {quest ? (
                <>
                  <p className="mt-1 text-xs leading-relaxed">{quest.quest}</p>
                  <button
                    onClick={() => runAct(quest.goal)}
                    className="mt-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-bold text-white motion-press"
                  >
                    실행: {quest.dest.label}
                  </button>
                </>
              ) : (
                <p className="mt-1 text-xs">할 일을 모두 마쳤어요!</p>
              )}
            </div>
            {/* ② 골 보드 */}
            <div className="mt-3">
              <p className="text-xs font-bold">② 진행 상황</p>
              <p className="mt-1 font-mono text-2xs text-[var(--muted)]">{progressBar(prog.done, prog.total)} · {prog.done}/{prog.total}</p>
              <div className="mt-1 max-h-48 overflow-y-auto rounded border border-[var(--line)]">
                {rows.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      // 잠긴 골은 이동만(이유를 보러 가는 길) — 열린 골은 원터치 실행
                      const g = goalById(r.id);
                      if (g && !r.locked) {
                        runAct(g);
                        return;
                      }
                      setPaygentMenuOpen(false);
                      setView(r.dest.view as ViewId);
                      if (r.dest.tab) setTab(r.dest.tab as MonitorTab);
                    }}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[var(--surface)] ${r.done ? "text-[var(--accent)]" : r.locked ? "text-[var(--muted-soft)]" : "text-[var(--ink)]"}`}
                  >
                    <span className="font-mono text-xs w-4 text-center">{r.mark}</span>
                    <span className="flex-1 truncate">{r.name}</span>
                    {r.locked && <span className="text-2xs text-[var(--muted-soft)]">{r.lockReason}</span>}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-2xs leading-relaxed text-[var(--muted-soft)]">진행 상황은 이 창을 닫으면 사라져요. 서버에는 아무것도 남기지 않아요</p>
            </div>
            {/* ③ Agent와 대화 */}
            <button onClick={() => { setPaygentMenuOpen(false); setChatOpen(true); }} className="mt-3 flex w-full items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--surface)]">
              <Icon name="agent" /> ③ AI와 대화하기
            </button>
            {/* ④ 처음 화면으로 — 입장 씬 복귀 (진행은 유지된다, 초기화가 아니다) */}
            <button onClick={() => { setPaygentMenuOpen(false); setEntrance(true); setEntranceGreeted(false); }} className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--surface)]">
              <Icon name="search" /> ④ 처음 화면으로 (사용법 다시 보기)
            </button>
            {/*
             * ⑤ 언어 바꾸기 — 콘솔 안의 유일한 언어 전환 자리 (2026-09-02).
             * 좌측 레일 바닥의 select 는 뺐다: 바닥은 눈에 띄지 않는 자리이고(NN/g), 첫 화면에서
             * 이미 고른 것을 두 번째 장소에 또 두면 "어느 쪽이 진짜인가"가 된다. 페이전트는
             * 모든 화면에 떠 있으니 여기서 한 번 눌러 국기 목록으로 간다 — 한 클릭 거리는 지킨다.
             */}
            <button
              onClick={() => { setPaygentMenuOpen(false); setEntrance(true); setEntranceGreeted(true); setLangChosen(false); }}
              className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--surface)]"
            >
              <Icon name="translate" /> ⑤ 언어 바꾸기
              <span className="ml-auto flex items-center gap-1.5 font-normal text-[var(--muted)]" translate="no">
                <Flag code={현재언어.flag} className="h-3.5 w-5" />
                {현재언어.label}
              </span>
            </button>
            {uiLang !== "ko" && (
              <p className="mt-1 px-1 text-2xs text-[var(--muted-soft)]" role="status">
                자동 번역 · {trStatus.error ? `오류: ${trStatus.error}` : 엔진표시 ? `${엔진표시}${trStatus.busy ? " · 번역 중…" : ""}` : "번역 엔진이 연결되지 않아 한국어로 표시"}
              </p>
            )}
              </div>
            </>
          )}
    </div>
  );

  const chatUi = (
    <>
      {companionUi}
      {chatOpen && (
        <AgentChatDrawer
          loop={wrappedAgentLoop}
          onClose={() => setChatOpen(false)}
          onOpenFull={() => {
            setChatOpen(false);
            setView("agent-run");
          }}
          onApply={(p) => {
            setChatOpen(false);
            applyScenario(p);
          }}
        />
      )}
    </>
  );

  /**
   * 좁아지면 속성 패널을 닫는다.
   *
   * 실측 — 390px 에서 속성 패널(320px)이 본문(330px)을 거의 통째로 덮어, 화면을 열면
   * 판정이 아니라 입력 폼만 보였다. 넓은 화면에서는 옆에 서 있던 것이 좁아지면 앞을 막는다.
   * 토글로 다시 열 수 있고, 그때는 서랍으로 뜬다.
   */
  const [prevNarrow, setPrevNarrow] = useState(narrow);
  if (prevNarrow !== narrow) {
    setPrevNarrow(narrow);
    if (narrow) setPropsOpen(false);
  }

  const nav = (
    <SideNav
      view={view}
      onSelect={(v) => {
        setView(v);
        setQueueOpen(false);
        if (v === "search" || v === "standards-map") setEvidenceViewed(true);
        if (v === "golden") setGoldenViewed(true);
      }}
      counts={counts}
      mini={navMini || narrow}
      onToggleMini={() => setNavMini((v) => !v)}
      openGroups={navOpenGroups}
      onToggleGroup={(id) => setNavOpenGroups((s) => ({ ...s, [id]: !s[id] }))}
      onLogo={() => {
        setEntrance(true);
        setEntranceGreeted(false);
      }}
    />
  );

  // ── 입장 씬 — 첫 로드에만, 세션 안에서 스킵 기억 ──
  if (entrance) {
    const T = entranceText(uiLang);
    /* 무대 2막 — 인사도 했고 언어도 골랐다. 이때부터 2열(캐릭터 왼쪽 · 오른쪽 사용법) */
    const stage2 = entranceGreeted && langChosen;
    const tutorialActive = stage2;
    /*
     * 무대 1막 (2026-09-05) — 인사는 했고 언어는 아직. 캐릭터가 왼쪽으로 살짝 걸어가고
     * 인사 말풍선이 캐릭터 **오른쪽**에 붙는다. 예전처럼 말풍선을 캐릭터 아래에 쌓으면
     * 언어 선택판까지 합쳐 첫 화면에 스크롤바가 생겼다 — 첫 화면은 한 화면 안에서 끝난다.
     */
    const stage1 = entranceGreeted && !langChosen;
    return (
      /* 흰 무대 — 콘솔과 같은 면 문법. 어두운 무대는 캐릭터 blend·대비 둘 다 어긋났다 */
      /* 1막(언어 선택)은 세로가 가장 길다 — 위 여백을 줄여 노트북 높이(~660px)에서도 스크롤을 피한다 */
      <div className={`flex min-h-screen flex-col items-center bg-[var(--bg)] px-4 pb-4 text-[var(--ink)] ${stage1 ? "pt-8 min-[1024px]:pt-10 [@media(max-height:760px)]:pb-3 [@media(max-height:760px)]:pt-6" : "pt-16 min-[1024px]:pt-20"}`}>
        {translatorUi}
        {/* 워드마크 — smoke 조건. 제품명은 번역하지 않는다 */}
        {/* 워드마크는 첫 화면의 주인공이다 — 콘솔 제목(2xl)보다 두 단계 크게, 부제는 본문보다 크게 */}
        <h1 className="text-4xl font-bold tracking-tight min-[1024px]:text-5xl" translate="no">페이체크</h1>
        <p className="mt-3 text-lg font-medium text-[var(--muted)] min-[1024px]:text-xl">{T.tagline}</p>
        <button onClick={dismissEntrance} className="mt-3 text-xs font-semibold text-[var(--muted)] underline underline-offset-4 hover:text-[var(--ink)]">
          {T.toConsole}
        </button>

        {/*
         * 무대 — 인사 전에는 캐릭터 혼자 한가운데. 인사하면 캐릭터가 왼쪽 열(360px)로
         * 미끄러지고, 비는 가운데~오른쪽에 화면 상자들이 들어온다. 스크롤 없이 한 화면에
         * 다 보이는 것이 목표라 세로 여백을 아꼈다. <1024px에서는 세로로 쌓인다.
         *
         * 이동 거리(paygent-shift-left, globals.css): 그리드 폭은 min(72rem, 100vw-2rem),
         * 왼쪽 열 중심은 그 왼쪽 끝에서 180px. 무대 중심에서 거기까지가 시작 오프셋이다 —
         * 캐릭터가 "가운데서 왼쪽으로 걸어가는" 것으로 읽혀야지, 사라졌다 나타나면 안 된다.
         *
         * 인사 전 정렬 사고(옛 self-start 클래스가 flex-col 무대에도 붙어 왼쪽으로 쏠림)는
         * 인사 전 상태에 그리드 클래스를 아예 주지 않는 것으로 막는다.
         */}
        <div className={`mx-auto w-full max-w-6xl ${stage2 ? "mt-12 grid gap-8 min-[1024px]:grid-cols-[360px_1fr] min-[1024px]:items-center" : stage1 ? "mt-6 flex flex-col items-center" : "mt-12 flex flex-col items-center"}`}>
          {/* 1막은 가로 행(캐릭터 · 말풍선), 그 전후는 세로 열. 640px 미만은 자리가 없어 세로로 쌓인다 */}
          <div className={`flex w-full items-center justify-self-center ${stage1 ? "max-w-2xl flex-col justify-center gap-4 min-[640px]:flex-row min-[640px]:gap-8" : "max-w-md flex-col"} ${stage2 ? "paygent-shift-left" : ""}`}>
            {/* 낮은 화면(노트북 ~660px)에서는 1막의 캐릭터를 조금 줄여 언어판까지 한 화면에 넣는다 */}
            <div className={`paygent-enter ${stage1 ? "paygent-nudge-left shrink-0 [@media(max-height:760px)]:scale-75 [@media(max-height:760px)]:-my-5" : ""}`}>
              <Paygent size="large" celebrateKey={paygentCelebrateKey} label="페이전트 — 눌러보세요" onAction={() => setEntranceGreeted(true)} />
            </div>
            {!entranceGreeted ? (
              <p className="mt-4 text-sm text-[var(--muted)]">{T.tapHint}</p>
            ) : (
              <div className={`flex w-full flex-col ${stage1 ? "min-w-0 flex-1 items-start" : "max-w-md items-center"}`}>
                {/* 말풍선 — 튜토리얼 중에는 페이전트가 그 장의 대사를 한다. 1막에서는 캐릭터 오른쪽 */}
                <div role="status" className={`paygent-pop w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm leading-relaxed text-[var(--ink)] shadow-[var(--shadow-2)] ${stage1 ? "" : "mt-4"}`}>
                  <p className="font-bold">{T.greetTitle}</p>
                  <Sentences
                    key={tutorialActive ? tutorialIdx : langChosen ? "greet" : "lang"}
                    className="motion-fade mt-1 text-[var(--muted)]"
                    text={
                      tutorialActive
                        ? 튜토리얼장(tutorialIdx).bubble
                        : !langChosen
                          ? "먼저 언어를 골라 주세요. Please choose your language first."
                          : T.greetBody
                    }
                  />
                </div>
                {/* 고른 언어 — 국기와 이름. 바꾸려면 페이전트 메뉴 ⑤ (사용법 화면의 [변경]은 2026-09-03 제거) */}
                {langChosen && (
                  <p className="paygent-pop mt-2 flex items-center gap-1.5 text-xs text-[var(--muted)]" translate="no">
                    <Flag code={현재언어.flag} className="h-4 w-6" />
                    <span className="font-semibold text-[var(--ink)]">{현재언어.label}</span>
                    <span className="text-[var(--muted-soft)]">· {현재언어.en}</span>
                  </p>
                )}
                {/*
                 * 홈으로 가는 문은 하나, 그리고 가장 크다. 채운 파랑은 이 단추 하나만 쓴다.
                 *
                 * 홈 = 내 급여 확인하기(근로자용 화면). 판정 모니터는 운영자의 첫 화면이지
                 * 근로자의 홈이 아니다 (2026-09-02 변경). 사용법 마지막 장의 단추도 같은 곳으로 간다.
                 * 운영자는 위의 [바로 콘솔로]로 모니터에 들어간다.
                 */}
                {stage2 && (
                <button
                  onClick={() => enterFromEntrance("user")}
                  className="paygent-pop mt-3 flex w-full max-w-md items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white shadow-[var(--shadow-2)] hover:bg-[var(--accent-hover)] motion-press"
                >
                  <Icon name="home" cls="h-4.5 w-4.5 text-white" />
                  {T.goHome}
                  <span aria-hidden>→</span>
                </button>
                )}
                {/*
                 * 캐릭터 아래에는 홈 단추 하나만 (2026-09-02 [지금 할 일] 카드 제거).
                 * 퀘스트는 콘솔 안의 동행 페이전트 말풍선이 이미 맡는다 — 입장 씬에서까지
                 * 행동 단추를 쌓으면 홈 단추의 서열이 흐려진다.
                 */}
              </div>
            )}
          </div>

          {/*
           * 언어 선택 — 인사 다음, 사용법 전. 국기 + 그 언어로 쓴 이름 + 영문 이름.
           * 못 읽는 언어로 언어를 고를 수는 없으니 이름은 그 언어로, 보조로 영문을 붙인다.
           * 국기는 고르기(미리보기)만 하고, 아래 [확인] 단추가 확정한다 — 단추 글자는 고른
           * 언어의 단어(UI_LANGS.confirm)라 사용자가 자기 선택을 눈으로 확인하고 누른다.
           * 자동 번역이 건드리면 안 되는 영역이라 translate="no".
           */}
          {entranceGreeted && !langChosen && (
            <section className="paygent-pop mt-4 w-full max-w-4xl [@media(max-height:760px)]:mt-2" aria-label="언어 선택 / Select your language" translate="no">
              <p className="flex items-center justify-center gap-2 text-base font-bold">
                <Icon name="translate" cls="h-5 w-5 text-[var(--accent)]" />
                언어를 선택하세요 · Select your language
              </p>
              {/* 20개 언어 — 넓은 화면은 5열(4줄)로 한 줄을 아낀다 */}
              <div className="mt-3 grid grid-cols-2 gap-2 min-[640px]:grid-cols-3 min-[900px]:grid-cols-4 min-[1024px]:grid-cols-5 [@media(max-height:760px)]:gap-1.5">
                {UI_LANGS.map((l) => {
                  const on = l.code === uiLang;
                  return (
                    <button
                      key={l.code}
                      type="button"
                      lang={l.code}
                      aria-pressed={on}
                      onClick={() => pickUiLang(l.code)}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors motion-press [@media(max-height:760px)]:py-1.5 ${
                        on
                          ? "border-[var(--accent)] bg-[var(--accent-tint)] ring-2 ring-[var(--accent-tint-line)]"
                          : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent)] hover:bg-[var(--accent-tint)]"
                      }`}
                    >
                      <Flag code={l.flag} className="h-6 w-9" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-[var(--ink)]">{l.label}</span>
                        <span className="block truncate text-2xs text-[var(--muted)]">{l.en}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* [확인] — 고른 언어로 쓰인 단추. 채운 파랑은 이 화면에서 이 단추 하나 */}
              <button
                type="button"
                lang={uiLang}
                onClick={() => chooseLang(uiLang)}
                className="paygent-pop mx-auto mt-4 flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white shadow-[var(--shadow-2)] hover:bg-[var(--accent-hover)] motion-press [@media(max-height:760px)]:mt-3 [@media(max-height:760px)]:py-2.5"
              >
                <Flag code={현재언어.flag} className="h-4 w-6" />
                {현재언어.confirm}
                <span aria-hidden>→</span>
              </button>
              {/* 단추 아래 자동 번역 상태 문구는 2026-09-05 제거 — 엔진 상태는 페이전트 메뉴 ⑤ 아래에 남아 있다 */}
            </section>
          )}

          {/* 오른쪽 열 — 사용법. 마지막 장과 [건너뛰기]는 홈으로 직행한다 */}
          {tutorialActive && (
            <div className="paygent-dash-enter w-full min-w-0">
              <Tutorial
                step={tutorialIdx}
                onStep={(i) => setTutorialIdx(i)}
                onFinish={finishTutorial}
                onSkip={finishTutorial}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view !== "monitor") {
    return (
      <div className="flex h-screen overflow-hidden">
        {nav}
        <main key={view} className="min-w-0 flex-1 overflow-y-auto motion-fade">
          {view === "user" && (
            <UserView
              initialToday={today}
              autoRunKey={userAutoRunKey}
              onDeadlineViewed={() => setDeadlineViewed(true)}
              onActionsViewed={() => setActionsViewed(true)}
              onSubmit={submitUserCase}
              onOpenMonitor={() => setView("monitor")}
            />
          )}
          {view === "agent-run" && (
            <AgentRunView
              loop={wrappedAgentLoop}
              caseId={caseId}
              onSelectCase={selectCase}
              onApply={applyScenario}
              onNavigate={(v, t) => {
                setView(v as ViewId);
                if (t) setTab(t as MonitorTab);
              }}
            />
          )}
          {view === "audit" && (
            <AuditView
              runs={ledger}
              modelCalls={modelCalls}
              onSelectCase={(id) => {
                selectCase(id);
                setView("monitor");
              }}
            />
          )}
          {view === "artifacts" && (
            <ArtifactsView runs={ledger} latestJson={latestJson} />
          )}
          {view === "standards-map" && <StandardsMapView />}
          {view === "golden" && <GoldenView />}
          {view === "skills" && <SkillsView />}
          {view === "ontology" && <OntologyView abox={abox} />}
          {view === "org" && (
            <OrgView narratorLive={!!provider?.provider} agentLive={!!agentProvider?.provider} agentModel={agentProvider?.model} />
          )}
          {view === "scenarios" && <ScenariosView onApply={applyScenario} />}
          {view === "approvals" && (
            <ApprovalsView
              onNavigate={(v) => setView(v as ViewId)}
            />
          )}
          {view === "queue" && (
            <QueueView
              onOpen={(x) => {
                selectCase(x.id);
                setView("monitor");
              }}
            />
          )}
          {view === "harness" && <HarnessView onRunSelfTest={run} narratorLive={!!provider?.provider} agentLive={!!agentProvider?.provider} />}
          {view === "search" && <SearchView />}
          {view === "explain" && <ExplainView />}
        </main>
        {chatUi}
        {translatorUi}
      </div>
    );
  }

  return (
    /* relative: 아래 속성 패널이 좁은 화면에서 이 그릇을 기준으로 겹친다 */
    <div className="relative flex h-screen overflow-hidden">
      {nav}

      {/* 겹쳐 뜬 큐 뒤를 눌러도 닫힌다. 좁은 화면에서 닫기 버튼만 두면 빠져나갈 길이 하나뿐이다 */}
      {narrow && queueOpen && (
        <button
          aria-label="상담 큐 닫기"
          onClick={() => setQueueOpen(false)}
          className="absolute inset-0 z-20 bg-[var(--ink)]/20"
        />
      )}

      {(!narrow || queueOpen) && (
        <CaseQueue
          cases={queueCases}
          selectedId={casePicked ? caseId : ""}
          onSelect={(id) => {
            selectCase(id);
            setQueueOpen(false);
          }}
          onRun={run}
          onAgentRun={() => setView("agent-run")}
          overlay={narrow}
          onClose={() => setQueueOpen(false)}
          collapsed={queueCollapsed}
          onToggleCollapse={() => setQueueCollapsed((v) => !v)}
        />
      )}

      {/* ── 본문 ── */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 text-xs min-[1024px]:px-8">
          <div className="flex min-w-0 items-center gap-2 text-[var(--muted)]">
            {/* 큐가 겹쳐 숨은 화면에서는 여기가 큐로 들어가는 유일한 문이다 */}
            {narrow && (
              <button
                onClick={() => setQueueOpen(true)}
                aria-label="상담 큐 열기"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[var(--line)] hover:bg-[var(--surface)]"
              >
                ☰
              </button>
            )}
            <span className="hidden min-[1024px]:inline">선택 상담</span>
            {casePicked ? (
              <>
                <span className="font-mono text-[var(--ink)]">{c.id}</span>
                <Pill tone={badgeTone(c.badge)}>{c.badge}</Pill>
              </>
            ) : (
              <span className="text-[var(--muted-soft)]">없음</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Pill tone={ran ? "ok" : "muted"}>
              {ran ? "판정 완료" : "대기 중"}
            </Pill>
            <PanelToggle
              open={propsOpen}
              onClick={() => setPropsOpen((v) => !v)}
              label="속성 패널"
            />
          </div>
        </div>

        {/* 아직 고른 상담이 없다 — 판정할 대상이 없으니 탭도 본문도 열지 않는다 */}
        {!casePicked && (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-md rounded-xl border border-dashed border-[var(--line)] px-6 py-8 text-center">
              <Icon name="queue" cls="mx-auto h-6 w-6 text-[var(--muted-soft)]" />
              <p className="mt-3 text-base font-bold">판정할 상담이 아직 없습니다</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                <span className="block">[내 급여 확인하기]에서 상황을 입력하고 [받을 돈 확인하기]를 누르면</span>
                <span className="block">그 내용이 왼쪽 상담 큐로 옵니다.</span>
                <span className="block">그다음 [판정 실행하기] 또는 [에이전트 실행]을 누르세요.</span>
              </p>
              <button
                onClick={() => setView("user")}
                className="motion-press mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--accent-hover)]"
              >
                내 급여 확인하기로 이동 →
              </button>
            </div>
          </div>
        )}

        {casePicked && (
        <div className="border-b border-[var(--line)] px-4 pb-4 pt-5 min-[1024px]:px-8">
          <h1 className="text-2xl font-bold tracking-tight">{c.utterance}</h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
            {c.summary}
          </p>
          <div className="mt-4">
            <Tabs
              active={tab}
              onSelect={setTab}
              tabs={[
                { id: "findings", label: "판정", count: findings.length || undefined },
                { id: "answer", label: "답변" },
                { id: "input", label: "입력" },
                { id: "loop", label: "루프", count: steps.length || undefined },
                { id: "evidence", label: "근거", count: skillId ? undefined : 0 },
                { id: "verify", label: "검증" },
              ]}
            />
          </div>
        </div>
        )}

        {casePicked && (
        <div key={tab} className="flex-1 overflow-y-auto px-4 py-6 min-[1024px]:px-8 motion-fade">
          {tab === "findings" && (
            <FindingsTab
              findings={findings}
              totals={totals}
              skill={skill}
              ran={ran}
              routed={!!skillId}
            />
          )}
          {tab === "answer" && (
            <AnswerTab
              answer={answer}
              routed={!!skillId}
              ran={ran}
              ts={translateState}
              onLang={requestLang}
            />
          )}
          {tab === "input" && (
            <InputTab
              payslip={payslipInput}
              departure={[
                ["국적", nationality],
                ["체류자격", visa],
                ["입사일", hireDate],
                ["출국(예정)일", departureDate],
                ["월 평균임금", wage.toLocaleString("ko-KR") + "원"],
                ["기준일", today],
              ]}
            />
          )}
          {tab === "loop" && <LoopTab steps={steps} />}
          {tab === "evidence" &&
            (skillId ? (
              <EvidenceTab skillId={skillId} />
            ) : (
              <p className="text-sm text-[var(--muted)]">
                스킬이 정해지지 않아 대조할 근거가 없습니다.
              </p>
            ))}
          {tab === "verify" &&
            (harness ? (
              <VerifyTab
                harness={harness}
                selfTest={selfTest}
                log={log}
                demonstrates={c.demonstrates}
                narratorLive={!!provider?.provider}
                agentLive={!!agentProvider?.provider}
              />
            ) : (
              <p className="text-sm text-[var(--muted)]">
                라우팅이 중단되어 실행할 하네스가 없습니다. {c.demonstrates}
              </p>
            ))}
        </div>
        )}
      </main>

      {/*
       * ── 속성 패널 — 판단 근거와 조작 손잡이만 남긴다 ──
       *
       * 1288px 미만에서는 열이 아니라 본문 위에 겹치는 판으로 바뀐다.
       * 왜: 이 화면의 고정 열 셋은 268 + 340 + 320 = 928px 을 먼저 가져가고, 바깥 그릇에
       * overflow-hidden 이 걸려 있다. 실측 — 844×390(가로로 눕힌 휴대전화)에서 이 패널은
       * L=608 R=928 로 놓여 84px 이 스크롤바도 없이 잘려 있었고, 그 안의 요소 29개가
       * 화면 밖에 있었다. main 은 폭 0px 까지 눌렸다. 눈으로는 "좀 좁네" 로만 보인다.
       * 겹치는 판으로 두면 이 패널이 행의 폭을 먹지 않으므로 본문이 눌리지 않는다.
       *
       * 1288 = 928(고정 열 셋) + 360(본문이 표를 담을 수 있는 최소 폭). 눈으로 고른 값이
       * 아니라 위 실측에서 나온 합이다. 열 폭을 바꾸면 이 숫자도 같이 바꿔야 한다.
       *
       * 숨기지 않고 겹치게 한 이유: 여기서 hidden 으로 처리하면 위 [속성 패널] 단추가
       * 좁은 화면에서 눌러도 아무 일이 없는 단추가 된다. 그건 없는 단추보다 나쁘다.
       *
       * 390px(세로 휴대전화)은 이제 위 useNarrow 가 맡는다 — 레일이 60px 로 줄고
       * 케이스 목록이 서랍이 되며, 이 패널은 기본 닫힘으로 시작한다.
       */}
      {narrow && propsOpen && (
        <button
          aria-label="속성 패널 닫기"
          onClick={() => setPropsOpen(false)}
          className="absolute inset-0 z-10 bg-[var(--ink)]/20"
        />
      )}
      {/* 고른 상담이 없으면 속성 패널도 닫는다 — 픽스처의 라우팅 점수가 빈 화면 옆에 떠 있으면 거짓말이다 */}
      {propsOpen && casePicked && (
        <aside className="absolute inset-y-0 right-0 z-20 w-[320px] max-w-[88vw] shrink-0 overflow-y-auto border-l border-[var(--line)] bg-[var(--panel)] px-5 py-4 shadow-[var(--shadow-2)] min-[1288px]:static min-[1288px]:z-auto min-[1288px]:shadow-none">
          <div className="flex items-center justify-between">
            <Eyebrow>PROPERTIES</Eyebrow>
            <span className="text-xs font-medium text-[var(--muted)]">
              상담 속성
            </span>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">AI 판단</h3>
              <Eyebrow>AGENT DECISION</Eyebrow>
            </div>
            {routes.length === 0 ? (
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                일치하는 스킬이 없습니다. 에이전트는 추측하는 대신 되묻습니다.
                한도계좌 스킬은 아직 없습니다.
              </p>
            ) : (
              <>
                <ul className="mt-2 space-y-1.5">
                  {routes.map((r, i) => (
                    <li key={r.skill.id} className="text-xs">
                      <span
                        className={
                          i === 0
                            ? "font-semibold text-[var(--ink)]"
                            : "text-[var(--muted)]"
                        }
                      >
                        {i === 0 ? "▶ " : "　 "}
                        {r.skill.name}
                      </span>
                      <span className="ml-1.5 font-mono text-[var(--muted-soft)]">
                        {r.score}점 · {r.matched.join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
                {모호 && (
                  <p className="mt-2 text-xs text-[var(--warning-ink)]">
                    후보 점수가 같습니다 — 실제 에이전트는 여기서 되묻습니다.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="mt-6 border-t border-[var(--line)] pt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">입력값</h3>
              <Eyebrow>CASE INPUT</Eyebrow>
            </div>

            <label className={`${라벨} mt-3`}>
              기준일 (today)
              <input
                type="date"
                value={today}
                /* 날짜 칸을 비우면 값이 빈 문자열로 온다. 그대로 넘기면 판정이 던져
                   화면이 통째로 죽는다. 빈 값은 무시하고 직전 기준일을 유지한다. */
                onChange={(e) => e.target.value && setToday(e.target.value)}
                className={`mt-1 ${필드}`}
              />
            </label>
            <p className="mt-1 text-2xs leading-relaxed text-[var(--muted-soft)]">
              시간을 옮기면 수령가능 → 기한임박 → 수령불가로 판정이 바뀝니다.
            </p>

            {skillId === "departure" && (
              <div className="mt-3 space-y-3">
                <label className={라벨}>
                  국적
                  <select
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                    className={`mt-1 ${필드}`}
                  >
                    {getSkill("departure")
                      .requiredInputs.find((i) => i.key === "nationality")!
                      .options!.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                  </select>
                </label>
                <label className={라벨}>
                  체류자격
                  <select
                    value={visa}
                    onChange={(e) => setVisa(e.target.value as Visa)}
                    className={`mt-1 ${필드}`}
                  >
                    {["E-9", "H-2", "E-8", "기타"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={라벨}>
                    입사일
                    <input
                      type="date"
                      value={hireDate}
                      onChange={(e) => setHireDate(e.target.value)}
                      className={`mt-1 ${필드}`}
                    />
                  </label>
                  <label className={라벨}>
                    출국(예정)일
                    <input
                      type="date"
                      value={departureDate}
                      onChange={(e) => setDepartureDate(e.target.value)}
                      className={`mt-1 ${필드}`}
                    />
                  </label>
                </div>
                <label className={라벨}>
                  월 평균임금 · S1에서 승계 가능
                  <input
                    type="number"
                    value={wage}
                    onChange={(e) => setWage(Number(e.target.value))}
                    className={`mt-1 ${필드}`}
                  />
                </label>
              </div>
            )}

            {skillId === "payslip" && (
              <>
                <label className={`${라벨} mt-3`}>
                  상시 근로자 수 · A7 분기
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value as WorkplaceSize)}
                    className={`mt-1 ${필드}`}
                  >
                    {["5인이상", "모름", "5인미만"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>

                {/* ── 명세서 값 편집 — 고정 샘플이 아니라 이 값이 판정 입력이다 ── */}
                <div className="mt-4 border-t border-[var(--line)] pt-3">
                  <h3 className="font-bold">명세서 값 (직접 고쳐 볼 수 있어요)</h3>
                  <p className="mt-1 text-2xs leading-relaxed text-[var(--muted-soft)]">
                    샘플은 출발점일 뿐입니다. 금액을 바꾸면 판정이 즉시 다시
                    계산됩니다. 사진(OCR) 추출은 로드맵이라 약속하지 않습니다 —
                    지금 입력 방식은 이 폼 하나입니다.
                  </p>
                  {(["earnings", "deductions"] as const).map((k) => (
                    <div key={k} className="mt-2.5">
                      <p className="text-2xs font-bold text-[var(--muted)]">
                        {k === "earnings" ? "지급 항목" : "공제 항목"}
                      </p>
                      {payslipDraft[k].map((it, idx) => (
                        <div key={`${k}-${idx}`} className="mt-1 flex items-center gap-1.5">
                          {k === "deductions" ? (
                            <input
                              value={it.label}
                              onChange={(e) => 항목수정(k, idx, { label: e.target.value })}
                              aria-label="공제 항목 이름"
                              className={`${필드} min-w-0 flex-1`}
                            />
                          ) : (
                            <span className="min-w-0 flex-1 truncate text-xs">{it.label}</span>
                          )}
                          <input
                            type="number"
                            value={it.amount}
                            onChange={(e) => 항목수정(k, idx, { amount: Number(e.target.value) || 0 })}
                            aria-label={`${it.label} 금액`}
                            className={`${필드} w-24 shrink-0 text-right`}
                          />
                          {k === "deductions" && (
                            <button
                              onClick={() => 공제삭제(idx)}
                              aria-label={`${it.label} 삭제`}
                              className="grid h-6 w-6 shrink-0 place-items-center rounded border border-[var(--line)] text-xs text-[var(--muted)] hover:bg-[var(--surface)]"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      {k === "deductions" && (
                        <button
                          onClick={공제추가}
                          className="mt-1.5 w-full rounded-md border border-dashed border-[var(--line)] py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface)]"
                        >
                          ＋ 공제 항목 추가 (근거 없는 공제 시연)
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    {(
                      [
                        ["scheduled", "소정근로(시간)"],
                        ["overtime", "연장(시간)"],
                        ["night", "야간(시간)"],
                        ["holiday", "휴일(시간)"],
                      ] as const
                    ).map(([hk, 이름]) => (
                      <label key={hk} className={라벨}>
                        {이름}
                        <input
                          type="number"
                          value={payslipDraft.hours?.[hk] ?? 0}
                          onChange={(e) => 시간수정(hk, Number(e.target.value) || 0)}
                          className={`mt-1 ${필드}`}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="mt-6 border-t border-[var(--line)] pt-4">
            <h3 className="font-bold">정확도 검증 사례</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {harness?.verification.goldenCases ?? 0}건. 자동 테스트와 같은 사례입니다
            </p>
            <button
              onClick={run}
              className="mt-3 w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] motion-press"
            >
              이 브라우저에서 재판정
            </button>
          </div>

          <p className="mt-6 border-t border-[var(--line)] pt-3 text-2xs leading-relaxed text-[var(--muted-soft)]">
            합성 데이터 · 실제 개인정보 없음. 이 결과는 법률 자문이 아니라 서류
            대조 결과입니다. 판정은 이 기기에서 계산되고, 번역·추출을 쓸 때만
            해당 텍스트가 설정된 번역·모델 제공자로 전송됩니다(서버 저장 없음 ·
            주민번호·전화번호류는 전송 전 차단).
          </p>
        </aside>
      )}
      {chatUi}
      {translatorUi}
    </div>
  );
}
