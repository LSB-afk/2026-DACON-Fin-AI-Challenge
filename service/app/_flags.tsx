/**
 * 국기 — 인라인 SVG, 의존성 없음.
 *
 * 왜 이모지가 아닌가: Windows 는 국기 이모지 글리프가 없어 "KR" 같은 글자 두 개로 그린다.
 * 심사 환경(Windows 노트북)에서 국기가 안 보이면 언어 선택이 초라해진다.
 * 왜 패키지가 아닌가: 의존성 하나가 늘면 9/7~9/11 무중단 구간에 깨질 것이 하나 는다.
 *
 * 그림은 3:2 비율(60×40)의 **단순화**다 — 문장(紋章)·사자·글자 같은 세밀한 요소는
 * 색면과 대표 도형으로 대신한다. 식별이 목적이지 공식 표준 재현이 아니다.
 * 가장 단순화된 것: 스리랑카(사자 생략), 타지키스탄(왕관 약식), 몽골(소욤보 약식),
 * 캄보디아(앙코르와트 약식), 한국(괘 약식).
 */

export type FlagCode =
  | "KR" | "US" | "VN" | "CN" | "TH" | "ID" | "NP" | "KH" | "MM" | "UZ"
  | "PH" | "MN" | "BD" | "LK" | "PK" | "KG" | "LA" | "TJ" | "RU" | "JP";

/** 별 — 중심 (cx,cy), 바깥 반지름 r. 오각별 다각형 좌표 */
function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.382;
    pts.push(`${(cx + rr * Math.cos(rad)).toFixed(2)},${(cy + rr * Math.sin(rad)).toFixed(2)}`);
  }
  return pts.join(" ");
}

const 가로삼분 = (a: string, b: string, c: string) => (
  <>
    <rect width="60" height="40" fill={a} />
    <rect y="13.33" width="60" height="13.34" fill={b} />
    <rect y="26.67" width="60" height="13.33" fill={c} />
  </>
);

