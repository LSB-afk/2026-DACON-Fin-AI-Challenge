import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GOALS,
  CHAIN,
  AUX,
  progress,
  nextQuest,
  boardRows,
  progressBar,
  celebrationMessage,
  initialState,
  NAV_DESC,
} from "./paygent.ts";

// ── 체인 순서 ──
test("체인 순서 — G1→G6 고정, AUX는 체인 밖", () => {
  assert.deepEqual(CHAIN.map((g) => g.id), ["G1", "G2", "G3", "G4", "G5", "G6"]);
  assert.deepEqual(AUX.map((g) => g.id), ["B2", "B3"]);
  assert.equal(GOALS.length, 8);
});

// ── 각 골 완료/잠금 조건 ──
test("G1 — 다섯 칸 채움이 완료 조건", () => {
  const s = initialState({ userFieldsFilled: false });
  assert.equal(GOALS.find((g) => g.id === "G1")!.isDone(s), false);
  assert.equal(GOALS.find((g) => g.id === "G1")!.isDone(initialState({ userFieldsFilled: true })), true);
  assert.equal(GOALS.find((g) => g.id === "G1")!.isLocked(s), false);
});

test("G2 — ran && findingsCount>0", () => {
  const g = GOALS.find((x) => x.id === "G2")!;
  assert.equal(g.isDone(initialState({ ran: false, findingsCount: 3 })), false);
  assert.equal(g.isDone(initialState({ ran: true, findingsCount: 0 })), false);
  assert.equal(g.isDone(initialState({ ran: true, findingsCount: 2 })), true);
});

test("G3 — 마감 있음 + 열람 플래그", () => {
  const g = GOALS.find((x) => x.id === "G3")!;
  assert.equal(g.isDone(initialState({ hasDeadline: true, deadlineViewed: false })), false);
  assert.equal(g.isDone(initialState({ hasDeadline: false, deadlineViewed: true })), false);
  assert.equal(g.isDone(initialState({ hasDeadline: true, deadlineViewed: true })), true);
  // 완료를 앞당겨 표시하지 않는다 — 열람 안 한 골은 미완
  assert.equal(g.isDone(initialState({ hasDeadline: true, deadlineViewed: false })), false);
});

test("G4 — 다음 행동 열람", () => {
  const g = GOALS.find((x) => x.id === "G4")!;
  assert.equal(g.isDone(initialState({ actionsViewed: false })), false);
  assert.equal(g.isDone(initialState({ actionsViewed: true })), true);
});

test("G5 — 잠금: Agent 결과 없으면 잠김, 완료는 approvedAt", () => {
  const g = GOALS.find((x) => x.id === "G5")!;
  assert.equal(g.isLocked(initialState({ agentResultExists: false })), true);
  assert.equal(g.isLocked(initialState({ agentResultExists: true })), false);
  assert.equal(g.lockReason, "AI 상담을 실행하면 열려요");
  assert.equal(g.isDone(initialState({ approvedAt: null })), false);
  assert.equal(g.isDone(initialState({ approvedAt: "2026-08-29 12:00" })), true);
});

test("G6 — 잠금: Agent·승인 없으면 잠김, 완료는 recordDownloaded", () => {
  const g = GOALS.find((x) => x.id === "G6")!;
  assert.equal(g.isLocked(initialState({ agentResultExists: false, approvedAt: null })), true);
  assert.equal(g.isLocked(initialState({ agentResultExists: true, approvedAt: null })), true);
  assert.equal(g.isLocked(initialState({ agentResultExists: true, approvedAt: "2026-08-29 12:00" })), false);
  assert.equal(g.isDone(initialState({ recordDownloaded: false })), false);
  assert.equal(g.isDone(initialState({ recordDownloaded: true })), true);
});

test("보조 골 — 잠금 없음, 상시 진행 가능", () => {
  for (const id of ["B2", "B3"]) {
    const g = GOALS.find((x) => x.id === id)!;
    assert.equal(g.isLocked(initialState()), false, `${id} 잠겨선 안 됨`);
  }
  assert.equal(GOALS.find((x) => x.id === "B2")!.isDone(initialState({ evidenceViewed: true })), true);
  assert.equal(GOALS.find((x) => x.id === "B3")!.isDone(initialState({ goldenViewed: true })), true);
});

