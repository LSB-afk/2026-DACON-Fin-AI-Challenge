import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 배지를 끈다. 한때 좌하단 카드를 가려 우하단으로 옮겼는데,
  // 이제 그 자리에 페이전트(동행 캐릭터)가 상주하면서 배지가 클릭을 가로챘다 —
  // "캐릭터가 안 눌린다"는 버그의 실제 원인이 이 배지였다. 프로덕션엔 원래 없다.
  devIndicators: false,
};

export default nextConfig;
