# KPDS Dashboard

`Design System V2` 진행 현황 대시보드를 GitHub Pages로 배포하는 저장소다.

이 README는 다음 AI가 이 저장소만 열어도 바로 작업을 이어갈 수 있도록 작성했다.

## 현재 운영 정보

- GitHub repo: `Choi-Min-Kyu/iOS-KPDS-Dashboard`
- 배포 브랜치: `main`
- 배포 URL: `https://choi-min-kyu.github.io/iOS-KPDS-Dashboard/`
- 데이터 소스: Jira Cloud (환경변수 `ATLASSIAN_BASE_URL`로 설정)
- 데이터 갱신: GitHub Actions가 5분마다 Jira 데이터를 `data/dashboard.json`으로 생성
- Confluence 동기화: GitHub Actions가 5분마다 자동 동기화

## 아키텍처

```
GitHub Actions (5분 크론)
  ├── scripts/generate-data.js → Jira API 호출 → data/dashboard.json 커밋
  └── scripts/sync-confluence.js → Confluence 페이지 자동 업데이트

GitHub Pages (정적 호스팅)
  ├── index.html → data/dashboard.json 읽어서 대시보드 렌더링
  ├── graph/index.html → data/dashboard.json 읽어서 그래프 렌더링 (Confluence iframe용)
  └── Playground.html → 샘플 그래프
```

## 이 저장소에서 중요한 파일

- `index.html`
  - 실제 배포 페이지
  - `data/dashboard.json`을 읽어 실시간 Jira 데이터를 렌더링
  - 배포본 UI 변경은 최종적으로 이 파일에 반영돼야 한다
- `graph/index.html`
  - Confluence iframe 임베딩용 그래프 페이지
  - `/graph` URL로 접근 가능
- `iOS_KPDS_Dashboard_Graph_Template_Origin.html`
  - Playground 파일
  - 레이아웃/스타일 실험은 먼저 여기서 한다
  - 이 파일은 mock 데이터 기반 시안용이다
- `scripts/lib/kpds-data.js`
  - Jira REST API를 호출해서 대시보드 데이터를 생성하는 공유 모듈
- `scripts/generate-data.js`
  - `kpds-data.js`를 호출하여 `data/dashboard.json` 파일 생성
- `scripts/sync-confluence.js`
  - Confluence 페이지의 모듈별 상태/진행률/범위를 Jira 데이터와 동기화
- `.github/workflows/update-dashboard.yml`
  - 5분마다 실행되는 크론 워크플로우

## UI 수정 원칙

1. 먼저 `iOS_KPDS_Dashboard_Graph_Template_Origin.html`에서 레이아웃을 수정한다.
2. 확인이 끝나면 `index.html`에 레이아웃만 병합한다.
3. `index.html`의 fetch 로직과 DOM id는 유지한다.
4. Playground 파일을 `index.html`로 통째로 복사하지 않는다.

실제로 유지해야 하는 핵심 동작:

- `data/dashboard.json` 읽기
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

- GitHub Pages는 `main` 브랜치 push 시 자동 배포된다
- GitHub Actions가 5분마다 `data/dashboard.json`을 갱신하여 자동 커밋/push
- 데이터 변경이 있을 때만 커밋이 생성됨

실제 배포 절차:

1. Playground 파일에서 UI 조정
2. `index.html`에 레이아웃 병합
3. 로컬 diff 확인
4. `main`에 commit/push
5. 배포 URL 확인

## 환경변수 (GitHub Secrets)

GitHub repository Secrets에 아래 값이 설정되어야 한다.

- `JIRA_EMAIL`
- `JIRA_TOKEN`
- `ATLASSIAN_BASE_URL`
- `CONFLUENCE_PAGE_ID`

중요:

- 비밀값은 repo에 저장하지 않는다
- GitHub Secrets에서만 관리한다

## Confluence 텍스트 동기화

GitHub Actions가 5분마다 자동으로 Confluence 페이지를 Jira 상태와 동기화한다.

동작 방식:

- `jira-dashboard`와 같은 Jira 집계를 사용한다
- Confluence page storage body를 읽는다
- `상세` 아래 각 `expand` 섹션을 티켓 기준으로 찾는다
- 각 섹션에서 `상태`, `진행률`, `범위` 값 텍스트만 바꾼다
- status macro, font, color, layout, iframe 매크로는 그대로 유지한다

수동 실행:

```bash
# GitHub Actions workflow를 수동으로 트리거
gh workflow run update-dashboard.yml
```

## iframe / Confluence 관련 설정

GitHub Pages는 커스텀 HTTP 헤더를 지원하지 않으므로 `frame-ancestors` CSP 설정이 불가능하다.

Confluence iframe 임베딩이 차단될 경우:
- `graph/index.html`만 Cloudflare Pages(무료)에 호스팅하여 `_headers` 파일로 CSP 설정

## 검증 방법

배포 페이지 확인:

1. `https://choi-min-kyu.github.io/iOS-KPDS-Dashboard/` 접속
2. GitHub Actions workflow 수동 실행: `gh workflow run update-dashboard.yml`
3. `data/dashboard.json` 파일 확인

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
- Jira 상태 매핑을 바꿨는데 Playground와 scripts를 같이 안 맞추는 실수
- `Task / 티켓 / Epic 상태` 같은 상단 라벨을 다시 옛 버전으로 되돌리는 실수
- 불필요한 push로 GitHub Actions 실행 횟수를 낭비하는 실수

## 다음 AI에게 바로 필요한 판단 기준

- 레이아웃만 바꾸는 작업이면:
  - Playground 수정 -> `index.html` 병합
- Jira 데이터 계산이 이상하면:
  - `scripts/lib/kpds-data.js` 확인
- Confluence에서 안 보이면:
  - iframe CSP 문제 확인, Cloudflare Pages 보조 호스팅 검토
- 진행률 숫자가 기대와 다르면:
  - Jira workflow 상태명과 `classifyStatus()` / `STATUS_PROGRESS` 매핑 먼저 확인
