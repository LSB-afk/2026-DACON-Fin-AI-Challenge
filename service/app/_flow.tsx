"use client";

import { useNarrow } from "./_ui";

import { FLOW, type FlowView, type FlowTab } from "@/lib/flow";

/**
 * 흐름 다이어그램 — 코드로 그린 SVG.
 * 외부 이미지·아이콘 라이브러리 금지, 토큰(var(--*))으로만 칠한다.
 * 흐름 단일 출처 lib/flow.ts만 읽는다 — 손으로 박은 사실이 없다.
 */

type Nav = (view: FlowView, tab?: FlowTab) => void;

const ACTOR_STYLE = {
  코드: { fill: "var(--panel)", stroke: "var(--line)", dash: "", rx: 8 },
  모델: { fill: "var(--accent-tint)", stroke: "var(--accent)", dash: "6 4", rx: 8 },
  사람: { fill: "var(--surface)", stroke: "var(--line)", dash: "", rx: 18 },
} as const;


export function FlowDiagram({ onNavigate }: { onNavigate?: Nav }) {
  const narrow = useNarrow(900);
  // 레이아웃 결정치 — 시각 값은 손으로 정해도 된다
  const W = narrow ? 360 : 980;
  const H = narrow ? 780 : 200;
  const boxW = narrow ? 300 : 110;
  const boxH = 56;
  const gap = narrow ? 18 : 12;
  const padY = narrow ? 20 : 60;

  // 결정적 배치 — 같은 FLOW면 같은 좌표
  const positions = FLOW.map((_, i) => {
    if (narrow) {
      const x = (W - boxW) / 2;
      const y = padY + i * (boxH + gap);
      return { x, y };
    } else {
      const total = FLOW.length * boxW + (FLOW.length - 1) * gap;
      const startX = (W - total) / 2;
      const x = startX + i * (boxW + gap);
      const y = padY;
      return { x, y };
    }
  });

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)] p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label="제품이 도는 순서: 상담 입력부터 3단 번역까지 8단계 흐름"
        style={{ display: "block" }}
      >
        {/* 모델 금지구역 — 2단 판정(id judge) 강조 */}
        {(() => {
          const idx = FLOW.findIndex((s) => s.id === "judge");
          if (idx === -1) return null;
          const p = positions[idx];
          return (
            <g key="forbidden">
              <rect
                x={p.x - 6}
                y={p.y - 14}
                width={boxW + 12}
                height={boxH + 28}
                rx={10}
                fill="none"
                stroke="var(--bad)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              <text
                x={p.x + boxW / 2}
                y={p.y - 18}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill="var(--bad)"
              >
                모델 금지구역
              </text>
            </g>
          );
        })()}

        {/* 연결선 — 완료를 따라 차오르는 선은 모션에서 width를 애니메이션하지만 여기선 정적 */}
        {FLOW.map((_, i) => {
          if (i === FLOW.length - 1) return null;
          const a = positions[i];
          const b = positions[i + 1];
          if (narrow) {
            const x = a.x + boxW / 2;
            const y1 = a.y + boxH;
            const y2 = b.y;
            return (
              <line
                key={`l-${i}`}
                x1={x}
                y1={y1}
                x2={x}
                y2={y2}
                stroke="var(--line-strong)"
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
              />
            );
          } else {
            const x1 = a.x + boxW;
            const x2 = b.x;
            const y = a.y + boxH / 2;
            return (
              <line
                key={`l-${i}`}
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke="var(--line-strong)"
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
              />
            );
          }
        })}

        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line-strong)" />
          </marker>
        </defs>

        {/* 단계 상자 */}
        {FLOW.map((step, i) => {
          const p = positions[i];
          const st = ACTOR_STYLE[step.행위자];
          const isModel = step.행위자 === "모델";
          return (
            <g
              key={step.id}
              onClick={() => onNavigate?.(step.보는곳.view, step.보는곳.tab)}
              style={{ cursor: onNavigate ? "pointer" : "default" }}
              role={onNavigate ? "button" : undefined}
              tabIndex={onNavigate ? 0 : undefined}
              aria-label={`${step.이름} — ${step.보는곳.라벨}로 이동`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onNavigate?.(step.보는곳.view, step.보는곳.tab);
                }
              }}
            >
              <rect
                x={p.x}
                y={p.y}
                width={boxW}
                height={boxH}
                rx={st.rx}
                fill={st.fill}
                stroke={st.stroke}
                strokeWidth={1.5}
                strokeDasharray={st.dash}
              />
              {/* 이름 — 길면 압축해 박스 안에 깔끔히 */}
              <text
                x={p.x + boxW / 2}
                y={p.y + 18}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="var(--ink)"
                textLength={boxW - 14}
                lengthAdjust="spacingAndGlyphs"
              >
                {step.이름}
              </text>
              <text
                x={p.x + boxW / 2}
                y={p.y + 32}
                textAnchor="middle"
                fontSize={9}
                fill="var(--muted)"
                textLength={narrow ? 280 : 100}
                lengthAdjust="spacingAndGlyphs"
              >
                {step.하는일.slice(0, narrow ? 24 : 16)}
                {step.하는일.length > (narrow ? 24 : 16) ? "…" : ""}
              </text>
              {/* 보는 곳 배지 */}
              <g>
                <rect
                  x={p.x + boxW / 2 - 46}
                  y={p.y + 38}
                  width={92}
                  height={14}
                  rx={7}
                  fill="var(--accent)"
                />
                <text
                  x={p.x + boxW / 2}
                  y={p.y + 47.5}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={600}
                  fill="white"
                  textLength={86}
                  lengthAdjust="spacingAndGlyphs"
                >
                  {step.보는곳.라벨.slice(0, 12)}
                </text>
              </g>
              {/* 모델 계약 배지 */}
              {isModel && (
                <g>
                  <rect x={p.x + boxW - 28} y={p.y - 6} width={32} height={12} rx={6} fill="var(--accent)" />
                  <text x={p.x + boxW - 12} y={p.y + 2} textAnchor="middle" fontSize={7} fontWeight={700} fill="white">
                    계약
                  </text>
                </g>
              )}
              {/* 행위자 라벨 */}
              <text x={p.x + 6} y={p.y + 10} fontSize={7} fontWeight={600} fill="var(--muted-soft)">
                {step.행위자}
              </text>
            </g>
          );
        })}

        {/* 범례 */}
        <g transform={`translate(${narrow ? 12 : W - 300}, ${narrow ? H - 36 : H - 22})`}>
          <rect x={0} y={0} width={12} height={12} rx={3} fill="var(--panel)" stroke="var(--line)" strokeWidth={1.2} />
          <text x={16} y={9} fontSize={8} fill="var(--muted)">
            코드 실선
          </text>
          <rect x={70} y={0} width={12} height={12} rx={3} fill="var(--accent-tint)" stroke="var(--accent)" strokeWidth={1.2} strokeDasharray="4 2" />
          <text x={86} y={9} fontSize={8} fill="var(--muted)">
            모델 점선+계약
          </text>
          <rect x={160} y={0} width={12} height={12} rx={6} fill="var(--surface)" stroke="var(--line)" strokeWidth={1.2} />
          <text x={176} y={9} fontSize={8} fill="var(--muted)">
            사람 둥근
          </text>
        </g>
      </svg>
      <p className="mt-1 text-center text-2xs text-[var(--muted-soft)]">
        출처: <code className="font-mono">lib/flow.ts</code> · 단계를 누르면 해당 화면으로 이동합니다. 점선은 AI가 손대지 않는 단계입니다.
      </p>
    </div>
  );
}
