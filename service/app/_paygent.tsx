"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 페이전트 캐릭터 — 3D 무대 위의 결정적 시퀀스.
 *
 * Math.random / new Date 금지. 클릭 횟수 카운터로 고정 시퀀스를 순환한다
 * (n번째 클릭 = n % 동작수). transform만 사용(레이아웃 밀림 금지), 끝나면 idle 복귀.
 *
 * 층 구조(globals.css 주석과 짝):
 *   버튼(원근·히트박스) > 그림자(바닥에 남는다) + 틸트(마우스 따라 기욺) > body(동작) > img
 * 이미지는 흰 배경을 홍수채움으로 지운 투명 256px 사본(public/paygent-256.png)이다 —
 * "흰 상자가 움직이는" 문제의 근본 수정. image-rendering: pixelated 필수.
 */

/* medium — 콘솔 첫 진입 자기소개용. 소개가 끝나면 small 로 줄어든다 */
export type PaygentSize = "large" | "medium" | "small";
export type PaygentAction = "jump" | "slide" | "spin" | "shake" | "celebrate";

// 시퀀스 순서: 폴짝 → 슬라이드 → 턴테이블 스핀 → 흔들기 — celebrate는 외부 트리거
const SEQ: PaygentAction[] = ["jump", "slide", "spin", "shake"];

export function paygentNextAction(clickCount: number): PaygentAction {
  return SEQ[clickCount % SEQ.length];
}

const SIZE_PX: Record<PaygentSize, number> = { large: 160, medium: 104, small: 72 };

export function Paygent({
  size = "large",
  onAction,
  celebrateKey = 0,
  label = "페이전트 — 눌러보세요",
}: {
  size?: PaygentSize;
  onAction?: (action: PaygentAction, count: number) => void;
  celebrateKey?: number;
  label?: string;
}) {
  const [clickCount, setClickCount] = useState(0);
  const [action, setAction] = useState<PaygentAction | null>(null);
  // 마우스 틸트 — 포인터 위치의 순수 함수라 결정적이다
  const [tilt, setTilt] = useState<{ tx: number; ty: number }>({ tx: 0, ty: 0 });
  const timerRef = useRef<number | null>(null);
  const prevCelebrate = useRef(celebrateKey);
  const btnRef = useRef<HTMLButtonElement>(null);

  const px = SIZE_PX[size];

  function trigger(a: PaygentAction) {
    setAction(a);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const dur = a === "celebrate" ? 900 : a === "spin" ? 650 : a === "jump" ? 620 : 560;
    timerRef.current = window.setTimeout(() => setAction(null), dur);
  }

  // 축하 외부 트리거 — 같은 골로 두 번 축하하지 않음은 바깥에서 키로 관리
  useEffect(() => {
    if (celebrateKey !== prevCelebrate.current && celebrateKey !== 0) {
      prevCelebrate.current = celebrateKey;
      trigger("celebrate");
    }
  }, [celebrateKey]);

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  function onClick() {
    const next = paygentNextAction(clickCount);
    setClickCount((c) => c + 1);
    trigger(next);
    onAction?.(next, clickCount);
  }

  /* 데스크톱 hover 틸트 — 커서가 있는 쪽으로 살짝 기운다 (±10°) */
  function onPointerMove(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ tx: -ny * 20, ty: nx * 20 });
  }
  const resetTilt = () => setTilt({ tx: 0, ty: 0 });

  const bodyCls =
    action === "jump" ? "paygent-jump" :
    action === "slide" ? "paygent-slide" :
    action === "spin" ? "paygent-spin" :
    action === "shake" ? "paygent-shake" :
    action === "celebrate" ? "paygent-celebrate" :
    "paygent-idle";

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerLeave={resetTilt}
      aria-label={label}
      className="paygent-btn"
      style={{ ["--dur" as string]: "2.8s", width: px, height: px }}
    >
      <span aria-hidden className="paygent-shadow" />
      <span
        className="paygent-tilt"
        style={{ ["--tx" as string]: `${tilt.tx}deg`, ["--ty" as string]: `${tilt.ty}deg` }}
      >
        <span className={`paygent-body ${bodyCls}`}>
          {/* 픽셀 아트 — next/image 리샘플링·포맷 변환이 도트를 뭉갠다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/paygent-256.png"
            alt=""
            width={px}
            height={px}
            draggable={false}
            style={{ imageRendering: "pixelated", width: px, height: px, objectFit: "contain", display: "block" }}
          />
          {/* 축하 시 반짝 스팬 — 컨페티 없이 점 2개로 */}
          {action === "celebrate" && (
            <>
              <span aria-hidden className="paygent-spark paygent-spark--a">✦</span>
              <span aria-hidden className="paygent-spark paygent-spark--b">✦</span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}

// 입장 씬 폴짝 등장용 — 아래에서 위로
export function PaygentEnter({ children }: { children: React.ReactNode }) {
  return <div className="paygent-enter">{children}</div>;
}
