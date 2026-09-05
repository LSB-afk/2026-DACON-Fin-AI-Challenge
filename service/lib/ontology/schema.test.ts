/**
 * T-Box 스키마 테스트.
 *
 *   npx node --test lib/ontology/schema.test.ts
 *
 * 이 테스트가 막는 것:
 *   1. 지어낸 개념 — 코드에 없는 함수·타입·상수를 가리키는 클래스나 관계.
 *      파일을 readFileSync로 실제로 열어 심볼 문자열을 찾는다. 이름만 그럴듯하면 걸린다.
 *   2. 고아 클래스 — 없는 부모를 가리키거나, 부모를 타고 올라가다 제자리로 돌아오는 것.
 *   3. 읽을 수 없는 그림 — 최상위가 너무 많거나 계층이 너무 깊어져 화면에서 못 읽는 것.
 *   4. 허공을 가리키는 관계 — domain·range가 실재하지 않는 클래스를 가리키는 것.
 *   5. 장식이 된 제약 — enforcedBy에 없는 파일을 적어 강제되는 척하는 것.
 *   6. 100% 주장 — 모든 제약이 검사된다고 적는 것. null이 하나도 없으면 실패한다.
 *   7. 잘리는 라벨 — 20자를 넘겨 화면 노드 안에서 말줄임표가 되는 것.
 *
 * 이 테스트가 못 막는 것: 심볼이 그 파일에 있는지만 본다. 그 심볼이 클래스 설명과
 * 같은 뜻인지는 사람이 읽어야 한다.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CLASSES,
  OBJECT_PROPERTIES,
  DATA_PROPERTIES,
  AXIOMS,
  classById,
  ancestors,
  enforcedRatio,
} from "./schema.ts";

const 저장소루트 = fileURLToPath(new URL("../../", import.meta.url));

/** 이미 읽은 파일은 다시 읽지 않는다. 클래스 66개가 같은 파일을 수십 번 연다. */
const 파일캐시 = new Map<string, string | null>();

function 파일읽기(경로: string): string | null {
  if (!파일캐시.has(경로)) {
    try {
      파일캐시.set(경로, readFileSync(저장소루트 + 경로, "utf8"));
    } catch {
      // 파일이 없다는 것도 결과다. null로 기억해 두고 호출부가 실패 메시지를 만든다.
      파일캐시.set(경로, null);
    }
  }
  return 파일캐시.get(경로)!;
}

/**
 * `파일:심볼` 을 쪼갠다. 경로에는 콜론이 없으므로 첫 콜론에서 자른다.
 * `Foo('bar')` 표기는 `Foo` 와 `bar` 두 토큰으로 나눈다 — 상수 객체의 키까지 대조하려면
 * 이 표기가 필요하다. 예: 공제항목패턴('산재보험')
 */
function 쪼개기(codeSource: string): { 경로: string; 토큰: string[] } {
  const i = codeSource.indexOf(":");
  const 경로 = codeSource.slice(0, i);
  const 심볼 = codeSource.slice(i + 1);
  const m = 심볼.match(/^(.+?)\('(.+)'\)$/);
  return { 경로, 토큰: m ? [m[1], m[2]] : [심볼] };
}

/** codeSource 하나를 검사해 위반 문장을 돌려준다. 통과면 null */
function codeSource위반(id: string, label: string, codeSource: string): string | null {
  if (!codeSource.includes(":")) {
    return `[${id}] ${label}: codeSource "${codeSource}" 가 '파일:심볼' 형식이 아니다`;
  }
  const { 경로, 토큰 } = 쪼개기(codeSource);
  const 원문 = 파일읽기(경로);
  if (원문 === null) {
    return `[${id}] ${label}: 파일 "${경로}" 가 저장소에 없다`;
  }
  const 없는것 = 토큰.filter((t) => !원문.includes(t));
  return 없는것.length
    ? `[${id}] ${label}: "${경로}" 안에 심볼 ${없는것.map((t) => `"${t}"`).join(", ")} 가 없다`
    : null;
}

const 이름 = (id: string) => classById(id)?.label ?? id;

/* ───────────────────── 1. codeSource 실재성 ───────────────────── */

for (const c of CLASSES) {
  test(`${c.id}: codeSource(${c.codeSource}) 가 실재한다`, () => {
    const 위반 = codeSource위반(c.id, c.label, c.codeSource);
    assert.equal(위반, null, 위반 ?? "");
  });
}

for (const p of OBJECT_PROPERTIES) {
  test(`${p.id}: codeSource(${p.codeSource}) 가 실재한다`, () => {
    const 위반 = codeSource위반(p.id, p.label, p.codeSource);
    assert.equal(위반, null, 위반 ?? "");
  });
}

