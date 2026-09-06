# 정산 영수증·PDF·AI 역할 조직도 검증

2026-09-06 작업. 기존 판정 규칙, API 제공자, JSON 형식은 변경하지 않았습니다.

## 변경 파일과 화면

- `lib/receipt.ts`, `lib/receipt.test.ts`: 현재 판정에서 화면과 PDF가 함께 읽는 불변 영수증 모델. 계산값·추정 범위·확인 필요 참고 금액을 분리하며, 0원과 금액 없음, 실행 전과 실행 후 빈 결과를 구분합니다.
- `app/_receipt.tsx`, `app/_receipt.module.css`, `app/_tabs.tsx`, `app/page.tsx`: 영수증형 항목과 금액 정렬, 접을 수 있는 근거, 상태별 문구·아이콘, 현재 수정한 입력 설명. 좁은 본문 폭에는 컨테이너 기반 배치를 적용했습니다.
- `lib/receiptPdf.ts`, `lib/receiptPdf.test.ts`, `app/_artifacts.tsx`, `app/_artifacts.module.css`, `app/_views.tsx`: 브라우저 안에서 한글 A4 PDF를 직접 내려받습니다. 공유 모델의 표시값을 사용하며, 글꼴 대기·오류·재시도·이전 화면의 비동기 작업 무효화를 처리합니다. JSON 복사와 파일 내려받기는 기존 문자열을 그대로 사용합니다.
- `lib/organization.ts`, `lib/organization.test.ts`, `app/_organization.tsx`, `app/_organization.module.css`: 실제 업무 13개와 판정 스킬 2개를 유지합니다. 접수 → 라우팅·추출 동시 요청 → 코드 판정 → 검증 → 한국어 답변 → 사람 승인·적용·기록을 여섯 주요 단계로 정리했습니다. 번역은 답변에서 갈라지는 선택 기능입니다.
- 루트 `DESIGN.md`: 이번 화면의 데이터·시각 설계 기준과 출처를 갱신했습니다.

## 검증 근거

- `npm run ci`: 558개 테스트 통과, 기준 사례 32개 통과, 가드레일 위반 0건, 공통 색상 대비 33개 통과, 스캔 오류 0건, 배포용 빌드 통과.
- 마지막 표시 수정 후 `npm run lint`, `npm run build` 재통과. 스캔의 기존 경고 1건은 Git에서 제외된 `.env.local` 존재 알림이며, 키 값을 읽거나 문서에 기록하지 않았습니다.
- 최종 배포용 빌드를 별도 로컬 서버에서 실행해 영수증·다운로드 검사 25개와 조직도 시나리오 11개를 재검증했습니다. 브라우저 런타임 오류와 실제 AI API 호출은 0건입니다.
- Chrome 실제 브라우저에서 1440×900 / 1920×1080 / 390×844 확인. JSON 다운로드를 화면 원문과 바이트 단위로 비교했고, 클립보드 내용도 일치했습니다. 판정 금액과 각 항목은 동일한 JSON에서 만든 모델과 대조했습니다.
- 실제 PDF 버튼 클릭으로 `.pdf` 파일을 내려받고 PDF 헤더와 실제 사례·기준일을 쓴 파일명을 확인했습니다. 글꼴 오류 안내·재시도, 생성 중 다른 화면으로 이동했을 때 늦은 다운로드가 실행되지 않는 동작을 검증했습니다.
- 빈 결과 / 명시적 0원 / 금액 없는 정상 결과 / 긴 한글 근거와 20개 항목 / 큰 금액 범위를 본문 폭 300·448·980px에서 확인했습니다. 실제 영수증 컴포넌트를 렌더링하고 근거를 모두 연 상태로 15개 조합에서 내용 넘침이 없음을 확인했습니다.
- 실제 영수증 2페이지, 빈 결과 1페이지, 0원 1페이지, 긴 제목·근거와 12개 항목 3페이지를 PyMuPDF로 열고 총 7페이지를 이미지로 렌더링해 직접 확인했습니다. 한글·원화 기호·합계·페이지 번호와 이어지는 항목이 잘리지 않았습니다.
- 기존 `scripts/verify-central-office.mjs`의 `TEST_FILTER=organization` 시나리오 11개 통과: 반응형, 필터, 스킬 이동, 실제 상태 초기화, 현재 결과 이동, 승인 연결, 미연결 상태.
- 독립 검토 에이전트가 코드·상태 경계를 검토한 뒤, 주 담당자가 브라우저 및 PDF를 별도로 검증했습니다. 모든 브라우저 AI 응답은 통제된 fixture 또는 미연결 응답이며 실제 유료 AI 요청을 호출하지 않았습니다.

이번 세션의 브라우저 검사 스크립트, JSON 보고서, 화면 캡처와 검증 PDF는 `/tmp/paycheck-receipt-qa.knKYPw/`에 있습니다. 이 경로는 임시 검증 자료이며 앱의 런타임 의존성이 아닙니다. 조직도 시나리오는 저장소의 기존 스크립트로 다시 실행할 수 있습니다.

```sh
BASE_URL=http://localhost:3001 BROWSER_CHANNEL=chrome TEST_FILTER=organization \
  node scripts/verify-central-office.mjs
```

## 참고한 원칙

- [GOV.UK 확인 페이지](https://design-system.service.gov.uk/patterns/confirmation-pages/): 결과와 식별 정보, 다음 행동을 먼저 안내합니다.
- [GOV.UK 요약 목록](https://design-system.service.gov.uk/components/summary-list/): 항목명과 값의 연결, 읽기 순서와 정보 위계를 영수증에 적용했습니다.
- [USWDS 단계 목록](https://designsystem.digital.gov/components/process-list/): 주요 단계를 압축하고 작은 화면에서도 순서를 유지했습니다.
- [W3C PROV-O](https://www.w3.org/TR/prov-o/): 주체·처리·산출물을 구분해 AI, 규칙 코드, 사람의 책임을 혼동하지 않도록 했습니다.
- [OpenAI 최신 모델 가이드](https://developers.openai.com/api/docs/guides/latest-model): 명확한 역할 분담과 범위에 맞는 검증 원칙을 작업 운영에 적용했습니다. 리서치는 Sol/중간 추론, 구현은 Terra/높은 추론, 독립 검토는 Astra/높은 추론으로 분리했습니다. 운영 중인 AI 제공자나 모델을 바꾸라는 요청으로 해석하지 않았습니다.

## 제한과 배포 경계

- PDF는 외부 업로드나 새로운 런타임 라이브러리 없이 만드는 고해상도 이미지형 문서입니다. 한글 외형은 보존하지만 PDF 안의 글자 선택·검색 및 태그 기반 접근성은 제공하지 않습니다. 이 제한을 다운로드 화면에도 알리며, 접근 가능한 HTML 영수증과 JSON 원본을 유지합니다.
- PDF에 새 발급 시각이나 지급 확정 사실을 만들지 않습니다. 기준일·사례 ID·실행 ID는 현재 데이터에서 제공하는 값만 사용합니다.
- 브라우저 동작 검증은 Chrome 기준입니다. 모든 브라우저·모바일 기기나 실제 AI 제공자의 응답을 검증했다는 뜻은 아닙니다.
- 위 결과는 UI의 로컬 구현·검증 기록입니다. GitHub 반영과 Render 운영 배포 성공 여부는 별도로 확인하며, 수동 릴리스 절차는 `docs/superpowers/plans/2026-09-06-receipt-manual-release.md`를 따릅니다. 사용자 제출 초안 폴더와 기존 개발 서버는 보존합니다.