// ── nextQuest 사다리 전 단계 ──
test("nextQuest 사다리 — 초기엔 G1", () => {
  const q = nextQuest(initialState());
  assert.ok(q);
  assert.equal(q!.goal.id, "G1");
  assert.deepEqual(q!.progress, { done: 0, total: 6 });
});

test("nextQuest 사다리 — G1 완료 후 G2", () => {
  const s = initialState({ userFieldsFilled: true });
  assert.equal(nextQuest(s)!.goal.id, "G2");
});

test("nextQuest — G1+G2 완료 후 G3", () => {
  const s = initialState({ userFieldsFilled: true, ran: true, findingsCount: 3, hasDeadline: true, deadlineViewed: false });
  // G3은 아직 미완이므로 G3이 다음
  assert.equal(nextQuest(s)!.goal.id, "G3");
});

test("nextQuest — G1~G3 완료 후 G4", () => {
  const s = initialState({ userFieldsFilled: true, ran: true, findingsCount: 2, hasDeadline: true, deadlineViewed: true, actionsViewed: false });
  assert.equal(nextQuest(s)!.goal.id, "G4");
});

test("nextQuest — G1~G4 완료 후 G5, 잠김 없이 노출", () => {
  const s = initialState({ userFieldsFilled: true, ran: true, findingsCount: 2, hasDeadline: true, deadlineViewed: true, actionsViewed: true, agentResultExists: true, approvedAt: null });
  assert.equal(nextQuest(s)!.goal.id, "G5");
});

test("nextQuest — 남은 골이 전부 잠기면 침묵하지 않고 해금 경로를 안내한다", () => {
  // G1~G4 완료, G5·G6 잠김 → 잠긴 첫 골(G5)을 locked 안내로 돌려준다.
  // null을 돌려주던 시절에는 안내가 가장 필요한 순간에 말풍선이 사라졌다.
  const s = initialState({ userFieldsFilled: true, ran: true, findingsCount: 2, hasDeadline: true, deadlineViewed: true, actionsViewed: true, agentResultExists: false });
  const q = nextQuest(s)!;
  assert.equal(q.goal.id, "G5");
  assert.equal(q.locked, true);
  assert.ok(q.quest.includes("아직 열리지 않았어요"));
  assert.ok(q.quest.includes("AI 상담을 실행하면 열려요"));
});

test("nextQuest — G1~G5 완료 후 G6 (승인 후 해금)", () => {
  const s = initialState({ userFieldsFilled: true, ran: true, findingsCount: 2, hasDeadline: true, deadlineViewed: true, actionsViewed: true, agentResultExists: true, approvedAt: "2026-08-29 12:00", recordDownloaded: false });
  assert.equal(nextQuest(s)!.goal.id, "G6");
});

test("nextQuest — 전부 완료면 null", () => {
  const s = initialState({ userFieldsFilled: true, ran: true, findingsCount: 2, hasDeadline: true, deadlineViewed: true, actionsViewed: true, agentResultExists: true, approvedAt: "2026-08-29 12:00", recordDownloaded: true });
  assert.equal(nextQuest(s), null);
});

// ── 진행도 계산 ──
test("진행도 — 완료수/전체수 정확", () => {
  assert.deepEqual(progress(initialState()), { done: 0, total: 6 });
  assert.deepEqual(progress(initialState({ userFieldsFilled: true })), { done: 1, total: 6 });
  assert.deepEqual(progress(initialState({ userFieldsFilled: true, ran: true, findingsCount: 1 })), { done: 2, total: 6 });
  assert.deepEqual(progress(initialState({ userFieldsFilled: true, ran: true, findingsCount: 1, hasDeadline: true, deadlineViewed: true, actionsViewed: true })), { done: 4, total: 6 });
});

test("progressBar — ▮▯ 형태", () => {
  assert.equal(progressBar(0, 6), "▯▯▯▯▯▯ 0/6");
  assert.equal(progressBar(2, 6), "▮▮▯▯▯▯ 2/6");
  assert.equal(progressBar(3, 6), "▮▮▮▯▯▯ 3/6");
  assert.equal(progressBar(6, 6), "▮▮▮▮▮▮ 6/6");
});

