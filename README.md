# 슈카월드 아침 브리핑

매일 아침 8시(KST) 슈카월드의 최신 영상을 **카드로 넘겨 읽고, 퀴즈로 확인하고, 생각을 적어 두는** 정적 웹앱입니다.
빌드 도구 없이 HTML/CSS/JS 세 파일로 동작하고, GitHub Pages에서 바로 서빙됩니다.

- 사이트: https://seowookim08.github.io/syuka-daily/
- 원본 영상·모든 내용의 출처: [슈카월드 유튜브 채널](https://www.youtube.com/@syukaworld)

## 구조

```
index.html              앱 셸 (브랜드 헤더 + #view)
assets/style.css        에디토리얼 스타일, 모바일 우선, 라이트/다크
assets/app.js           라우팅·카드 덱·퀴즈·메모 (프레임워크 없음)
data/episodes.json      ★ 모든 콘텐츠. 일일 갱신은 이 파일만 고치면 된다
scripts/add_episode.py  새 에피소드를 검증하며 맨 앞에 추가하는 도우미
icon.svg, assets/*.png  파비콘 / 홈 화면 아이콘
manifest.webmanifest    홈 화면 추가용 매니페스트
.nojekyll               GitHub Pages가 Jekyll로 전처리하지 않도록
```

라우팅은 해시 기반입니다: `#/` 목록, `#/e/{에피소드 id}/{cards|quiz|notes}`.

## data/episodes.json 스키마

```jsonc
{
  "version": 1,
  "generatedAt": "2026-11-15T19:45:00+09:00",   // 마지막 갱신 시각 (KST, ISO8601)
  "episodes": [                                  // 최신이 위. date 내림차순
    {
      "id": "yagCF3JqwAE",                       // 유튜브 video id (고유 키)
      "date": "2026-11-14",                      // YYYY-MM-DD (영상 게시일)
      "title": "수많은 취준생을 울린 '꿈꾸던 어른이 되었나요?'",
      "subtitle": "차트 2위에 오른 AI 노래, 그리고 '안 뽑는' 노동시장",  // 선택
      "summary": "한두 문장 요약 — 목록과 상세 상단에 노출",             // 선택
      "url": "https://www.youtube.com/watch?v=yagCF3JqwAE",
      "tags": ["AI", "청년고용"],                // 선택
      "numbers": [                               // 선택: 상단 핵심 숫자
        { "value": "−41%", "label": "신규 구인 4년 새" }
      ],

      "cards": [                                 // 필수. 4~6장 권장
        {
          "kicker": "01 · 오늘의 장면",           // 카드 상단 작은 표제
          "title": "카드 제목 (한 문장)",
          "body": ["문단1", "문단2", "문단3"],    // 문자열 배열 = 문단
          "pullQuote": "인용처럼 강조할 한 문장",  // 선택
          "stat": { "value": "500만 원 → 30만 원", "label": "설명" },  // 선택
          "footnote": "각주",                     // 선택
          "image": "https://.../photo.jpg"        // 선택 (현재 UI 미사용, 예약)
        }
      ],

      "quizzes": [                               // 선택. 3~4문항 권장
        {
          "type": "choice",                       // "choice" | "ox"
          "question": "질문",
          "options": ["보기1", "보기2", "보기3"],
          "answer": 2,                            // options의 인덱스(0부터)
          "explanation": "정답 해설"
        },
        {
          "type": "ox",
          "question": "…이다.",
          "options": ["O", "X"],
          "answer": 0,
          "explanation": "해설"
        }
      ],

      "reflections": [                            // 선택. 2~3개 권장
        {
          "id": "r1",                             // 메모 저장 키. 에피소드 안에서 고유
          "question": "생각해 볼 질문",
          "hint": "생각의 실마리 (선택)"
        }
      ]
    }
  ]
}
```

### 규칙

- `id`는 유튜브 video id. 같은 `id`가 다시 들어오면 **덮어씁니다**(재정리 허용).
- 배열 순서는 `date` 내림차순으로 유지합니다. 앱은 불러올 때 한 번 더 정렬합니다.
- `cards`는 필수, `quizzes`·`reflections`는 없으면 해당 탭에 안내 문구만 나옵니다.
- 사용자 데이터(읽던 위치, 퀴즈 점수, 메모)는 저장소에 남지 않고 브라우저 `localStorage`에만 저장됩니다.
  키 접두사는 `syuka.v1` — `syuka.v1.pos.{id}`, `syuka.v1.quiz.{id}`, `syuka.v1.note.{id}.{질문 id}`.

## 새 에피소드 추가 (매일 08:00 작업)

```bash
# 1) 새 영상을 카드/퀴즈/질문으로 정리해 new_episode.json 으로 저장
# 2) 검증만 먼저
python3 scripts/add_episode.py new_episode.json --dry-run
# 3) 실제 반영 (맨 앞에 추가, generatedAt 갱신)
python3 scripts/add_episode.py new_episode.json
# 4) 배포
git add data/episodes.json && git commit -m "briefing: yagCF3JqwAE (2026-11-14)" && git push
```

`add_episode.py`는 필수 필드와 퀴즈 정답 인덱스를 검사하고, 실패하면 파일을 건드리지 않습니다.

## 배포

GitHub Pages, `main` 브랜치 루트(`/`)에서 서빙. `.nojekyll`이 있어 정적 파일이 그대로 올라갑니다.
push 후 보통 20~60초 안에 반영됩니다(첫 배포는 몇 분 걸릴 수 있음).

```bash
git clone https://github.com/seowookim08/syuka-daily.git
cd syuka-daily
# ... 수정 ...
git commit -am "..." && git push
```

## 로컬에서 보기

```bash
python3 -m http.server 8000    # 이 폴더에서 실행 후 http://localhost:8000
```
`file://`로 열면 `fetch`가 막혀 데이터가 로드되지 않습니다.
