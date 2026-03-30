# KPDS Dashboard

`Design System V2` 진행 현황 대시보드를 Netlify로 배포하는 저장소다.

이 README는 다음 AI가 이 저장소만 열어도 바로 작업을 이어갈 수 있도록 작성했다.

## 현재 운영 정보

- GitHub repo: `Taehyeong-Jo/Netlify`
- 배포 브랜치: `main`
- 배포 URL: `https://calm-starburst-0215d5.netlify.app`
- 데이터 소스: Jira Cloud (`https://kurly0521.atlassian.net`)
- Confluence 삽입 대상 페이지:
  - `https://kurly0521.atlassian.net/wiki/spaces/DESSYS/pages/5773133029/iOS+KPDS+Dashboard`
- Confluence 삽입 방식:
  - 외부 배포 페이지를 `iframe`으로 임베드

## 이 저장소에서 중요한 파일

- `index.html`
  - 실제 배포 페이지
  - 브라우저에서 `/.netlify/functions/jira-dashboard`를 호출해 실시간 Jira 데이터를 렌더링
  - 배포본 UI 변경은 최종적으로 이 파일에 반영돼야 한다
- `iOS_KPDS_Dashboard_Graph_Template.html`
  - Playground 파일
  - 레이아웃/스타일 실험은 먼저 여기서 한다
  - 이 파일은 mock 데이터 기반 시안용이다
  - 이 파일을 그대로 `index.html`로 덮어쓰면 Jira 실시간 연동이 사라진다
- `netlify/functions/jira-dashboard.js`
  - Jira REST API를 호출해서 대시보드 JSON을 반환하는 Netlify Function
- `netlify.toml`
  - publish root와 functions directory 설정
- `_headers`
  - Confluence `iframe` 임베드를 위한 `Content-Security-Policy` 설정

## UI 수정 원칙

1. 먼저 `iOS_KPDS_Dashboard_Graph_Template.html`에서 레이아웃을 수정한다.
2. 확인이 끝나면 `index.html`에 레이아웃만 병합한다.
3. `index.html`의 Jira fetch 로직과 DOM id는 유지한다.
4. Playground 파일을 `index.html`로 통째로 복사하지 않는다.

실제로 유지해야 하는 핵심 동작:

- `/.netlify/functions/jira-dashboard` 호출
- `loadDashboard()`
- `renderSummary(payload)`
- `renderBars(payload.modules)`
- `renderModules(payload.modules)`

## 현재 대시보드 데이터 구조

상위 Epic:

- `KMA-6396`

모듈과 parent 티켓:

- `검색 (Search)` -> `KMA-6417`
- `Recommendation` -> `KMA-6566`
- `List` -> `KMA-6670`
- `Product List` -> `KMA-6706`
- `Detail (상품 상세)` -> `KMA-6760`
- `AI Guide` -> `KMA-7031`

child 조회 방식:

- JQL: `parent IN (KMA-6417, KMA-6566, KMA-6670, KMA-6706, KMA-6760, KMA-7031)`

parent 조회 방식:

- JQL: `key IN (KMA-6396, KMA-6417, KMA-6566, KMA-6670, KMA-6706, KMA-6760, KMA-7031)`

## Jira 상태 매핑

현재 workflow 기준 상태와 진행률 가중치는 아래와 같다.

- `해야 할 일` / `To Do` -> `todo` -> `0`
- `진행 중` / `In Progress` -> `progress` -> `45`
- `REVIEW` -> `review` -> `70`
- `QA` -> `qa` -> `90`
- `DONE` / Jira `Done` category -> `done` -> `100`
- `blocked`, `차단`, `blocker` -> `blocked` -> `15`

주의:

- 모듈 진행률은 `done / total`이 아니라 child 진행률의 평균값이다.
- 그래서 `REVIEW`, `QA`가 있으면 모듈 퍼센트가 부분 반영된다.
- `해야 할 일`은 반드시 `0%`로 보이도록 맞춰져 있다.

## 정렬 규칙

child 티켓 정렬 순서:

1. `blocked`
2. `progress`
3. `review`
4. `qa`
5. `todo`
6. `done`

동일 상태 안에서는 Jira 번호 오름차순이다.

## 배포 방식

- Netlify는 `main` 브랜치 push 시 자동 배포된다
- 이 사이트는 production deploy 1회마다 크레딧을 사용하므로 불필요한 push를 줄이는 편이 좋다

실제 배포 절차:

1. Playground 파일에서 UI 조정
2. `index.html`에 레이아웃 병합
3. 로컬 diff 확인
4. `main`에 commit/push
5. 배포 URL 확인

## 환경변수

