# 아침 브리핑 (morning-briefing)

매일 아침 8시(KST) 다섯 개 채널의 새 소식을 **카드로 넘겨 읽고, 퀴즈로 확인하고, 생각을 적어 두는** 정적 웹앱입니다.
빌드 도구 없이 HTML/CSS/JS로 동작하고 GitHub Pages에서 그대로 서빙됩니다.

| 탭 | 종류 | 출처 |
| --- | --- | --- |
| 슈카 | YouTube | `UCsJ6RuBiTVWRX156FVbeaGg` |
| 코드팩토리 | YouTube | `UCxZ2AlaT0hOmxzZVbF_j_Sw` |
| 뉴탐사 | YouTube | `UCpr8CBjls1XYoSd98d6aT1w` |
| AI·테크 | X 검색 | X 최신 게시물 |
| 뉴진스 | X 검색 | X 최신 게시물 |

- YouTube 탭: 카드 넘기기 + 맞춤 퀴즈 + 생각해 볼 질문(브라우저에 자동 저장) + 원문 영상 링크
- X 탭: 화제 카드 + 원문 X 게시물 링크 (소식이 없으면 빈 상태)

## 구조

```
index.html              앱 셸 (브랜드 + #topbar + #view)
assets/style.css        블랙 테마 카드 리더 스타일, 모바일 우선
assets/app.js           날짜·채널 라우팅, 카드 덱, 퀴즈, 메모 (프레임워크 없음)
data/episodes.json      ★ 모든 콘텐츠. 일일 갱신은 이 파일만 고치면 된다
scripts/add_episode.py  새 에피소드를 검증하며 추가하는 도우미
icon.svg, assets/*.png  파비콘 / 홈 화면 아이콘
manifest.webmanifest    홈 화면 추가용 매니페스트
.nojekyll               GitHub Pages가 Jekyll로 전처리하지 않도록
```

라우팅은 해시 기반입니다: `#/d/{브리핑 날짜}/{채널 id}/{cards|quiz|notes}` (X 채널은 `cards`만).
경로가 없으면 가장 최근 날짜의 기본 채널(슈카 → 콘텐츠가 있는 첫 채널)로 엽니다.

## data/episodes.json 스키마 (version 2)

```jsonc
{
  "version": 2,
  "generatedAt": "2026-11-15T20:10:00+09:00",
  "channels": [                                  // 탭 순서 = 이 배열 순서
    { "id": "syuka", "name": "슈카", "kind": "youtube",
      "source": "UCsJ6RuBiTVWRX156FVbeaGg", "handle": "@syukaworld", "note": "경제·시사" },
    { "id": "ai-tech", "name": "AI·테크", "kind": "x", "note": "X 실시간 반응" }
  ],
  "episodes": [                                  // briefingDate 내림차순
    {
      "id": "yagCF3JqwAE",                       // 고유 키 (YouTube는 video id)
      "channel": "syuka",                        // channels[].id
      "briefingDate": "2026-11-15",              // 이 브리핑이 실리는 날 (날짜 바 기준)
      "date": "2026-11-14",                      // 원본 게시일
      "title": "…", "shortTitle": "짧은 이름", "subtitle": "…", "summary": "…",
      "tags": ["키워드", "키워드"],                       // 선택 (에피소드 단위)
      "url": "https://www.youtube.com/watch?v=yagCF3JqwAE",
      "numbers": [ { "value": "−41%", "label": "신규 구인 4년 새" } ],
      "cards": [
        {
          "kicker": "01 · 오늘의 장면",
          "title": "카드 제목",
          "body": ["문단1", "문단2 — **핵심 구절**은 굵게"],
          "tags": ["키워드", "키워드", "키워드"],         // 선택, 카드 하단 알약 3~4개
          "pullQuote": "강조 문장",                       // 선택
          "stat": { "value": "500만 원 → 30만 원", "label": "설명" },  // 선택
          "footnote": "각주",                             // 선택
          "sources": [                                    // 선택, X 카드에서 사용
            { "author": "handle", "url": "https://x.com/…", "time": "2026-11-15T10:52:31Z" }
          ]
        }
      ],
      "quizzes": [                                    // 선택 (YouTube 탭)
        { "type": "choice", "question": "…", "options": ["…", "…"], "answer": 1, "explanation": "…" },
        { "type": "ox", "question": "…", "options": ["O", "X"], "answer": 0, "explanation": "…" }
      ],
      "reflections": [                                // 선택 (YouTube 탭)
        { "id": "r1", "question": "…", "hint": "…" }
      ]
    }
  ]
}
```

