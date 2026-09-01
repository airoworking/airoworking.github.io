# AI로 일하는 법 수익화 운영 계획

이 블로그의 목표는 잡학성 대량 콘텐츠가 아니라 **AI와 자동화로 실제 시간·비용·반복업무를 줄이고 싶은 넓은 독자층을 검색에서 확보한 뒤, 검색 의도에 맞는 수익화 경로를 연결하는 것**입니다. 모든 수치는 목표/가설이며 수익을 보장하지 않습니다.

## 1. 시장 범위를 넓히되 정체성은 하나로 유지

블로그는 다음 다섯 독자군을 다룹니다.

| 독자군 | 목표 비중 | 대표 검색 문제 | 주요 수익 경로 |
|---|---:|---|---|
| 직장인·지식근로자 | 30% | 이메일, 문서, 엑셀, 회의록, 일정 자동화 | AdSense, 생산성 SaaS 제휴, 템플릿 |
| 소규모 사업자 | 20% | 고객응대, CRM, 예약, 마케팅, 백오피스 | SaaS 제휴, 리드/컨설팅, 자동화 kit |
| 프리랜서·1인 사업자 | 15% | 고객관리, 견적/청구, 리서치, 관리업무 | SaaS 제휴, 템플릿/상품 |
| 콘텐츠 제작자 | 15% | 기획, 리퍼포징, SNS, 뉴스레터 | creator SaaS 제휴, workflow bundle |
| 개발자·AI 실무자 | 20% | local LLM, RAG, coding tools, self-hosting | hosting/도구 제휴, 기술 상품, 컨설팅 |

공통 주제는 **AI로 일하는 법**입니다. AI와 자동화가 실제 업무/비즈니스 문제를 해결하지 않는 주제는 다루지 않습니다. 이렇게 하면 일반 잡학 블로그처럼 정체성이 분산되지 않으면서 개발자만 대상으로 했을 때의 트래픽 상한도 줄일 수 있습니다.

## 2. 콘텐츠 역할 3분할

자동 주제 선정은 각 글을 세 역할 중 하나로 분류합니다.

### Reach — 목표 45%
넓은 검색 유입과 신규 독자 확보가 목적입니다.

예:
- AI로 반복 업무 자동화하는 방법
- 회의록 자동 정리 도구
- 엑셀/스프레드시트 AI 자동화
- 소상공인 고객 문의 자동화
- 무료 AI 생산성 도구

1차 수익화: AdSense, 내부링크
2차 수익화: 관련 상업 글/템플릿으로 이동

### Commercial — 목표 35%
도구를 비교하거나 실제 구매/도입 결정을 내리려는 독자가 대상입니다.

예:
- Zapier 대안
- n8n vs Make
- AI 회의록 도구 비교
- Notion AI 대안
- AI 고객응대 도구 가격 비교

1차 수익화: 제휴
2차 수익화: 비교표/ROI 템플릿, 자체 상품

### Authority — 목표 20%
사이트 전문성과 고단가 수익 기회를 만드는 깊은 콘텐츠입니다.

예:
- local LLM 보안 설계
- RAG 운영 체크리스트
- self-hosted AI 아키텍처
- n8n 운영/보안

1차 수익화: 컨설팅/리드, 기술 상품
2차 수익화: hosting/infra 제휴

## 3. AdSense 사용 정책

AdSense는 주수익원이 아니라 **reach 트래픽을 현금화하는 보조 채널**입니다.

코드 정책:
- `ADSENSE_CLIENT` + `ADSENSE_SLOT` 둘 다 있을 때만 활성화
- 선택적으로 `ADSENSE_SLOT_MID` 사용 가능
- `reach`: 최대 2개 — 커버 아래 + 본문 중간
- `commercial`: 1개 — 본문 중간만
- `authority`: 1개 — 본문 중간/후반
- 목록 페이지에는 광고를 넣지 않음

