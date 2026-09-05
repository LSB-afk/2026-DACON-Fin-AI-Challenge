/**
 * 하드코딩 차단 — 다이어그램의 모든 도메인 값은 코드에서 import 해야 한다.
 * 손으로 박은 사실이 하나라도 있으면 낡은 그림이 된다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const diagramsPath = join(HERE, "..", "app", "_diagrams.tsx");
const flowPath = join(HERE, "..", "app", "_flow.tsx");
const diagrams = readFileSync(diagramsPath, "utf8");
const flowSvg = readFileSync(flowPath, "utf8");

test("다이어그램은 constants-departure를 import 한다", () => {
  assert.match(diagrams, /from\s+["']@\/lib\/rules\/constants-departure["']/);
  // 기한 객체를 실제로 쓴다
  assert.match(diagrams, /기한\./);
});

test("다이어그램에 도메인 숫자 리터럴이 손으로 박히지 않았다 — 기한", () => {
  // 마커 정의나 텍스트에 "7일" "14일" "30일" 같은 리터럴이 직접 있으면 손코딩이다
  // 허용: "D=0", "365", 코드 주석, import 문
  // 금지: 따옴표 안의 "7일 전" "30일" "3년" 등이 상수 없이 바로 적힌 것
  // 우리는 기한 객체를 통해 `${기한.보험청구_출국전_일}일` 형태로 써야 한다
  // 파일에서 상수 없이 "7일"이 등장하면 실패
  const withoutImports = diagrams.replace(/import[\s\S]*?from[\s\S]*?;/g, "");
  // 주석 제거
  const codeOnly = withoutImports.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  // 7일·14일·30일·3년·5년이 따옴표 안에 리터럴로 있으면 잡는다
  // 단 `${기한.` 형태는 제외 — 이미 위에서 기한. 사용을 확인했으므로 여기선 리터럴만 본다
  // 리터럴 예:  "3년"  '5년'  "7일"  — 템플릿 리터럴 안의 `${`는 제외
  const badPatterns = [
    /["'`]3년["'`]/,
    /["'`]5년["'`]/,
    /["'`]\s*7일[^`]*["'`]/,
    /["'`]\s*14일[^`]*["'`]/,
    /["'`]\s*30일[^`]*["'`]/,
  ];
  for (const re of badPatterns) {
    // 허용: `${기한.`이 포함된 줄은 이미 기한을 쓰는 것이므로 제외
    const lines = codeOnly.split("\n");
    for (const line of lines) {
      if (line.includes("${기한.")) continue;
      if (re.test(line)) assert.fail(`다이어그램에 하드코딩된 도메인 숫자 리터럴: ${line.trim()}`);
    }
  }
});

test("다이어그램은 국적 명단을 import 한다", () => {
  assert.match(diagrams, /국민연금_사업장_적용제외국/);
  assert.match(diagrams, /국민연금_협정면제_E9/);
  assert.match(diagrams, /국민연금_납부_확인국/);
});

test("다이어그램은 귀국비용 금액을 import 한다", () => {
  assert.match(diagrams, /귀국비용보험_금액/);
  assert.match(diagrams, /출국만기보험_납입률/);
  assert.match(diagrams, /국민연금_요율_연도별/);
});

test("FlowDiagram은 lib/flow.ts만 읽는다", () => {
  assert.match(flowSvg, /from\s+["']@\/lib\/flow["']/);
  // 흐름 그림에 도메인 사실이 손으로 박히면 안 된다 — 단계 이름만
  assert.doesNotMatch(flowSvg, /보험청구.*7일/);
  assert.doesNotMatch(flowSvg, /30일 전/);
});

test("다이어그램 파일은 출처 각주를 단다 (codeSource 규율)", () => {
  assert.match(diagrams, /출처:/);
  assert.match(flowSvg, /출처:/);
});
