/**
 * 골든셋 판정기 — 얇은 러너.
 *
 *   npm run verify
 *
 * 체커 본체는 lib/golden.ts 에 산다 (2026-08-28에 옮김). 화면의 「골든셋 평가」 뷰가
 * 같은 검사를 브라우저에서 보여줘야 해서 한 벌로 뽑았다 — 체커가 두 벌이면
 * 한쪽만 고쳤을 때 터미널과 화면이 서로 다른 답을 말한다.
 * 여기는 파일을 읽고, 리포트를 터미널 규약(위반 전부 출력 · exit code)으로 옮길 뿐이다.
 *
 * lib/ 는 .ts 를 상대경로로 그대로 부른다(Node 의 타입 스트리핑). package.json 에
 * "type": "module" 이 없어 Node 가 매번 경고를 찍으므로 그 경고 하나만
 * npm 스크립트에서 끈다. --no-warnings 로 전부 끄지 않는 이유: 진짜 경고까지 사라진다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runGolden } from "../lib/golden.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(
  readFileSync(join(HERE, "..", "golden", "cases.json"), "utf8"),
);

const rep = runGolden(doc);

if (rep.listCross.length) {
  for (const m of rep.listCross) console.error(`[공리] 국적 명단 교차 — ${m}`);
  process.exit(1);
}

if (rep.violations.length) {
  for (const line of rep.violations) console.error(line);
  console.error("");
  console.error(
    `실측: ${doc.cases.length}케이스 중 ${rep.passed}케이스 통과 · 위반 ${rep.violations.length}건`,
  );
  process.exit(1);
}

console.log(
  `실측: ${doc.cases.length}케이스 전부 통과 (판정 ${rep.judged} · 라우팅 ${rep.routed})\n` +
    `가드레일 위반 ${rep.guardTotal}건 · 룰 ${rep.totalRules}개 중 ${rep.firedRules.length}개가 실제로 발동 · ` +
    `A-Box 대조 ${rep.judged}실행 통과 · 그룹 ${Object.keys(doc.groups).length}개`,
);