const FLAGS: Record<FlagCode, React.ReactNode> = {
  KR: (
    <>
      <rect width="60" height="40" fill="#fff" />
      <circle cx="30" cy="20" r="10" fill="#CD2E3A" />
      <path d="M20 20a10 10 0 0 0 20 0a5 5 0 0 0-10 0a5 5 0 0 1-10 0z" fill="#0047A0" />
      <g fill="#000">
        <rect x="5" y="4" width="9" height="1.6" transform="rotate(-33 9.5 5)" />
        <rect x="5" y="7.5" width="9" height="1.6" transform="rotate(-33 9.5 8.3)" />
        <rect x="5" y="11" width="9" height="1.6" transform="rotate(-33 9.5 11.8)" />
        <rect x="46" y="4" width="9" height="1.6" transform="rotate(33 50.5 5)" />
        <rect x="46" y="7.5" width="9" height="1.6" transform="rotate(33 50.5 8.3)" />
        <rect x="46" y="11" width="9" height="1.6" transform="rotate(33 50.5 11.8)" />
        <rect x="5" y="27" width="9" height="1.6" transform="rotate(33 9.5 27.8)" />
        <rect x="5" y="30.5" width="9" height="1.6" transform="rotate(33 9.5 31.3)" />
        <rect x="5" y="34" width="9" height="1.6" transform="rotate(33 9.5 34.8)" />
        <rect x="46" y="27" width="9" height="1.6" transform="rotate(-33 50.5 27.8)" />
        <rect x="46" y="30.5" width="9" height="1.6" transform="rotate(-33 50.5 31.3)" />
        <rect x="46" y="34" width="9" height="1.6" transform="rotate(-33 50.5 34.8)" />
      </g>
    </>
  ),
  US: (
    <>
      <rect width="60" height="40" fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={(i * 40) / 13} width="60" height={40 / 13} fill="#B22234" />
      ))}
      <rect width="24" height={(7 * 40) / 13} fill="#3C3B6E" />
      {[3, 9, 15, 21].map((x) => [3, 8, 13, 18].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.9" fill="#fff" />))}
    </>
  ),
  VN: (
    <>
      <rect width="60" height="40" fill="#DA251D" />
      <polygon points={star(30, 20, 12)} fill="#FFFF00" />
    </>
  ),
  CN: (
    <>
      <rect width="60" height="40" fill="#DE2910" />
      <polygon points={star(10, 10, 6)} fill="#FFDE00" />
      <polygon points={star(20, 4, 2)} fill="#FFDE00" />
      <polygon points={star(24, 8, 2)} fill="#FFDE00" />
      <polygon points={star(24, 13, 2)} fill="#FFDE00" />
      <polygon points={star(20, 17, 2)} fill="#FFDE00" />
    </>
  ),
  TH: (
    <>
      <rect width="60" height="40" fill="#A51931" />
      <rect y="6.67" width="60" height="26.67" fill="#F4F5F8" />
      <rect y="13.33" width="60" height="13.33" fill="#2D2A4A" />
    </>
  ),
  ID: (
    <>
      <rect width="60" height="40" fill="#fff" />
      <rect width="60" height="20" fill="#CE1126" />
    </>
  ),
  NP: (
    <>
      <rect width="60" height="40" fill="#fff" />
      <path d="M12 2L42 15H24L46 38H12Z" fill="#DC143C" stroke="#003893" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="22" cy="28" r="5" fill="#fff" />
      <path d="M17 12a5.5 5.5 0 0 0 11 0a4.5 4.5 0 0 1-11 0z" fill="#fff" />
    </>
  ),
  KH: (
    <>
      <rect width="60" height="40" fill="#032EA1" />
      <rect y="10" width="60" height="20" fill="#E00025" />
      <g fill="#fff">
        <rect x="22" y="19" width="16" height="7" />
        <rect x="25" y="15" width="10" height="5" />
        <rect x="28.5" y="12" width="3" height="4" />
        <rect x="24" y="13" width="2" height="3" />
        <rect x="34" y="13" width="2" height="3" />
      </g>
    </>
  ),
  MM: (
    <>
      {가로삼분("#FECB00", "#34B233", "#EA2839")}
      <polygon points={star(30, 20, 14)} fill="#fff" />
    </>
  ),
  UZ: (
    <>
      {가로삼분("#0099B5", "#fff", "#1EB53A")}
      <rect y="13" width="60" height="1" fill="#CE1126" />
      <rect y="26" width="60" height="1" fill="#CE1126" />
      <circle cx="10" cy="6.7" r="4.4" fill="#fff" />
      <circle cx="11.8" cy="6.7" r="3.6" fill="#0099B5" />
      {[19, 24, 29].map((x) => <circle key={x} cx={x} cy="4" r="0.9" fill="#fff" />)}
      {[19, 24, 29].map((x) => <circle key={`b${x}`} cx={x} cy="9" r="0.9" fill="#fff" />)}
    </>
  ),
  PH: (
    <>
      <rect width="60" height="40" fill="#CE1126" />
      <rect width="60" height="20" fill="#0038A8" />
      <polygon points="0,0 26,20 0,40" fill="#fff" />
      <circle cx="9" cy="20" r="4.5" fill="#FCD116" />
    </>
  ),
  MN: (
    <>
      <rect width="60" height="40" fill="#C4272F" />
      <rect x="20" width="20" height="40" fill="#015197" />
      <g fill="#F9CF02">
        <circle cx="10" cy="14" r="2.6" />
        <rect x="6" y="18" width="8" height="2" />
        <rect x="4.5" y="21" width="11" height="9" />
        <rect x="6" y="31" width="8" height="2" />
      </g>
      <rect x="8" y="23" width="4" height="5" fill="#C4272F" />
    </>
  ),
  BD: (
    <>
      <rect width="60" height="40" fill="#006A4E" />
      <circle cx="27" cy="20" r="12" fill="#F42A41" />
    </>
  ),
  LK: (
    <>
      <rect width="60" height="40" fill="#FFBE29" />
      <rect x="3" y="3" width="8" height="34" fill="#009E60" />
      <rect x="11" y="3" width="8" height="34" fill="#FF7A00" />
      <rect x="22" y="3" width="35" height="34" fill="#8D153A" />
      {[[25, 6], [51, 6], [25, 31], [51, 31]].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" fill="#FFBE29" />
      ))}
    </>
  ),
  PK: (
    <>
      <rect width="60" height="40" fill="#01411C" />
      <rect width="15" height="40" fill="#fff" />
      <circle cx="37" cy="20" r="10" fill="#fff" />
      <circle cx="40" cy="18" r="9" fill="#01411C" />
      <polygon points={star(44, 13, 3.5)} fill="#fff" />
    </>
  ),
  KG: (
    <>
      <rect width="60" height="40" fill="#E8112D" />
      <circle cx="30" cy="20" r="11" fill="#FFEF00" />
      <circle cx="30" cy="20" r="7" fill="#E8112D" />
      <circle cx="30" cy="20" r="5.5" fill="#FFEF00" />
      <path d="M25 17q5 4 10 0M25 20q5 4 10 0M25 23q5 4 10 0" stroke="#E8112D" strokeWidth="1" fill="none" />
    </>
  ),
  LA: (
    <>
      <rect width="60" height="40" fill="#CE1126" />
      <rect y="10" width="60" height="20" fill="#002868" />
      <circle cx="30" cy="20" r="7.5" fill="#fff" />
    </>
  ),
  TJ: (
    <>
      <rect width="60" height="40" fill="#006600" />
      <rect width="60" height="28.6" fill="#fff" />
      <rect width="60" height="11.4" fill="#CC0000" />
      <g fill="#F8C300">
        <rect x="24" y="17" width="12" height="4" />
        <rect x="26" y="14" width="2" height="3" />
        <rect x="29" y="13" width="2" height="4" />
        <rect x="32" y="14" width="2" height="3" />
        {[21, 24.5, 28, 32, 35.5, 39].map((x) => <circle key={x} cx={x} cy="24" r="0.9" />)}
      </g>
    </>
  ),
  RU: 가로삼분("#fff", "#0039A6", "#D52B1E"),
  JP: (
    <>
      <rect width="60" height="40" fill="#fff" />
      <circle cx="30" cy="20" r="12" fill="#BC002D" />
    </>
  ),
};

export function Flag({ code, className = "h-6 w-9" }: { code: FlagCode; className?: string }) {
  return (
    <svg viewBox="0 0 60 40" className={`shrink-0 overflow-hidden rounded-[3px] border border-black/10 ${className}`} aria-hidden>
      {FLAGS[code]}
    </svg>
  );
}