/* ───────────────────── 2. 계층 무결성 ───────────────────── */

test("클래스 id에 중복이 없다", () => {
  const 본것 = new Set<string>();
  const 중복 = CLASSES.map((c) => c.id).filter((id) =>
    본것.has(id) ? true : (본것.add(id), false),
  );
  assert.deepEqual(중복, [], `중복 id ${중복.length}건: ${중복.join(", ")}`);
});

test("parent가 실재하는 클래스를 가리킨다", () => {
  const ids = new Set(CLASSES.map((c) => c.id));
  const 위반 = CLASSES.filter((c) => c.parent !== null && !ids.has(c.parent)).map(
    (c) => `[${c.id}] ${c.label}: parent "${c.parent}" 가 CLASSES에 없다`,
  );
  assert.deepEqual(위반, [], `없는 부모를 가리키는 클래스 ${위반.length}건\n${위반.join("\n")}`);
});

test("부모를 타고 올라가면 반드시 최상위에서 멈춘다 (순환 없음)", () => {
  const 위반: string[] = [];
  for (const c of CLASSES) {
    const 본것 = new Set<string>([c.id]);
    let cur = c.parent;
    let 깊이 = 0;
    while (cur && 깊이 < CLASSES.length + 1) {
      if (본것.has(cur)) {
        위반.push(`[${c.id}] ${c.label}: 부모 사슬이 "${이름(cur)}"(${cur})로 되돌아온다`);
        break;
      }
      본것.add(cur);
      cur = classById(cur)?.parent ?? null;
      깊이 += 1;
    }
  }
  assert.deepEqual(위반, [], `순환 ${위반.length}건\n${위반.join("\n")}`);
});

test("최상위 묶음이 8개 ± 2다", () => {
  const 최상위 = CLASSES.filter((c) => c.parent === null);
  assert.ok(
    최상위.length >= 6 && 최상위.length <= 10,
    `최상위는 6~10개여야 하는데 ${최상위.length}개다: ${최상위.map((c) => c.label).join(", ")}`,
  );
});

test("최상위 앞 3묶음이 들어온 것, 가운데 3묶음이 만든 것, 뒤 2묶음이 검사하는 것이다", () => {
  const 역할 = CLASSES.filter((c) => c.parent === null).map((c) => c.role);
  assert.deepEqual(
    역할,
    ["입력", "입력", "입력", "산출", "산출", "산출", "제약", "통제"],
    `최상위 역할 순서가 어긋났다: ${역할.join(" / ")}`,
  );
});

test("계층 깊이가 4단을 넘지 않는다", () => {
  const 위반 = CLASSES.map((c) => ({ c, 깊이: ancestors(c.id).length + 1 }))
    .filter((x) => x.깊이 > 4)
    .map((x) => `[${x.c.id}] ${x.c.label}: 깊이 ${x.깊이}단 (상한 4단)`);
  assert.deepEqual(위반, [], `너무 깊은 클래스 ${위반.length}건\n${위반.join("\n")}`);
});

test("layer 값이 실제 계층 깊이와 같다", () => {
  const 위반 = CLASSES.filter((c) => c.layer !== ancestors(c.id).length + 1).map(
    (c) => `[${c.id}] ${c.label}: layer는 ${c.layer}인데 실제 깊이는 ${ancestors(c.id).length + 1}단이다`,
  );
  assert.deepEqual(위반, [], `layer 불일치 ${위반.length}건\n${위반.join("\n")}`);
});

test("클래스가 40~70개다", () => {
  assert.ok(
    CLASSES.length >= 40 && CLASSES.length <= 70,
    `클래스는 40~70개여야 하는데 ${CLASSES.length}개다. 적으면 흐름도와 다를 게 없고, 많으면 화면에서 못 읽는다.`,
  );
});

test("note가 비어 있는 클래스가 없다", () => {
  const 위반 = CLASSES.filter((c) => c.note.trim().length < 10).map(
    (c) => `[${c.id}] ${c.label}: note가 ${c.note.trim().length}자다 (10자 이상)`,
  );
  assert.deepEqual(위반, [], `설명 없는 클래스 ${위반.length}건\n${위반.join("\n")}`);
});

/* ───────────────────── 3. 속성 정합성 ───────────────────── */

test("관계의 domain·range가 실재하는 클래스다", () => {
  const 위반: string[] = [];
  for (const p of OBJECT_PROPERTIES) {
    if (!classById(p.domain)) 위반.push(`[${p.id}] ${p.label}: domain "${p.domain}" 가 CLASSES에 없다`);
    if (!classById(p.range)) 위반.push(`[${p.id}] ${p.label}: range "${p.range}" 가 CLASSES에 없다`);
  }
  assert.deepEqual(위반, [], `domain/range 위반 ${위반.length}건\n${위반.join("\n")}`);
});

