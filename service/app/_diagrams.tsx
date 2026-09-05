"use client";

import { useNarrow } from "./_ui";

import {
  기한,
  귀국비용보험_금액,
  귀국비용보험_제1군,
  귀국비용보험_제3군,
  국민연금_사업장_적용제외국,
  국민연금_협정면제_E9,
  국민연금_납부_확인국,
  국민연금_요율_연도별,
  출국만기보험_납입률,
} from "@/lib/rules/constants-departure";


/**
 * ① 출국정산 기한 타임라인 — 출국일 D=0 축.
 * 모든 마커는 lib/rules/constants-departure.ts:기한 에서만 읽는다.
 */

export function DeadlineTimeline({
  departureDate,
  today,
}: {
  departureDate?: string;
  today?: string;
}) {
  // 마커 정의 — 숫자 리터럴 금지, 기한 객체에서만
  const markers = [
    { label: "예정신고", days: -기한.예정신고_출국전_일, note: "고용센터" },
    { label: "보험청구 마감", days: -기한.보험청구_출국전_일, note: "①② 일괄" },
    { label: "출국일", days: 0, note: "D=0" },
    { label: "법정 지급", days: 기한.보험지급_출국후_일, note: "§13③" },
    { label: "보험 시효", days: 기한.보험_소멸시효_년 * 365, note: `${기한.보험_소멸시효_년}년` },
    { label: "연금 시효", days: 기한.연금_소멸시효_년 * 365, note: `${기한.연금_소멸시효_년}년` },
  ];

  // 지금 위치 — departureDate와 today가 있으면 계산
  let nowDays: number | null = null;
  if (departureDate && today) {
    const d = Date.parse(today) - Date.parse(departureDate);
    if (!Number.isNaN(d)) nowDays = Math.round(d / 86_400_000);
  }

  // SVG 레이아웃 — 결정적, 좁으면 세로 타임라인으로 전환해 라벨 겹침을 피한다
  const isNarrow = useNarrow(900);
  const W = isNarrow ? 360 : 720;
  const H = isNarrow ? 340 : 140;
  const pad = 40;
  const minD = Math.min(...markers.map((m) => m.days)) - 10;
  const maxD = Math.max(...markers.map((m) => m.days)) + 30;
  const xOf = (d: number) => pad + ((d - minD) / (maxD - minD)) * (W - pad * 2);
  const yOfH = 70;
  const yOf = (d: number) => (isNarrow ? 40 + ((d - minD) / (maxD - minD)) * (H - 80) : yOfH);

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)] p-3">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="출국일 기준 기한 타임라인">
        {/* 축 */}
        {isNarrow ? (
          <line x1={W / 2} y1={20} x2={W / 2} y2={H - 20} stroke="var(--line-strong)" strokeWidth={1.5} />
        ) : (
          <line x1={pad} y1={yOfH} x2={W - pad} y2={yOfH} stroke="var(--line-strong)" strokeWidth={1.5} />
        )}
        {/* 마커 — 가까운 마커는 y를 엇갈려 라벨이 겹치지 않게 */}
        {markers.map((m, idx) => {
          const x = isNarrow ? W / 2 : xOf(m.days);
          const y = isNarrow ? yOf(m.days) : yOfH;
          const isD0 = m.days === 0;
          // 가까운 마커끼리 겹치면 번갈아 위/아래로
          const prevX = idx > 0 ? (isNarrow ? yOf(markers[idx - 1].days) : xOf(markers[idx - 1].days)) : null;
          const close = prevX !== null && Math.abs((isNarrow ? y : x) - prevX) < 52;
          const stagger = close && idx % 2 === 1 ? -22 : 0;
          return (
            <g key={m.label}>
              {isNarrow ? (
                <line x1={W / 2 - 14} y1={y} x2={W / 2 + 14} y2={y} stroke={isD0 ? "var(--accent)" : "var(--line-strong)"} strokeWidth={isD0 ? 2.5 : 1.2} />
              ) : (
                <line x1={x} y1={56} x2={x} y2={84} stroke={isD0 ? "var(--accent)" : "var(--line-strong)"} strokeWidth={isD0 ? 2.5 : 1.2} />
              )}
              <text
                x={isNarrow ? W / 2 + 22 : x}
                y={isNarrow ? y + 4 + stagger : 44 + stagger}
                textAnchor={isNarrow ? "start" : "middle"}
                fontSize={10}
                fontWeight={isD0 ? 700 : 600}
                fill={isD0 ? "var(--accent)" : "var(--ink)"}
              >
                {m.label}
              </text>
              <text
                x={isNarrow ? W / 2 + 22 : x}
                y={isNarrow ? y + 14 + stagger : 98}
                textAnchor={isNarrow ? "start" : "middle"}
                fontSize={9}
                fill="var(--muted)"
              >
                {m.days > 0 ? `+${m.days}일` : m.days < 0 ? `${m.days}일` : "0일"}
              </text>
              <text
                x={isNarrow ? W / 2 + 22 : x}
                y={isNarrow ? y + 24 + stagger : 110}
                textAnchor={isNarrow ? "start" : "middle"}
                fontSize={8}
                fill="var(--muted-soft)"
              >
                {m.note}
              </text>
            </g>
          );
        })}
        {/* 지금 마커 */}
        {nowDays !== null && (
          <g>
            <line x1={xOf(nowDays)} y1={20} x2={xOf(nowDays)} y2={90} stroke="var(--bad)" strokeWidth={1.5} strokeDasharray="4 3" />
            <rect x={xOf(nowDays) - 22} y={12} width={44} height={14} rx={7} fill="var(--bad)" />
            <text x={xOf(nowDays)} y={22} textAnchor="middle" fontSize={8} fontWeight={700} fill="white">
              지금
            </text>
          </g>
        )}
      </svg>
      <p className="mt-1 text-center text-2xs text-[var(--muted-soft)]">
        출처: <code className="font-mono">lib/rules/constants-departure.ts:기한</code> — 예정신고 {기한.예정신고_출국전_일}일 전·보험청구 {기한.보험청구_출국전_일}일 전·지급 {기한.보험지급_출국후_일}일·보험 {기한.보험_소멸시효_년}년·연금 {기한.연금_소멸시효_년}년
      </p>
    </div>
  );
}