이유:
- 정보성 글은 구매 전환이 낮아 광고와 궁합이 좋음
- 비교/가격/대안 글은 제휴 전환 1건의 가치가 광고 클릭보다 클 수 있으므로 광고 밀도를 낮춤
- 전문 글은 가독성과 신뢰가 중요하므로 광고를 최소화

광고 수익은 추정치가 아니라 실제 Page RPM으로 관리합니다.

`광고수익 = pageviews / 1000 × actual Page RPM`

## 4. 제휴 — 초기 핵심 수익원

실제 글에서 다루는 제품 중 승인된 제휴 프로그램만 사용합니다.

우선 카테고리:
- workflow/no-code automation SaaS
- AI 생산성/회의록/문서 도구
- CRM/customer support/booking 도구
- creator/newsletter/content workflow 도구
- AI coding/dev productivity 도구
- hosting/VPS/cloud/managed DB
- AI/RAG SaaS

운영 원칙:
- 제휴 여부와 편집 결론을 분리
- 사용하지 않은 제품을 직접 사용했다고 표현하지 않음
- CTA는 결론/비교/의사결정 구간에서만 자연스럽게 노출
- `rel="sponsored nofollow"`와 제휴 고지 유지
- 제휴 프로그램이 없는데 URL을 임의 생성하지 않음

`제휴 수익 = qualified outbound clicks × conversion rate × average commission`

## 5. 자체 디지털 상품 — 장기 핵심

광고/제휴보다 플랫폼 의존도가 낮고 방문당 수익을 높일 수 있습니다.

독자군별 상품 후보:
- 직장인: 이메일/문서/회의록 자동화 템플릿, 업무 자동화 체크리스트
- 소규모 사업자: 고객문의/CRM/예약 automation starter kit
- 프리랜서: 견적·청구·고객관리 workflow bundle
- 크리에이터: 콘텐츠 기획/리퍼포징/SNS workflow package
- 개발자: n8n/Ollama/RAG deployment templates, security runbook

무료 글은 문제 해결 방법을 충분히 제공하고, 유료 상품은 **실행 시간을 줄여주는 파일·workflow·template·checklist**를 판매합니다.

`상품 수익 = landing page visitors × purchase conversion × net price`

## 6. 컨설팅/리드

트래픽이 크지 않아도 고단가가 가능한 채널입니다.

대상:
- 사내 반복업무 자동화 설계
- CRM/고객응대 자동화
- n8n/Make workflow 구축
- local LLM/RAG PoC
- self-hosted AI 보안/운영

실제 서비스를 제공할 의사가 있을 때만 CTA를 켭니다.

`서비스 수익 = qualified leads × close rate × average project value`

## 7. 내부링크 수익 퍼널

모든 글을 직접 수익화하지 않습니다.

예시 1 — 직장인:
`회의록 자동화 방법 → 회의록 도구 비교 → 추천 도구 제휴/템플릿`

예시 2 — 소규모 사업자:
`고객 문의 자동화 아이디어 → CRM/챗봇 비교 → 도구 제휴 → 구축 문의`

예시 3 — 개발자:
`Ollama 설치 → local AI 보안 → hosting/self-hosting 비교 → 배포 kit/컨설팅`

Reach 글이 상업 글로 트래픽을 전달하고, Authority 글이 신뢰와 고단가 전환을 담당합니다.

## 8. 콘텐츠 포트폴리오 자동 균형

최근 30개 글에서 독자군/콘텐츠 역할 비중을 계산합니다.

독자군 목표:
- knowledge-worker 30%
- small-business 20%
- freelancer 15%
- creator 15%
- developer 20%

콘텐츠 역할 목표:
- reach 45%
- commercial 35%
- authority 20%

특정 영역이 목표보다 과도하게 많으면 다음 주제 점수에 패널티, 부족하면 보너스를 줍니다. 따라서 장기간 자동 운영해도 개발자 글이나 비교글 한 종류에만 쏠리는 것을 방지합니다.