Netlify 사이트에 아래 환경변수가 있어야 한다.

- `JIRA_EMAIL`
- `JIRA_TOKEN`
- `ATLASSIAN_BASE_URL`
- `CONFLUENCE_PAGE_ID`
- `CONFLUENCE_SYNC_TOKEN`

기본값:

- `ATLASSIAN_BASE_URL` 기본값은 `https://kurly0521.atlassian.net`
- `CONFLUENCE_PAGE_ID` 기본값은 `5773133029`

중요:

- 비밀값은 repo에 저장하지 않는다
- `netlify.toml`에 secret을 넣지 않는다
- Netlify UI의 Environment variables에 설정한다

## Confluence 텍스트 동기화

Confluence 본문에 적어둔 하드코딩 텍스트를 Jira 상태와 맞추려면 아래 Netlify Function을 사용한다.

- `/.netlify/functions/sync-confluence`

동작 방식:

- `jira-dashboard`와 같은 Jira 집계를 사용한다
- Confluence page storage body를 읽는다
- `상세` 아래 각 `expand` 섹션을 티켓 기준으로 찾는다
- 각 섹션에서 `상태`, `진행률`, `범위` 값 텍스트만 바꾼다
- status macro, font, color, layout, iframe 매크로는 그대로 유지한다
- 기본은 `dry-run`
- 실제 반영은 `apply=1`

현재 대상 page는 `5773133029` 이고, 아래 6개 expand 섹션을 갱신한다.

- `검색 (Search) KMA-6417`
- `Recommendation KMA-6566`
- `List KMA-6670`
- `Product List KMA-6706`
- `Detail (상품 상세) KMA-6760`
- `AI Guide KMA-7031`

호출 예시:

```bash
curl -sS https://calm-starburst-0215d5.netlify.app/.netlify/functions/sync-confluence | jq
```

실제 반영 예시:

```bash
curl -sS -X POST \
  "https://calm-starburst-0215d5.netlify.app/.netlify/functions/sync-confluence?apply=1" | jq
```

주의:

- page structure가 크게 바뀌면 티켓 섹션 탐색이 실패할 수 있다
- 이 방식은 값 텍스트만 바꾸므로 기존 font, color, layout은 유지된다
- `graph.html`은 로드될 때 background sync를 한 번 시도한다

## iframe / Confluence 관련 설정

Confluence에서 이 페이지를 임베드하기 위해 `_headers`에 아래 정책이 들어가 있다.

- `Content-Security-Policy: frame-ancestors 'self' https://kurly0521.atlassian.net https://*.atlassian.net`

이 헤더를 지우면 Confluence `iframe` 임베드가 깨질 수 있다.

## 검증 방법

배포 페이지 확인:

```bash
curl -sS https://calm-starburst-0215d5.netlify.app | head
```

함수 응답 확인:

```bash
curl -sS https://calm-starburst-0215d5.netlify.app/.netlify/functions/jira-dashboard | jq
```

확인 포인트:

- `epic.ticket`가 `KMA-6396`인지
- `summary.moduleCount`가 `6`인지
- `modules[].progress`가 Jira 상태에 맞게 계산되는지

## 현재 UI 상태

현재 배포본 UI는 다음 규칙을 따른다.

- 상단 제목: `Design System V2`
- 상단 stat: `Task`, `Epic 상태`, `티켓`
- 우측 패널: 모듈별 가로 진행 바
- 모듈 상세: `details/summary` 기반 expand
- 요약 카드 없음
- 펼치면 child 티켓 리스트만 보임
- child 리스트는 내부 스크롤
- chevron은 원형 버튼 스타일

## 자주 실수하는 지점

- Playground 파일을 통째로 `index.html`에 복사하는 실수
- Jira 상태 매핑을 바꿨는데 Playground와 Function을 같이 안 맞추는 실수
- `Task / 티켓 / Epic 상태` 같은 상단 라벨을 다시 옛 버전으로 되돌리는 실수
- `_headers`를 건드려 Confluence iframe이 깨지는 실수
- 불필요한 push로 Netlify deploy credit를 소모하는 실수

## 다음 AI에게 바로 필요한 판단 기준

- 레이아웃만 바꾸는 작업이면:
  - Playground 수정 -> `index.html` 병합
- Jira 데이터 계산이 이상하면:
  - `netlify/functions/jira-dashboard.js` 확인
- Confluence에서 안 보이면:
  - `_headers`의 `frame-ancestors`와 Netlify 라이브 URL 확인
- 진행률 숫자가 기대와 다르면:
  - Jira workflow 상태명과 `classifyStatus()` / `CHILD_PROGRESS` 매핑 먼저 확인
