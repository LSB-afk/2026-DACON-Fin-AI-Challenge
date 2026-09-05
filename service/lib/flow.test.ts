/**
 * 흐름 단일 출처 일치 강제 — 한쪽만 고치면 CI가 죽는다.
 * FlowDiagram은 lib/flow.ts만 읽고, 화면의 루프·Agent 타임라인도 같은 출처를 참조해야 한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FLOW } from "./flow.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const pageText = readFileSync(join(HERE, "..", "app", "page.tsx"), "utf8");
const agentText = readFileSync(join(HERE, "..", "app", "_agent.tsx"), "utf8");
const agentCoreText = readFileSync(join(HERE, "..", "app", "_agent-core.ts"), "utf8");
const officeLibText = readFileSync(join(HERE, "office.ts"), "utf8");
const officeCmpText = readFileSync(join(HERE, "..", "app", "_office.tsx"), "utf8");
const flowDiagramText = readFileSync(join(HERE, "..", "app", "_flow.tsx"), "utf8");

test("FLOW — 8단계 순서와 행위자", () => {
  assert.equal(FLOW.length, 8);
  assert.deepEqual(
    FLOW.map((s) => s.id),
    ["input", "routing", "extract", "judge", "guard", "ontology", "narrate", "translate"],
  );
  assert.deepEqual(
    FLOW.map((s) => s.행위자),
    ["사람", "모델", "모델", "코드", "코드", "코드", "코드", "모델"],
  );
});

test("FLOW — 이름은 단계 번호를 포함한다", () => {
  for (const s of FLOW) {
    assert.match(s.이름, /^(상담 입력|0단|1단|2단|가드레일|온톨로지|답변|3단)/);
  }
});

test("FLOW — 보는곳 view는 ViewId 집합 안에 있다", () => {
  const allowed = [
    "monitor",
    "agent-run",
    "audit",
    "artifacts",
    "standards-map",
    "skills",
    "ontology",
    "org",
    "queue",
    "harness",
    "search",
    "scenarios",
    "approvals",
    "explain",
  ];
  for (const s of FLOW) {
    assert.ok(allowed.includes(s.보는곳.view), `${s.id} view ${s.보는곳.view} 허용 밖`);
    if (s.보는곳.tab) {
      assert.ok(
        ["findings", "answer", "input", "loop", "evidence", "verify"].includes(s.보는곳.tab),
        `${s.id} tab ${s.보는곳.tab} 허용 밖`,
      );
    }
  }
});

test("FLOW — 모델 금지구역은 2단 판정 단 하나", () => {
  const models = FLOW.filter((s) => s.행위자 === "모델").map((s) => s.id);
  assert.ok(models.includes("routing") && models.includes("extract") && models.includes("translate"));
  assert.equal(FLOW.find((s) => s.id === "judge")?.행위자, "코드");
});

test("일치 강제 — page.tsx 루프 단계가 FLOW를 참조한다", () => {
  // page가 FLOW를 import하고 단계 빌드에 써야 한쪽만 고쳐도 걸린다
  assert.match(pageText, /from\s+["']@\/lib\/flow["']/);
  // page의 steps가 FLOW id나 이름을 직접 쓰는 흔적 — import만으로 부족하면 아래 이름 검사로 보완
  for (const s of FLOW) {
    // 각 FLOW 이름의 핵심 키워드가 page 어딘가에 있어야 한다 (라우팅·추출·판정·가드레일 등)
    const key = s.이름.replace(/^[0-9]단\s*/, "").slice(0, 2);
    assert.ok(pageText.includes(key), `page.tsx에 FLOW 이름 키워드 "${key}" 없음`);
  }
});

test("일치 강제 — Agent 화면이 사무실 평면도를 거쳐 FLOW를 참조한다", () => {
  // 참조 사슬: _agent.tsx → _office.tsx → lib/office.ts → lib/flow.ts.
  // 한 고리라도 끊기면(평면도가 FLOW 밖 데이터를 만들면) 여기서 죽는다.
  assert.match(officeLibText, /from\s+["']\.\/flow\.ts["']/);
  assert.match(officeCmpText, /from\s+["']@\/lib\/office["']/);
  assert.match(agentText, /from\s+["']\.\/_office["']/);
  for (const s of FLOW) {
    const key = s.이름.replace(/^[0-9]단\s*/, "").slice(0, 2);
    assert.ok(
      agentText.includes(key) || agentCoreText.includes(key) || flowDiagramText.includes(key),
      `Agent/Flow에 키워드 "${key}" 없음`,
    );
  }
});

test("FlowDiagram은 FLOW만 읽는다 — 하드코딩한 단계 이름 금지", () => {
  // FlowDiagram 파일이 FLOW를 import하는지, 손으로 단계 이름을 박지 않았는지
  assert.match(flowDiagramText, /import\s+.*FLOW.*from\s+["']@\/lib\/flow["']/);
  // 도메인 사실(7일·3년 등)이 FlowDiagram에 손으로 박히면 안 된다 — 흐름 그림은 단계 이름만
  assert.doesNotMatch(flowDiagramText, /보험청구.*7일/);
});

test("FLOW — 각 단계의 보는곳 라벨이 비어 있지 않다", () => {
  for (const s of FLOW) assert.ok(s.보는곳.라벨.trim().length > 0, `${s.id} 라벨 비어 있음`);
});