/**
 * ② 세 갈래 돈 흐름도 — 누가 냈고 누구에게 돌아오는가
 */
export function MoneyFlowDiagram() {
  const totSecond = 귀국비용보험_제1군.length + 1 + 귀국비용보험_제3군.length; // 2군은 나머지
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)] p-3">
      <svg viewBox="0 0 720 200" width="100%" height={200} role="img" aria-label="세 갈래 돈 흐름도">
        {/* 열 제목 */}
        <text x={110} y={18} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--muted)">
          누가 냈는가
        </text>
        <text x={360} y={18} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--muted)">
          무엇이 쌓였는가
        </text>
        <text x={600} y={18} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--muted)">
          출국 시 누구에게
        </text>

        {/* 왼쪽: 납입 주체 */}
        <g>
          <rect x={30} y={36} width={160} height={28} rx={8} fill="var(--surface)" stroke="var(--line)" />
          <text x={110} y={53} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ink)">
            사업주가 매월 납입
          </text>
          <text x={110} y={66} textAnchor="middle" fontSize={8} fill="var(--muted)">
            출국만기 {(출국만기보험_납입률 * 100).toFixed(1)}%
          </text>

          <rect x={30} y={80} width={160} height={28} rx={8} fill="var(--surface)" stroke="var(--line)" />
          <text x={110} y={97} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ink)">
            본인이 입국 3개월 내
          </text>
          <text x={110} y={110} textAnchor="middle" fontSize={8} fill="var(--muted)" textLength={140} lengthAdjust="spacingAndGlyphs">
            귀국비용 {귀국비용보험_금액.제1군.toLocaleString()}·{귀국비용보험_금액.제2군.toLocaleString()}·{귀국비용보험_금액.제3군.toLocaleString()}원
          </text>

          <rect x={30} y={124} width={160} height={28} rx={8} fill="var(--surface)" stroke="var(--line)" />
          <text x={110} y={141} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ink)">
            본인+사업주 매년
          </text>
          <text x={110} y={154} textAnchor="middle" fontSize={8} fill="var(--muted)">
            국민연금 총 {(국민연금_요율_연도별[2026] * 100).toFixed(1)}%→{(국민연금_요율_연도별[2033] * 100).toFixed(0)}%
          </text>
        </g>

        {/* 가운데: 쌓인 것 */}
        <g>
          <rect x={260} y={36} width={200} height={28} rx={8} fill="var(--panel)" stroke="var(--accent)" />
          <text x={360} y={53} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--ink)">
            출국만기보험
          </text>
          <text x={360} y={66} textAnchor="middle" fontSize={8} fill="var(--accent)">
            S2-1 · 사업주 부담
          </text>

          <rect x={260} y={80} width={200} height={28} rx={8} fill="var(--panel)" stroke="var(--accent)" />
          <text x={360} y={97} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--ink)">
            귀국비용보험
          </text>
          <text x={360} y={110} textAnchor="middle" fontSize={8} fill="var(--accent)">
            S2-2 · 본인 납입 ({귀국비용보험_제1군.length}/{totSecond - 귀국비용보험_제1군.length - 1}/1 국가군)
          </text>

          <rect x={260} y={124} width={200} height={28} rx={8} fill="var(--panel)" stroke="var(--accent)" />
          <text x={360} y={141} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--ink)">
            국민연금 반환일시금
          </text>
          <text x={360} y={154} textAnchor="middle" fontSize={8} fill="var(--accent)">
            S2-3 · 본인+사업주
          </text>
        </g>

        {/* 오른쪽: 돌아오는 곳 */}
        <g>
          <rect x={520} y={36} width={160} height={28} rx={8} fill="var(--accent-tint)" stroke="var(--accent)" />
          <text x={600} y={53} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--accent)">
            근로자에게
          </text>
          <rect x={520} y={80} width={160} height={28} rx={8} fill="var(--accent-tint)" stroke="var(--accent)" />
          <text x={600} y={97} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--accent)">
            본인에게
          </text>
          <rect x={520} y={124} width={160} height={28} rx={8} fill="var(--accent-tint)" stroke="var(--accent)" />
          <text x={600} y={141} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--accent)">
            근로자에게
          </text>
        </g>

        {/* 화살표 */}
        {[50, 94, 138].map((y) => (
          <g key={y}>
            <line x1={190} y1={y} x2={260} y2={y} stroke="var(--line-strong)" strokeWidth={1.2} markerEnd="url(#a1)" />
            <line x1={460} y1={y} x2={520} y2={y} stroke="var(--line-strong)" strokeWidth={1.2} markerEnd="url(#a1)" />
          </g>
        ))}
        <defs>
          <marker id="a1" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line-strong)" />
          </marker>
        </defs>
      </svg>
      <p className="mt-1 text-center text-2xs text-[var(--muted-soft)]">
        출처: <code className="font-mono">lib/rules/constants-departure.ts:귀국비용보험_금액·출국만기보험_납입률·국민연금_요율_연도별</code> — 금액 구간과 납입 주체는 상수에서, 룰 연결은 S2-1·S2-2·S2-3
      </p>
    </div>
  );
}

