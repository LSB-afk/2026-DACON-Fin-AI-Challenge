#!/usr/bin/env node
/**
 * 저장소 파일에 비밀 키와 개인정보가 섞여 들어가는 것을 막는다.
 *
 * 막는 것 셋: sk-ant- 로 시작하는 Anthropic 키가 코드에 박히는 것,
 * .env 파일이 커밋되는 것, 합성 샘플에 진짜 형식의 주민·외국인등록번호가 섞이는 것.
 * 못 막으면: 키는 남이 우리 요금으로 호출하고, 등록번호는 지워도 git 이력에 남는다.
 * 사람은 이런 것을 마감 전날에 발견한다. 그래서 기계가 매번 본다.
 *
 * lib/harness/guardrails.ts 의 PII_PATTERNS 와 패턴이 겹치지만 합치지 않는다.
 * 거기는 「판정 결과가 사용자에게 나갈 때」를 보고, 여기는 「파일이 저장소에 남을 때」를 본다.
 * 검사 시점도 대상도 다르다. 하나로 합치면 한쪽 오탐을 줄이려고 규칙을 느슨하게 만든 순간
 * 다른 쪽이 조용히 뚫린다. 대신 두 곳의 패턴이 어긋나면 이 주석을 같이 고쳐라.
 *
 * ★ 이 스캐너는 매치된 문자열을 절대 출력하지 않는다 ★
 * 출력은 곧 CI 로그다. 위반이 걸리는 순간, 막으려던 유출을 CI 가 대신 하게 된다.
 * 실제로 그렇게 뚫린 스캐너가 있었다. 그래서 가릴 것을 고르지 않고
 * 드러내도 되는 것만 고른다 — report() 위 주석을 봐라.
 *
 * 알려진 한계: .xlsx .hwp .jpg 같은 바이너리는 이름만 본다. 압축 안에 편집 도구가
 * 심어 둔 작성자 이름이나 사진 EXIF 는 읽지 못한다. 그런 파일이 실제로 들어오면
 * 압축을 푸는 단계를 여기 붙여라.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 규칙 한 벌. 다른 스크립트가 가져다 쓸 수 있게 export 한다.
 *
 * severity
 *   "error" — 무조건 실패. 개인정보 규칙은 여기서 절대 내려오지 않는다.
 *             한 번 커밋되면 되돌릴 수 없고, 지워도 이력에 남는다.
 *   "key"   — git 이 들고 있으면 error, 무시 중이면 warn. 키는 저장소에 들어갔을 때만
 *             남이 쓸 수 있다. 로컬에만 있는 .env 까지 빌드를 세우면 소음이 되고,
 *             소음은 진짜 경고를 덮는다.
 *
 * where: "path" 는 파일 이름만 본다. 본문에서 `.env` 를 언급한 문서까지 잡지 않으려는 것이다.
 * where 가 없는 규칙은 파일 이름과 본문을 둘 다 본다 — 이름 자체가 개인정보인 파일이 있다.
 *
 * id 앞머리 "pii." 에는 뜻이 있다: 이 규칙이 파일 이름에 걸리면 이름이 곧 유출이라
 * 출력에서 이름을 가린다.
 */