## 9. 주제 점수

자동 후보의 기본 점수:

`traffic 22% + audience breadth 13% + intent 16% + evergreen 12% + freshness 8% + evidence 12% + monetization 10% + competition 7%`

이후 포트폴리오 균형 보너스/패널티를 적용합니다.

중요:
- 실제 검색량 숫자를 모델이 생성하지 않음
- 수익 가능성을 보장값으로 쓰지 않음
- 공개 근거가 부족한 주제는 발행하지 않음
- 향후 Search Console/GA4/제휴 실적이 쌓이면 추정 점수를 실제 데이터로 대체

## 10. 90일 실행 계획

### 1~30일 — 넓은 검색 표면 확보
- 고품질 글 20~30개 축적
- 다섯 독자군에서 최소 3~5개씩 테스트
- 최소 4개 클러스터 형성
- Search Console / GA4 연결
- 승인된 제휴 프로그램만 등록
- 무료 다운로드 자료 1개 제작
- AdSense는 사이트 품질/승인 상태가 준비된 뒤 활성화

추천 초기 클러스터:
- 직장인 AI 업무 자동화
- 소규모 사업자 고객/CRM 자동화
- AI 도구 비교/대안
- n8n/workflow automation
- creator workflow automation

### 31~60일 — 상업의도 강화
- Search Console에서 노출 발생 쿼리 확인
- 순위 4~20위 글 보강
- Reach 글에서 Commercial 글로 내부링크 강화
- 제휴 outbound click 측정
- 첫 유료 workflow/template bundle 출시
- 독자군별 성과 차이 비교

### 61~90일 — 수익 최적화
- 글별 `검색유입 → 광고/제휴 클릭 → conversion → revenue` 기록
- 독자군별 RPM/EPC/상품 전환 비교
- revenue/article가 높은 영역의 후속 글 확대
- traffic은 높지만 revenue가 낮은 Reach 글의 내부링크 개선
- 반복 유입이 있는 Authority 영역에서 컨설팅/스폰서십 테스트

## 11. KPI

검색:
- impressions
- clicks
- CTR
- average position
- landing page sessions
- audience segment별 organic sessions

수익:
- Page RPM
- affiliate outbound clicks
- affiliate conversion rate
- EPC
- digital product conversion
- qualified leads
- article revenue
- audience segment revenue
- content role revenue
- 30일/90일 revenue per article

가장 중요한 것은 단순 PV가 아니라 **독자군/콘텐츠 역할별 검색 성장과 실제 수익**입니다.

## 12. 장기 피드백 루프

최종 목표:

`Search Console + GA4 + affiliate revenue + product sales + lead data`
`→ audience/content-role별 성과`
`→ 다음 주제 우선순위`
`→ 새 글/기존 글 업데이트`
`→ 다시 측정`

예:
- 직장인 Reach 글: impressions↑, revenue↓ → 비교/템플릿 글로 내부링크 강화
- 소규모 사업자 Commercial 글: 클릭↑, 전환↑ → 같은 문제 클러스터 확대
- 개발자 Authority 글: traffic↓, lead↑ → 고단가 콘텐츠로 유지
- 특정 세그먼트가 traffic/revenue 모두 낮음 → 목표 비중을 데이터 기반으로 재조정

## 13. 안전 원칙

- 제휴 때문에 리뷰/비교 결론을 바꾸지 않음
- 사용하지 않은 제품을 사용해봤다고 표현하지 않음
- 광고/제휴가 본문보다 더 눈에 띄지 않게 유지
- Wikimedia Commons는 상업 재사용 가능한 라이선스/저자/원본을 모두 검증
- CC BY-NC, CC BY-ND, CC BY-NC-SA, unknown license 자동 사용 금지
- YMYL/불법/위험 주제 필터 유지
- 검색 스팸/얇은 재작성 대신 실제 문제 해결, 비교 기준, 한계, 운영 리스크 제공