// ── 대사가 금액을 말하지 않는다 ──
test("상태 없으면 대사가 금액을 말하지 않는다", () => {
  const moneyRe = /\d+원|\d+만/;
  for (const g of GOALS) {
    assert.ok(!moneyRe.test(g.quest), `${g.id} quest에 금액이 들어 있음: ${g.quest}`);
    const doneMsg = g.doneQuest(undefined);
    assert.ok(!moneyRe.test(doneMsg), `${g.id} doneQuest에 금액: ${doneMsg}`);
    const celebr = celebrationMessage(g, null);
    assert.ok(!moneyRe.test(celebr), `${g.id} celebration에 금액: ${celebr}`);
  }
  // nextQuest 대사도 마찬가지
  const q = nextQuest(initialState());
  assert.ok(q && !moneyRe.test(q.quest));
});

// ── 보드 행 — 색만이 아닌 형태 ✓/○/🔒 ──
test("보드 — 완료/미완/잠김을 형태(✓/○/🔒)로 구분", () => {
  const s0 = initialState();
  const r0 = boardRows(s0);
  const g1 = r0.find((r) => r.id === "G1")!;
  assert.equal(g1.mark, "○");
  // G1~G4 미완이라 G5는 잠김이지만 nextQuest에선 안 보임, 보드에선 잠김 표시
  // 단 G5는 아직 잠김이므로 🔒
  // 초기엔 G1 미완이지만 G5도 잠김이므로 둘 다 확인 — G5만 잠김
  assert.equal(r0.find((r) => r.id === "G5")!.mark, "🔒");
  assert.equal(r0.find((r) => r.id === "G5")!.lockReason, "AI 상담을 실행하면 열려요");

  const sDone = initialState({ userFieldsFilled: true, ran: true, findingsCount: 1 });
  const r1 = boardRows(sDone);
  assert.equal(r1.find((r) => r.id === "G1")!.mark, "✓");
  assert.equal(r1.find((r) => r.id === "G2")!.mark, "✓");
  assert.equal(r1.find((r) => r.id === "G3")!.mark, "○");
});

// ── 단일 출처: NAV_DESC가 모든 NAV ID를 덮는가 ──
test("NAV_DESC — _ui.tsx NAV 뷰를 대부분 덮는다 (단일 출처 보조 검사)", () => {
  const expectedViews = ["user","monitor","agent-run","audit","artifacts","standards-map","skills","ontology","golden","org","queue","harness","search","explain","scenarios","approvals"];
  for (const v of expectedViews) {
    assert.ok(NAV_DESC[v], `NAV_DESC에 ${v} 설명 없음`);
  }
});

// ── 순수 함수 결정성 ──
test("결정성 — 같은 상태면 같은 nextQuest", () => {
  const s = initialState({ userFieldsFilled: true, ran: true, findingsCount: 3 });
  assert.deepEqual(nextQuest(s), nextQuest(s));
  assert.deepEqual(progress(s), progress(s));
  assert.deepEqual(boardRows(s), boardRows(s));
});

/* ── 원터치 행동(act) 경계 — 페이전트가 대신 해도 되는 것의 전집합 ── */

test("모든 골에 원터치 행동이 있고, 허용된 종류 밖의 행동은 없다", () => {
  const 허용 = new Set([
    "focus-user-input", "run-judge", "scroll-user-step",
    "highlight-approval", "download-record", "navigate",
  ]);
  for (const g of GOALS) {
    assert.ok(g.act, `${g.id}에 act 없음`);
    assert.ok(허용.has(g.act.kind), `${g.id}의 act ${g.act.kind}는 허용 밖`);
  }
});

test("승인 골(G5)의 행동은 하이라이트까지다 — 승인 대행은 존재하지 않는다", () => {
  const g5 = GOALS.find((g) => g.id === "G5")!;
  assert.equal(g5.act.kind, "highlight-approval");
  // 어떤 골에도 "approve" 류의 행동이 없다 — 부작용 경계
  for (const g of GOALS) assert.ok(!g.act.kind.includes("approve"), `${g.id}가 승인을 대행하려 함`);
});

test("판정 실행 골(G2)은 순수 계산을 실제로 실행한다", () => {
  assert.equal(GOALS.find((g) => g.id === "G2")!.act.kind, "run-judge");
});
