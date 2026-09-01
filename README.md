# Profitable Blog Automation

수익화를 목표로 하되 검색 스팸이 아니라 **광범위한 기회 탐색 → 근거 수집 → 작성 → 교차 사실검증 → 시각자료/라이선스 사진 처리 → 발행**을 자동화하는 GitHub Pages 블로그입니다.

블로그 브랜드는 **AI로 일하는 법**입니다. 개발자만을 위한 기술 블로그가 아니라, **AI와 자동화로 시간·비용·반복업무를 줄이고 싶은 사람**을 공통 축으로 묶습니다.

## 비용 원칙

- 유료 LLM/Search API를 사용하지 않습니다.
- public repository의 standard `ubuntu-latest` runner + 로컬 Ollama만 사용합니다.
- repository가 private이면 publish workflow가 즉시 중단됩니다.
- OpenAI API key는 필요 없습니다.

## 넓어진 독자군

자동 주제 탐색은 다음 5개 독자군을 매 실행마다 모두 커버합니다.

| 독자군 | 목표 비중 | 대표 문제 |
|---|---:|---|
| 직장인·지식근로자 | 30% | 이메일/문서/엑셀/회의록/일정 자동화 |
| 소규모 사업자 | 20% | 고객응대/CRM/예약/마케팅/백오피스 자동화 |
| 프리랜서·1인 사업자 | 15% | 고객관리/견적·청구/리서치/관리 자동화 |
| 콘텐츠 제작자 | 15% | 기획/리퍼포징/SNS/뉴스레터/자산관리 자동화 |
| 개발자·AI 실무자 | 20% | AI coding/local LLM/RAG/self-hosted AI |

최근 30개 글 분포를 보고 특정 독자군에 과도하게 몰리면 해당 후보의 점수를 자동으로 낮추고, 부족한 독자군은 보너스를 줍니다. 개발자 콘텐츠는 유지하지만 장기 목표 비중을 20%로 제한해 블로그 시장이 지나치게 좁아지는 것을 방지합니다.

## 유입 중심 주제 탐색

매 자동 실행에서 10개의 discovery query를 만듭니다. 첫 5개는 다섯 독자군을 각각 최소 1번씩 명시적으로 탐색하고, 나머지는 비교/대안/How-to/비용·ROI/무료 도구/보안·프라이버시/2026 비교 등 검색 의도를 회전합니다.

주제 후보는 단순 트렌드가 아니라 다음 신호로 점수화합니다.

`traffic 22% + audience breadth 13% + intent 16% + evergreen 12% + freshness 8% + evidence 12% + monetization 10% + competition opportunity 7%`

여기에 최근 30개 글의 **독자군/콘텐츠 역할 포트폴리오 균형 점수**가 추가됩니다. 실제 검색량 숫자를 모델이 꾸며내지는 않습니다.

콘텐츠 역할 목표:
- `reach` 45%: 넓은 정보성/문제해결 검색 유입
- `commercial` 35%: 비교/가격/대안/도구 선택
- `authority` 20%: 구현/보안/아키텍처 등 깊은 전문 글

## 독자군에 맞춘 글쓰기

자동 주제 후보에는 `audienceSegment`, `contentRole`, `readerProblem`, `expectedOutcome`, `monetizationRoute`가 붙습니다.

- 일반 직장인/사업자/프리랜서/크리에이터 글: 코딩 지식을 전제로 하지 않고 전문용어를 쉽게 풀어 설명
- 개발자 글: 구현 세부사항, 보안, 운영 trade-off를 충분히 유지
- 모든 글: 실제 독자 문제에서 시작하고, 제품 마케팅 문구보다 실행 단계·한계·의사결정 기준을 우선
- 3개 이상 whitelist 출처 + QA 85점 이상 + 최소 본문 길이 guard를 유지

## 단계별 로컬 모델 라우팅

| 단계 | 모델 | 목적 |
|---|---|---|
| 주제 후보 생성/선정 | `qwen3:1.7b` | 빠른 후보 평가 |
| 리서치 브리프 | `qwen3:4b` | 근거 요약/불확실성 정리 |
| 본문 작성 | `qwen3:8b` | 품질이 가장 중요한 장문 작성 |
| 독립 QA + 사진 필요성 판단 | `gemma3:4b` | 다른 계열 모델로 교차검증 |

각 단계가 끝나면 모델을 runner disk에서 제거합니다.

## 역할별 AdSense 정책

AdSense는 `ADSENSE_CLIENT` / `ADSENSE_SLOT`이 설정된 경우에만 활성화됩니다. 선택적으로 `ADSENSE_SLOT_MID`를 추가할 수 있습니다.

- `reach`: 최대 2개 — 커버 아래 + 본문 중간
- `commercial`: 1개 — 본문 중간만. 제휴/상품 CTA와 경쟁하지 않도록 상단 광고를 피함
- `authority`: 1개 — 본문 후반/중간
- AdSense secret이 없으면 광고 HTML 자체를 생성하지 않음

즉 대규모 정보성 유입에서는 광고를 활용하고, 구매의도가 높은 글에서는 광고 밀도를 낮춰 제휴/상품 전환을 우선합니다.

## 시각자료와 Wikimedia Commons 사진

기본 시각자료는 최종 사실검증된 내용으로 자체 SVG 커버와 요약 인포그래픽을 생성합니다. 실제 사진이 이해를 materially 개선하는 경우만 QA 단계에서 Wikimedia Commons 사진 검색을 요청합니다.

사진 자동화 정책:
- 허용: `CC0`, `Public domain`, `CC BY`, `CC BY-SA`
- 자동 거부: `NC`, `ND`, 알 수 없는 라이선스, 제한사항, 저자/라이선스 정보가 불충분한 파일
- 로고/아이콘/다이어그램/스크린샷은 사진 검색 대상으로 사용하지 않음
- 1200px thumbnail을 로컬 `public/assets/posts/`에 저장해 핫링크하지 않음
- `data/media/<slug>.json`에 저자, 라이선스, 원본 페이지, SHA-256, 수집 시각 보관
- 글의 이미지 caption에 저자/라이선스/원본 링크 표시
- 안전한 사진이 없으면 SVG만 사용하고 발행은 계속

## 수익화

수익화 우선순위는 **제휴 → 디지털 상품 → 컨설팅/리드 → 스폰서십 → 디스플레이 광고**입니다. 다만 대중 정보성 `reach` 콘텐츠는 AdSense를 보조 수익원으로 활용합니다.

세부 독자군별 수익화, 콘텐츠 포트폴리오, AdSense 역할별 정책, 90일 운영 계획, KPI, 성과 피드백 전략은 [`docs/MONETIZATION.md`](docs/MONETIZATION.md)에 정리되어 있습니다.

현재 코드에서는 실제 승인된 제휴 URL만 `AFFILIATE_LINKS_JSON`으로 연결합니다.

## 설정/실행

`Settings → Pages → Build and deployment → Source`를 **GitHub Actions**로 설정합니다. Actions → **Automated Blog Publisher** → Run workflow에서 `topic`을 비우면 자동 탐색, 값을 넣으면 수동 주제로 실행됩니다. 스케줄은 매일 07:30 KST입니다.