### 규칙

- `channel`은 `channels[].id` 중 하나여야 합니다. `kind`가 `youtube`면 퀴즈·메모 탭이 붙고, `x`면 카드만 나옵니다.
- `briefingDate`는 날짜 바에서 선택하는 날, `date`는 원본 게시일입니다. `briefingDate`가 없으면 `date`로 채웁니다.
- 같은 `id`가 다시 들어오면 덮어씁니다. 배열 순서는 `briefingDate`·`date` 내림차순으로 유지합니다.
- `quizzes`·`reflections`가 없으면 해당 탭에 안내 문구만 나옵니다. 한 채널이라도 콘텐츠가 없는 날은 빈 상태가 표시됩니다.
- 문체: 본문·퀴즈 해설·생각해 볼 질문은 **친근한 존댓말(해요체)**로 씁니다. 신문체(`~한다`, `~보여 준다`)는 쓰지 않습니다.
- `body`·`title`·`pullQuote`·`footnote`·퀴즈 `explanation`의 `**구절**`은 굵은 글씨로 렌더링됩니다(HTML은 먼저 이스케이프하므로 안전).
- `cards[].tags`는 카드 하단 키워드 알약으로 그려집니다. 3~4개, 짧은 말로(18자 이내, 최대 6개까지 검증 통과).
- 사용자 데이터(읽던 위치, 퀴즈 점수, 메모)는 저장소에 남지 않고 브라우저 `localStorage`에만 저장됩니다.
  키 접두사 `syuka.v1` — `syuka.v1.pos.{episodeId}`, `syuka.v1.quiz.{episodeId}`, `syuka.v1.note.{episodeId}.{질문 id}`.

## 새 에피소드 추가 (매일 08:00 작업)

```bash
# 1) 채널별로 new_episode.json 을 만든다 (하나의 객체 또는 배열)
# 2) 검증만 먼저
python3 scripts/add_episode.py new_episode.json --dry-run
# 3) 실제 반영 (같은 id는 교체, generatedAt 갱신)
python3 scripts/add_episode.py new_episode.json
# 4) 배포
git add data/episodes.json && git commit -m "briefing: 2026-11-16 (syuka, ai-tech)" && git push
```

스크립트는 필수 필드, 채널 id, 퀴즈 정답 인덱스, X 카드의 출처 URL을 검사하고 실패하면 파일을 건드리지 않습니다.

## 배포

GitHub Pages, `main` 브랜치 루트(`/`)에서 서빙. `.nojekyll`이 있어 정적 파일이 그대로 올라갑니다.
push 후 보통 20~60초 안에 반영됩니다(첫 배포는 몇 분 걸릴 수 있음).
`assets/style.css`·`assets/app.js`를 고쳤을 때는 `index.html`의 `?v=20261115a` 값을 함께 올리면
브라우저·CDN 캐시(10분)를 기다리지 않고 바로 새 파일이 내려갑니다.

```bash
git clone https://github.com/seowookim08/morning-briefing.git
cd morning-briefing
# ... 수정 ...
git commit -am "..." && git push
```

## 로컬에서 보기

```bash
python3 -m http.server 8000    # 이 폴더에서 실행 후 http://localhost:8000
```
`file://`로 열면 `fetch`가 막혀 데이터가 로드되지 않습니다.