export const RULES = [
  { id: "key.anthropic", severity: "key", re: /sk-ant-[A-Za-z0-9_-]{20,}/, msg: "Anthropic API 키 형식" },
  { id: "key.openai", severity: "key", re: /\bsk-[A-Za-z0-9]{32,}\b/, msg: "OpenAI 계열 API 키 형식" },
  { id: "key.aws", severity: "key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, msg: "AWS 액세스 키 형식" },
  { id: "key.private", severity: "key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, msg: "개인 키 파일 내용" },
  {
    id: "key.assign",
    severity: "key",
    // 아직 없는 키까지 잡으려는 규칙이다. 값이 16자 넘게 따옴표 안에 박힌 것만 본다.
    re: /(?:api[_-]?key|secret|token|passwd|password)\s*[:=]\s*["'`][^"'`\s]{16,}["'`]/i,
    msg: "코드에 값이 박힌 비밀",
  },
  { id: "key.envfile", severity: "key", where: "path", re: /(?:^|\/)\.env(?:\.|$)/, msg: ".env 파일" },
  {
    id: "pii.krid",
    severity: "error",
    // 주민등록번호(뒷자리 1~4)와 외국인등록번호(5~8)를 한 규칙으로 본다. 대응이 같기 때문이다.
    // 앞 6자리를 그냥 \d{6} 으로 두면 13자리 숫자열이 전부 걸린다. 월·일 범위를 박아
    // 오탐을 줄였다. 하이픈은 있어도 없어도 잡는다 — CSV 로 내보내면 보통 빠져 있다.
    re: /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[-\s]?[1-8]\d{6}(?!\d)/,
    msg: "주민·외국인등록번호 형식",
  },
  { id: "pii.phone", severity: "error", re: /\b01[016789][-. ]?\d{3,4}[-. ]?\d{4}\b/, msg: "휴대전화 번호 형식" },
  {
    id: "pii.passport",
    severity: "error",
    // 여권번호는 대문자 한 글자 + 숫자 8자리다. 소문자까지 허용하면 16진수 해시 조각이
    // 걸린다(a12345678 은 유효한 16진수다). 실제 여권은 대문자라 여기서 끊는다.
    re: /\b[A-Z]\d{8}\b/,
    msg: "여권번호 형식",
  },
];

/**
 * 오탐 화이트리스트 — 드러나도 되는 번호들.
 *
 * 우리 판정 결과는 상담 기관 번호를 그대로 담는다(constants-departure.ts, registry.ts).
 * 공개된 대표번호라 개인정보가 아니고, 사용자가 전화를 걸어야 하니 지울 수도 없다.
 * 지금 규칙으로는 걸리지 않지만, 규칙을 넓히는 순간 제일 먼저 걸릴 자리라 미리 막아 둔다.
 */
export const ALLOW = ["1350", "1355", "02-2261-8400"];

/** 허용 번호를 같은 길이의 비숫자로 덮는다. 길이를 유지해야 옆 숫자와 붙어 새 매치를 만들지 않는다. */
const scrub = (s) => ALLOW.reduce((t, a) => t.split(a).join("·".repeat(a.length)), s);

/**
 * 본문까지 읽는 확장자.
 * 우리가 쓰는 것(.ts .tsx .css .json .md .mjs .js) + 제3자 데이터가 텍스트로 들어오는 것(.csv .txt)
 * + 편집 도구가 작성자 이름을 심어 넣는 텍스트 형식(.svg — 피그마·일러스트레이터가 그렇게 한다).
 * 목록에 없는 확장자도 파일 이름은 검사한다. .xlsx 를 이름만 보는 이유가 그것이다.
 */
export const TEXT_EXT = new Set([
  ".ts", ".tsx", ".css", ".json", ".md", ".mjs", ".js",
  ".csv", ".txt", ".svg", ".yml", ".yaml",
]);

const SKIP_DIR = new Set(["node_modules", ".next", ".git"]);

// 저장소 경로에 공백과 한글이 들어 있다. URL.pathname 을 그대로 쓰면 %5B 로 인코딩된
// 경로가 나와 statSync 가 전부 실패하고, 스캐너가 0건으로 조용히 통과한다.
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function walk(target, out) {
  let st;
  try {
    st = statSync(target);
  } catch {
    // 읽을 수 없는 항목은 검사 대상이 아니다. 지워졌거나 끊어진 심볼릭 링크다.
    // 삼켜도 되는 이유: 스캔 범위가 줄 뿐 잘못된 통과를 만들지 않는다.
    return out;
  }
  if (st.isFile()) {
    out.push(target);
    return out;
  }
  if (!st.isDirectory()) return out;
  for (const e of readdirSync(target, { withFileTypes: true })) {
    if (e.isDirectory() && SKIP_DIR.has(e.name)) continue;
    // 심볼릭 링크는 따라가지 않는다. 자기 조상을 가리키는 링크 하나면 CI 가 끝나지 않고,
    // 멈추지 않는 검사는 실패한 검사보다 알아채기 어렵다.
    // 대신 링크로 이어 붙인 폴더는 검사 밖에 남는다 — 그런 폴더가 생기면 인자로 직접 넘겨라.
    if (e.isSymbolicLink()) continue;
    walk(join(target, e.name), out);
  }
  return out;
}

/**
 * git 이 들고 있거나 곧 들 파일 목록. 무시 중인 파일은 여기 없다.
 * 판정에 실패하면 null 을 돌려주고, 호출부는 전부 추적 중으로 본다 — 안전한 쪽으로 넘어진다.
 */
function trackedSet() {
  try {
    const out = execFileSync(
      "git",
      ["-C", ROOT, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    );
    return new Set(out.split("\0").filter(Boolean).map((p) => resolve(ROOT, p)));
  } catch {
    return null;
  }
}

/**
 * ★ 출력 화이트리스트 ★
 * 여기서 내보내도 되는 값은 넷뿐이다: 경로 · 줄 번호 · 규칙 id · 규칙에 미리 적어 둔 고정 문장.
 * 매치된 문자열, 그 줄의 내용, 앞뒤 문맥은 어디에도 넣지 마라. 넣는 순간 이 스캐너가
 * 유출 경로가 된다. 새 필드를 출력에 더할 때는 "이 값이 파일 내용에서 왔는가"를 먼저 물어라.
 *
 * 파일 이름 자체가 개인정보인 경우(예: 어떤이름_900101.csv)가 있어서, 개인정보 규칙이
 * 이름에 걸리면 이름을 가린다. 폴더는 남긴다 — 폴더가 있어야 찾아갈 수 있다.
 */
function report(f) {
  const shown =
    f.line === 0 && f.id.startsWith("pii.")
      ? `${dirname(f.path)}/<이름 가림>${extname(f.path)}`
      : f.path;
  const tag = f.severity === "error" ? "오류" : "경고";
  return `${tag}\t${shown}:${f.line}\t${f.id}\t${f.msg}`;
}

/**
 * .env.example 만은 이름이 아니라 내용으로 판정한다.
 *
 * 이 파일은 "배포에 어떤 변수가 필요한가"를 적는 견본이라 커밋되는 것이 목적이다.
 * 이름만 보고 봐주면 누군가 진짜 키를 여기 적는 순간 스캐너가 눈을 감는다 —
 * 그래서 **모든 줄이 주석·빈 줄·빈 값일 때만** envfile 규칙을 면제한다.
 * 값이 하나라도 차 있으면 원래대로 오류다. 아래 selftest 가 두 방향을 다 잰다.
 */
export function envExample내용통과(text) {
  return text.split("\n").every((l) => {
    const t = l.trim();
    return t === "" || t.startsWith("#") || /^[A-Z0-9_]+=\s*$/.test(t);
  });
}

function envExample통과(rel, file) {
  if (rel !== ".env.example") return false;
  try {
    return envExample내용통과(readFileSync(file, "utf8"));
  } catch {
    return false; // 못 읽으면 면제도 없다 — 검사 누락을 통과로 바꾸지 않는다
  }
}

/** 파일 하나를 규칙 전부에 통과시킨다. 반환값에는 매치 문자열이 들어가지 않는다. */
export function scanFile(file, tracked) {
  const rel = (relative(ROOT, file) || basename(file)).split(sep).join("/");
  const isTracked = tracked === null || tracked.has(resolve(file));
  const found = [];
  const hit = (r, line) =>
    found.push({
      id: r.id,
      msg: r.msg,
      path: rel,
      line,
      severity: r.severity === "key" && !isTracked ? "warn" : "error",
    });

  for (const r of RULES) {
    if (r.id === "key.envfile" && envExample통과(rel, file)) continue;
    if (r.re.test(scrub(rel))) hit(r, 0);
  }

  if (!TEXT_EXT.has(extname(file).toLowerCase())) return found;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    // 읽기 실패는 검사 누락이지 통과가 아니다. 목록에 남기지 않고 넘어간다.
    return found;
  }
  text.split("\n").forEach((line, i) => {
    const s = scrub(line);
    for (const r of RULES) if (r.where !== "path" && r.re.test(s)) hit(r, i + 1);
  });
  return found;
}

/**
 * 규칙이 존재하는 것과 규칙이 도는 것은 다르다.
 * 개인정보가 들어오는 유일한 경로가 CSV 인데 정확히 그 확장자만 스캔 밖이라,
 * 문서에는 "CI 가 막는다"고 적힌 채 그 규칙이 한 번도 작동한 적 없던 사고가 있었다.
 * 그래서 규칙마다 가짜 위반을 하나씩 붙여 두고 매번 대조한다.
 *
 * 가짜 위반을 문자열 그대로 적으면 이 파일이 자기 규칙에 걸린다. 그래서 조각을 이어 붙인다.
 * 보기 흉한 것은 알지만, 스캐너가 자기 파일만 예외로 빼 두는 것보다 낫다.
 */
const FIXTURES = {
  "key.anthropic": "sk-ant-" + "a".repeat(24),
  "key.openai": "sk-" + "A1b2".repeat(10),
  "key.aws": "AKIA" + "B".repeat(16),
  "key.private": "-----BEGIN RSA " + "PRIVATE KEY-----",
  "key.assign": 'token: "' + "x".repeat(20) + '"',
  "key.envfile": ".env" + ".local",
  "pii.krid": "9001" + "01-1" + "234567",
  "pii.phone": "010-" + "1234-5678",
  "pii.passport": "M" + "12345678",
};

function selftest() {
  const fail = [];
  for (const r of RULES) {
    const fx = FIXTURES[r.id];
    if (fx === undefined) fail.push(`${r.id}: 가짜 위반이 없다. 규칙을 더했으면 FIXTURES 도 더해라`);
    else if (!r.re.test(fx)) fail.push(`${r.id}: 가짜 위반을 못 잡는다. 규칙이 죽었다`);
  }
  // env.example 면제는 이름이 아니라 내용이 조건이다 — 두 방향 다 잰다
  if (!envExample내용통과("# 주석\n\nOLLAMA_MODEL=\n"))
    fail.push("env.example 면제: 값 없는 견본을 면제하지 못한다");
  if (envExample내용통과("ANTHROPIC_API_KEY=sk-" + "live".repeat(4) + "\n"))
    fail.push("env.example 면제: 값이 찬 줄을 통과시킨다 — 면제가 구멍이 됐다");
  const 기관번호줄 = `문의: ${ALLOW.join(" · ")}`;
  const 오탐 = RULES.filter((r) => r.re.test(scrub(기관번호줄))).map((r) => r.id);
  if (오탐.length) fail.push(`기관 대표번호가 위반으로 잡힌다: ${오탐.join(", ")}`);

  for (const m of fail) console.error(`자체검사 실패\t${m}`);
  console.log(`자체검사: 규칙 ${RULES.length}개 / 실패 ${fail.length}건`);
  return fail.length ? 1 : 0;
}

function main(argv) {
  if (argv.includes("--selftest")) return selftest();

  const targets = argv.filter((a) => !a.startsWith("--"));
  const files = (targets.length ? targets : [ROOT]).flatMap((t) => walk(resolve(t), []));
  const tracked = trackedSet();
  const findings = files.flatMap((f) => scanFile(f, tracked));

  for (const f of findings) console.log(report(f));

  const errors = findings.filter((f) => f.severity === "error").length;
  const warns = findings.length - errors;
  if (tracked === null) console.log("git 상태를 읽지 못해 모든 파일을 추적 중으로 봤습니다.");
  if (warns) console.log("경고로 나온 키는 아직 커밋되지 않았습니다. 값이 새어 나갔다면 재발급하세요.");
  console.log(`검사 ${files.length}개 파일 / 오류 ${errors}건 / 경고 ${warns}건`);
  return errors ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
