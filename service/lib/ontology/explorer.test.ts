import { test } from "node:test";
import assert from "node:assert/strict";

import { CLASSES } from "./schema.ts";
import {
  conceptAxioms,
  conceptNeighborhood,
  conceptProperties,
  conceptRelations,
  domainHierarchy,
  searchConcepts,
  type ConceptTreeNode,
} from "./explorer.ts";

test("검색은 한글 이름·ID·설명과 코드 근거를 대소문자 없이 찾는다", () => {
  assert.deepEqual(searchConcepts("연금 반환").map((c) => c.id), [
    "verdict.departure.pension",
  ]);
  assert.ok(searchConcepts("control.execution").some((c) => c.id === "control.execution"));
  assert.ok(searchConcepts("AGENTRUNSCOPE").some((c) => c.id === "control.execution.scope"));
  assert.ok(searchConcepts("  내부 대기  ").some((c) => c.id === "control.execution.request"));
  assert.equal(searchConcepts("  ").length, CLASSES.length);
});

test("관계는 선택 개념을 기준으로 들어오는 선과 나가는 선을 나눈다", () => {
  const relations = conceptRelations("control.guard");
  assert.ok(relations.incoming.some((r) => r.property.id === "p.hook-runs-guard"));
  assert.ok(relations.outgoing.some((r) => r.property.id === "p.guards"));
  assert.ok(relations.incoming.every((r) =>
    r.applicability.some((match) =>
      match.concept.id === "control.guard" && match.endpoint === "target")));
  assert.ok(relations.outgoing.every((r) =>
    r.applicability.some((match) =>
      match.concept.id === "control.guard" && match.endpoint === "source")));
});

test("하위 개념은 상위 domain의 관계를 상속하되 선은 선언된 양 끝점에 고정한다", () => {
  const relation = conceptRelations("departure.nationality.paid").outgoing.find(
    (candidate) => candidate.property.id === "p.nationality-branches",
  );

  assert.equal(relation?.source.id, "departure.nationality");
  assert.equal(relation?.target.id, "verdict.departure.pension");
  assert.deepEqual(
    relation?.applicability.map((match) => ({
      concept: match.concept.id,
      endpoint: match.endpoint,
      inheritedFrom: match.inheritedFrom?.id ?? null,
    })),
    [{
      concept: "departure.nationality.paid",
      endpoint: "source",
      inheritedFrom: "departure.nationality",
    }],
  );
});

test("하위 개념은 상위 range로 들어오는 관계도 상속한다", () => {
  const relation = conceptRelations("verdict.level.claimable").incoming.find(
    (candidate) => candidate.property.id === "p.has-level",
  );

  assert.equal(relation?.source.id, "verdict");
  assert.equal(relation?.target.id, "verdict.level");
  assert.deepEqual(
    relation?.applicability.map((match) => ({
      concept: match.concept.id,
      endpoint: match.endpoint,
      inheritedFrom: match.inheritedFrom?.id ?? null,
    })),
    [{
      concept: "verdict.level.claimable",
      endpoint: "target",
      inheritedFrom: "verdict.level",
    }],
  );
});

test("이웃 탐색은 양방향으로 1홉과 2홉을 구분하고 유도된 선만 돌려준다", () => {
  const one = conceptNeighborhood("control.guard", 1);
  const two = conceptNeighborhood("control.guard", 2);
  const oneIds = new Set(one.classes.map((c) => c.id));
  const twoIds = new Set(two.classes.map((c) => c.id));

  assert.deepEqual(
    oneIds,
    new Set(["control", "control.guard", "control.hook", "control.selftest", "verdict"]),
  );
  assert.ok(!oneIds.has("money.amount"));
  assert.ok(twoIds.has("money.amount"));
  assert.ok(two.relations.every((r) =>
    twoIds.has(r.source.id) && twoIds.has(r.target.id)));
});

test("상속 관계의 이웃은 선택한 하위 개념과 실제 선언 끝점을 함께 돌려준다", () => {
  const neighborhood = conceptNeighborhood("departure.nationality.paid", 1);
  const ids = new Set(neighborhood.classes.map((concept) => concept.id));
  const relation = neighborhood.relations.find(
    (candidate) => candidate.property.id === "p.nationality-branches",
  );

  assert.ok(ids.has("departure.nationality.paid"));
  assert.ok(ids.has("departure.nationality"));
  assert.ok(ids.has("verdict.departure.pension"));
  assert.equal(relation?.source.id, "departure.nationality");
  assert.equal(relation?.target.id, "verdict.departure.pension");
  assert.equal(relation?.applicability[0]?.inheritedFrom?.id, "departure.nationality");
});

test("데이터 속성과 공리는 상위 클래스의 domain·left를 상속한다", () => {
  const propertyIds = conceptProperties("verdict.departure.pension").map((p) => p.id);
  assert.ok(propertyIds.includes("d.rule"));
  assert.ok(propertyIds.includes("d.level"));
  assert.ok(conceptAxioms("verdict.departure.pension").some((a) =>
    a.kind === "functional" && a.left === "verdict" && a.right === "d.level"));
});

test("계층은 여덟 루트를 원래 순서로 보존하고 모든 클래스를 한 번씩 담는다", () => {
  assert.deepEqual(domainHierarchy.map((node) => node.concept.id), [
    "utterance", "payslip", "departure", "verdict", "money", "evidence", "statute", "control",
  ]);
  const flatten = (nodes: ConceptTreeNode[]): string[] =>
    nodes.flatMap((node) => [node.concept.id, ...flatten(node.children)]);
  const ids = flatten(domainHierarchy);
  assert.equal(ids.length, CLASSES.length);
  assert.equal(new Set(ids).size, CLASSES.length);
});

test("없는 개념은 가짜 이웃·속성·공리를 만들지 않는다", () => {
  assert.deepEqual(conceptNeighborhood("missing", 2), { classes: [], relations: [] });
  assert.deepEqual(conceptRelations("missing"), { incoming: [], outgoing: [] });
  assert.deepEqual(conceptProperties("missing"), []);
  assert.deepEqual(conceptAxioms("missing"), []);
});
