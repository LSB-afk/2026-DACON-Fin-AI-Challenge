#!/usr/bin/env bash
#
# 깨끗한 환경에서 처음부터 다시 세워 CI 를 돌린다.
#
# 왜 필요한가: 개발 머신에서 도는 것은 아무것도 증명하지 않는다. node_modules 에 남은
# 옛 패키지, 셸에 켜져 있는 환경변수, npm 캐시에 굳은 tarball — 셋 중 무엇이든 "내 컴퓨터에서는
# 됩니다" 를 만든다. 여기서 셋을 전부 끊는다.
#
# 이 스크립트가 막는 것과, 막지 못하면 벌어지는 일:
#   - package.json 에는 없는데 전역으로 깔려 있어서 돌던 도구 → 심사자 컴퓨터에서 CI 가 죽는다
#   - .env 나 셸 환경변수에 기대던 코드      → 키 없는 환경에서 빈 화면이 나온다
#   - lockfile 과 어긋난 node_modules        → 우리만 통과하는 테스트가 생긴다
#
# 알려진 한계:
#   - 설치가 268MB 라 몇 분 걸린다. 그래서 CI 의 매 커밋이 아니라 별도 잡으로 돌린다.
#   - 인터넷이 필요하다. 오프라인에서는 npm ci 단계에서 죽는데, 그건 이 스크립트의 고장이
#     아니라 재현 조건이 갖춰지지 않은 것이다.
#   - 지금 소스는 git 저장소에서 복사해 온다. 배포물(zip)을 검사하려면 아래 SRC 를 압축 푼
#     폴더로 바꿔라 — 그래야 "빠뜨린 파일" 까지 잡힌다. 지금 방식은 그건 못 잡는다.
#
# 쓰는 법: bash scripts/repro.sh
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/paycheck-repro"

echo "원천 : $SRC"
echo "작업터: $WORK"

rm -rf "$WORK"
mkdir -p "$WORK"

# git 이 아는 파일만 복사한다. node_modules · .next · .env 는 애초에 넘어오지 않는다 —
# 커밋되지 않은 파일에 기대고 있었다면 여기서 드러나야 한다.
git -C "$SRC" ls-files -z | while IFS= read -r -d '' f; do
  mkdir -p "$WORK/$(dirname "$f")"
  cp "$SRC/$f" "$WORK/$f"
done

cd "$WORK"

# 환경변수를 비운다. env -i 를 쓰지 않는 이유: PATH 까지 지우면 node 를 못 찾아
# "재현 실패" 가 아니라 "스크립트 고장" 이 된다. 앱이 읽을 만한 것만 골라 지운다.
# 새 환경변수를 코드에 넣었으면 이 목록에도 넣어라. 안 넣으면 이 검사는 그 변수를 못 본다.
CLEAN=(env -u ANTHROPIC_API_KEY -u OPENAI_API_KEY -u NODE_ENV -u NEXT_PUBLIC_API_BASE)

# npm 캐시도 갈아 끼운다. 공용 캐시를 쓰면 예전에 받아 둔 tarball 로 조용히 성공한다.
export npm_config_cache="$WORK/.npm-cache"

echo "== 클린 설치 (npm ci) =="
"${CLEAN[@]}" npm ci

echo "== CI 게이트 =="
"${CLEAN[@]}" npm run ci

echo "재현 통과 — $WORK"