/**
 * ③ 국적 분기도 — 협정면제 → 적용제외(21) → 납부확인 순서
 */
export function NationalityBranchDiagram({ highlight }: { highlight?: string }) {
  const totalExcluded = 국민연금_사업장_적용제외국.length;
  const totalTreaty = 국민연금_협정면제_E9.length;
  const totalPaid = 국민연금_납부_확인국.length;
  const samples = (arr: readonly string[], n = 3) => arr.slice(0, n).join("·") + (arr.length > n ? " …" : "");

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)] p-3">
      <svg viewBox="0 0 720 200" width="100%" height={200} role="img" aria-label="국적이 분기를 타고 수령가능·불가·확인필요로 갈리는 그림">
        {/* 입력 */}
        <rect x={20} y={80} width={110} height={40} rx={12} fill="var(--surface)" stroke="var(--line)" />
        <text x={75} y={96} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ink)">
          국적
        </text>
        <text x={75} y={110} textAnchor="middle" fontSize={8} fill="var(--muted)">
          {highlight ?? "예: 베트남"}
        </text>

        {/* 분기 상자 3 */}
        <g>
          <rect
            x={170}
            y={20}
            width={160}
            height={36}
            rx={8}
            fill={totalTreaty ? "var(--accent-tint)" : "white"}
            stroke="var(--accent)"
          />
          <text x={250} y={36} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--ink)">
            협정면제 E-9
          </text>
          <text x={250} y={48} textAnchor="middle" fontSize={8} fill="var(--muted)">
            {totalTreaty}개국 · {samples(국민연금_협정면제_E9, 2)}
          </text>

          <rect x={170} y={76} width={160} height={36} rx={8} fill="white" stroke="var(--line)" />
          <text x={250} y={92} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ink)">
            적용제외국
          </text>
          <text x={250} y={104} textAnchor="middle" fontSize={8} fill="var(--muted)">
            {totalExcluded}개국 · {samples(국민연금_사업장_적용제외국, 3)}
          </text>

          <rect x={170} y={132} width={160} height={36} rx={8} fill="white" stroke="var(--line)" />
          <text x={250} y={148} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ink)">
            납부확인국
          </text>
          <text x={250} y={160} textAnchor="middle" fontSize={8} fill="var(--muted)">
            {totalPaid}개국 · {samples(국민연금_납부_확인국, 3)}
          </text>
        </g>

        {/* 결과 */}
        <g>
          <rect x={470} y={20} width={110} height={36} rx={8} fill="var(--surface)" stroke="var(--line)" />
          <text x={525} y={36} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ink)">
            수령불가
          </text>
          <text x={525} y={48} textAnchor="middle" fontSize={8} fill="var(--muted)">
            면제·제외
          </text>

          <rect x={470} y={76} width={110} height={36} rx={8} fill="var(--accent-tint)" stroke="var(--accent)" />
          <text x={525} y={92} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--accent)">
            확인필요
          </text>
          <text x={525} y={104} textAnchor="middle" fontSize={8} fill="var(--muted)">
            명단 밖 → 1355
          </text>

          <rect x={470} y={132} width={110} height={36} rx={8} fill="var(--accent-tint)" stroke="var(--accent)" />
          <text x={525} y={148} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--accent)">
            수령가능
          </text>
          <text x={525} y={160} textAnchor="middle" fontSize={8} fill="var(--muted)">
            납부확인
          </text>
        </g>

        {/* 선 */}
        <line x1={130} y1={100} x2={170} y2={38} stroke="var(--line-strong)" strokeWidth={1.2} />
        <line x1={130} y1={100} x2={170} y2={94} stroke="var(--line-strong)" strokeWidth={1.2} />
        <line x1={130} y1={100} x2={170} y2={150} stroke="var(--line-strong)" strokeWidth={1.2} />
        <line x1={330} y1={38} x2={470} y2={38} stroke="var(--line-strong)" strokeWidth={1.2} />
        <line x1={330} y1={94} x2={470} y2={38} stroke="var(--line-strong)" strokeWidth={1.2} />
        <line x1={330} y1={94} x2={470} y2={94} stroke="var(--line-strong)" strokeWidth={1.2} />
        <line x1={330} y1={150} x2={470} y2={150} stroke="var(--line-strong)" strokeWidth={1.2} />
      </svg>
      <p className="mt-1 text-center text-2xs leading-relaxed text-[var(--muted-soft)]">
        출처:{" "}
        <code className="font-mono">
          lib/rules/constants-departure.ts:국민연금_협정면제_E9({totalTreaty})·사업장_적용제외국({totalExcluded})·납부_확인국({totalPaid})
        </code>{" "}
        — 협정면제 → 적용제외 → 납부확인 순서로 훑고, 겹치면 <code className="font-mono">연금명단_교차검사()</code>가 CI를 멈춘다
        (700만원 오답 교정 각주)
      </p>
    </div>
  );
}

// 숫자 요약 스트립 — 실데이터에서 계산, 손으로 적지 않는다
export function SummaryStrip() {
  // 동적 import 대신 직접 상수 읽기 — 하드코딩 금지
  return null;
}