test("데이터 속성의 domain이 실재하는 클래스다", () => {
  const 위반 = DATA_PROPERTIES.filter((d) => !classById(d.domain)).map(
    (d) => `[${d.id}] ${d.label}: domain "${d.domain}" 가 CLASSES에 없다`,
  );
  assert.deepEqual(위반, [], `domain 위반 ${위반.length}건\n${위반.join("\n")}`);
});

test("속성 id에 중복이 없다", () => {
  const 전부 = [...OBJECT_PROPERTIES, ...DATA_PROPERTIES].map((p) => p.id);
  const 본것 = new Set<string>();
  const 중복 = 전부.filter((id) => (본것.has(id) ? true : (본것.add(id), false)));
  assert.deepEqual(중복, [], `중복 속성 id ${중복.length}건: ${중복.join(", ")}`);
});

test("자기 자신을 가리키는 관계가 없다", () => {
  const 위반 = OBJECT_PROPERTIES.filter((p) => p.domain === p.range).map(
    (p) => `[${p.id}] ${p.label}: domain과 range가 둘 다 "${이름(p.domain)}"다`,
  );
  assert.deepEqual(위반, [], `자기참조 ${위반.length}건\n${위반.join("\n")}`);
});

/* ───────────────────── 4. 정직성 2종 ───────────────────── */

test("enforcedBy에 적힌 파일과 심볼이 실재한다", () => {
  const 위반 = AXIOMS.map((a, i) =>
    a.enforcedBy === null
      ? null
      : codeSource위반(`공리#${i}`, `${a.left} ${a.kind} ${a.right}`, a.enforcedBy),
  ).filter((v): v is string => v !== null);
  assert.deepEqual(
    위반,
    [],
    `강제되는 척하는 공리 ${위반.length}건 — 없는 파일을 적으면 그 공리는 장식이다\n${위반.join("\n")}`,
  );
});

test("아직 아무도 검사하지 않는 공리가 최소 1개 남아 있다", () => {
  const { enforced, total } = enforcedRatio();
  const 미검사 = AXIOMS.filter((a) => a.enforcedBy === null);
  assert.ok(
    미검사.length >= 1,
    `enforcedBy가 null인 공리가 0건이다 (${enforced}/${total}). ` +
      `전부 검사된다는 주장을 하려면 이 테스트를 지워야 하고, 그 diff는 리뷰에서 보인다.`,
  );
});

test("공리의 left·right가 실재한다", () => {
  const 속성id = new Set([...OBJECT_PROPERTIES, ...DATA_PROPERTIES].map((p) => p.id));
  const 위반: string[] = [];
  for (const [i, a] of AXIOMS.entries()) {
    if (!classById(a.left)) 위반.push(`[공리#${i}] left "${a.left}" 가 CLASSES에 없다`);
    // functional은 right가 속성 id, 나머지는 클래스 id다.
    const ok = a.kind === "functional" ? 속성id.has(a.right) : !!classById(a.right);
    if (!ok) {
      위반.push(
        `[공리#${i}] ${a.kind}의 right "${a.right}" 가 ${a.kind === "functional" ? "속성" : "CLASSES"} 목록에 없다`,
      );
    }
  }
  assert.deepEqual(위반, [], `공리 참조 위반 ${위반.length}건\n${위반.join("\n")}`);
});

test("공리의 why가 추상 설명이 아니라 사고 시나리오다", () => {
  const 위반 = AXIOMS.filter((a) => a.why.trim().length < 20).map(
    (a, i) => `[공리#${i}] ${a.left} ${a.kind} ${a.right}: why가 ${a.why.trim().length}자다 (20자 이상)`,
  );
  assert.deepEqual(위반, [], `설명 없는 공리 ${위반.length}건\n${위반.join("\n")}`);
});

/* ───────────────────── 5. 라벨 길이 ───────────────────── */

test("라벨이 20자를 넘지 않는다", () => {
  const 전부 = [
    ...CLASSES.map((c) => ({ id: c.id, label: c.label, 종류: "클래스" })),
    ...OBJECT_PROPERTIES.map((p) => ({ id: p.id, label: p.label, 종류: "관계" })),
    ...DATA_PROPERTIES.map((d) => ({ id: d.id, label: d.label, 종류: "데이터 속성" })),
  ];
  const 위반 = 전부
    .filter((x) => [...x.label].length > 20)
    .map((x) => `[${x.id}] ${x.종류} 라벨 "${x.label}" 가 ${[...x.label].length}자다 (상한 20자)`);
  assert.deepEqual(위반, [], `긴 라벨 ${위반.length}건\n${위반.join("\n")}`);
});
