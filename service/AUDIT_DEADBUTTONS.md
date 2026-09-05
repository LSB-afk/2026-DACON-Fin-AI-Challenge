# 죽은 버튼·빈 내용 전수 감사 (Playwright 실측)

> `app/_ui.tsx`·`app/_views.tsx`·`app/_tabs.tsx`·`app/page.tsx` 14개 뷰 전부를 1440px·390px 두 폭에서 실제로 열고 모든 button/링크를 눌러 확인. 표의 `파일:줄`은 감사 당시 위치.

| # | 뷰 | 의심 지점 (파일:줄) | 상태 | 처리 | 방법 (파일:줄) |
|---|---|---|---|---|---|
| 1 | 금융정착 Agent 하네스 | `app/_views.tsx:335` 「전체 자체검증 실행」 — 눌러도 피드백 없음 | 버튼은 동작하나 결과 표시 없음 | ② 피드백 부착 | `app/_views.tsx:326`에 `feedback` state + 토스트 `자체검증 실행됨 — 하네스 2종 점검` 추가 |
| 2 | 담당자/승인 권한 | `app/_views.tsx:1337` 승인 대기 카드 4건 — 클릭 불가, 비인터랙션 div | 내용 있음, 동작 없음 | ① 기능 부착 | `app/_views.tsx:1306` `ApprovalsView({onNavigate})`로 카드마다 `onClick → 해당 화면` 연결 (`standards-map`/`harness`/`agent-run`/`artifacts`), `hover:border/accent` + `해당 화면으로 이동 ▶` 안내 |
| 3 | 근거/조문 검색 | `app/_views.tsx:492` 판정 룰 테이블 행· `app/_views.tsx:510` 근거 카드 — 클릭 불가 | 결과만 나열, 상세 없음 | ① 기능 부착 | `app/_views.tsx:442` `SearchView`에 `selectedRule/Standard` state, 행/카드 `onClick` 토글, 선택 시 `bg-accent-tint` + 상세 안내 배너 |
| 4 | 감사 기록 | `app/_views.tsx:102` 실행 원장 행 — 클릭 불가, 해당 상담으로 이동 불가 | 표 형태, 네비 없음 | ① 기능 부착 | `app/_views.tsx:75` `AuditView({onSelectCase})` 행에 `cursor-pointer hover:bg-surface` + `title="클릭하면 해당 상담으로 이동"` + `onClick → selectCase + monitor 전환` (`app/page.tsx:545`에서 배선) |

| 5 | 실행 모니터 — 속성 패널 | `app/page.tsx:583` 상담 큐 하단 — 판정 실행 1개만, 에이전트 실행 구분 없음 | 기능은 있으나 구분 불명 | ① 기능 부착 | `app/_ui.tsx:448` `CaseQueue`에 두 번째 버튼 「에이전트 실행」 추가 (border-accent/tint, 전용 Icon `agent`), `app/page.tsx:598`에서 `onAgentRun → setView("agent-run")` |
| 6 | Agent 실행 화면 | `app/_agent.tsx` 전체 — 자유 발화·예시칩·기준일·타임라인·[이 값으로 판정 보기] 독립 뷰 없음 | 요구 뷰 자체가 없음 | ① 기능 부착 | `app/_agent.tsx` 신설 + `app/_ui.tsx:240` `ViewId agent-run` + `PATHS.agent` + `NAV_TOP` 항목, `app/page.tsx:542` 라우팅 |
| 7 | 내비 그룹·탭·타임라인 | `app/_ui.tsx:347` 그룹 제목, `app/_ui.tsx:156` 탭, `app/_tabs.tsx:113` 타임라인 — 아이콘 없음, 색만으로 상태 | 시각 위계 미약 | ② 피드백 부착 (아이콘) | `app/_ui.tsx:347` 그룹에 `Icon` (`book`/`harness`) + `mini` 때 `border-t-2 line-strong`, `app/_ui.tsx:156` 탭마다 `Icon` (`check`/`chip`/`book`/`harness`/`search`/`block`), `app/_tabs.tsx:31` `STATUS_ICON` + `ol border-2 line-strong` + 행별 `check/wait/disconnect/block` svg |
| 8 | 전 화면 타이포 | `app/globals.css:133` body `font-weight` 미지정(400) | 얇아서 안 읽힘 | ② 피드백 부착 | `app/globals.css:133` `font-weight:500`·사다리 800/700/600/500 (`h1.font-bold` 등 800 강제), 테이블머리 `border-bottom 2px line-strong` |

**실측 결과 (Playwright, 2026-08-28 16:00 KST, dev 서버 3000)**

- 1440px: 뷰 14개, 버튼 약 22~32개/뷰, dead 0
- 390px:  뷰 14개, 버튼 약 16~24개/뷰, dead 0
- 스크린샷: `service/screenshots/1440/*.png`·`service/screenshots/390/*.png`
- 감사 JSON: `service/screenshots/audit-1440.json`·`audit-390.json`

**판정:** 잔존 항목 0건 — ① 실제 동작 부착 5건 · ② 피드백 부착 3건 · ③ disabled 없음. 가짜 동작 금지 준수 (모델이 금액·날짜를 만들지 않는 경로는 건드리지 않았다).
