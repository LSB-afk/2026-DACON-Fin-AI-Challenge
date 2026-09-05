/**
 * 사무실 평면도 ↔ FLOW 1:1 강제 — 그림이 흐름과 어긋나는 순간 CI가 죽는다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FLOW } from "./flow.ts";
import { OFFICE_STATIONS, stationStatus, type StepLike } from "./office.ts";

test("스테이션은 FLOW와 1:1 — 순서·이름·행위자까지 같다", () => {
  assert.deepEqual(
    OFFICE_STATIONS.map((s) => s.id),
    FLOW.map((s) => s.id),
  );
  assert.deepEqual(
    OFFICE_STATIONS.map((s) => s.이름),
    FLOW.map((s) => s.이름),
  );
  assert.deepEqual(
    OFFICE_STATIONS.map((s) => s.행위자),
    FLOW.map((s) => s.행위자),
  );
});

const 실행후: StepLike[] = [
  { n: "0단", label: "라우팅", status: "완료" },
  { n: "1단", label: "발화 추출", status: "완료" },
  { n: "2단", label: "판정", status: "완료" },
  { n: "가드", label: "afterJudge", status: "완료" },
  { n: "온톨로지", label: "A-Box 대조", status: "완료" },
  { n: "3단", label: "설명", status: "완료" },
];

test("실행 전에는 아무 스테이션도 상태를 지어내지 않는다", () => {
  const ctx = { busy: false, hasResult: false, translateLive: true };
  for (const s of OFFICE_STATIONS) {
    assert.equal(stationStatus(s.id, [], ctx), null, `${s.id}가 실행 전에 상태를 가짐`);
  }
});

test("호출 중에는 라우팅·추출만 대기 — 한 POST에 묶여 있어서다", () => {
  const ctx = { busy: true, hasResult: false, translateLive: true };
  assert.equal(stationStatus("input", [], ctx), "완료");
  assert.equal(stationStatus("routing", [], ctx), "대기");
  assert.equal(stationStatus("extract", [], ctx), "대기");
  assert.equal(stationStatus("judge", [], ctx), null);
  assert.equal(stationStatus("translate", [], ctx), null);
});

test("실행 후에는 타임라인 상태를 그대로 옮긴다 — 재해석 금지", () => {
  const ctx = { busy: false, hasResult: true, translateLive: true };
  for (const [id, want] of [
    ["input", "완료"],
    ["routing", "완료"],
    ["extract", "완료"],
    ["judge", "완료"],
    ["guard", "완료"],
    ["ontology", "완료"],
    ["narrate", "완료"],
    ["translate", "대기"], // 연결됨 · 답변 탭에서 눌러야 실행
  ] as const) {
    assert.equal(stationStatus(id, 실행후, ctx), want, id);
  }
});

test("차단은 차단으로 — 미연결 번역은 미연결로", () => {
  const 차단됨: StepLike[] = [
    { n: "0단", label: "라우팅", status: "완료" },
    { n: "1단", label: "발화 추출", status: "차단" },
  ];
  const ctx = { busy: false, hasResult: true, translateLive: false };
  assert.equal(stationStatus("extract", 차단됨, ctx), "차단");
  assert.equal(stationStatus("translate", 차단됨, ctx), "미연결");
});

test("배달부 경유 순서는 FLOW 순서와 동일하다 — 동선이 곧 논리", async () => {
  const { OFFICE_ROUTE } = await import("./office.ts");
  assert.deepEqual([...OFFICE_ROUTE], FLOW.map((s) => s.id));
});
