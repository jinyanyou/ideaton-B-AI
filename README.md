# 일단 살아봄

<p align="center">
  <img src="assets/images/logo.png" alt="일단 살아봄 로고" width="160" />
</p>

AI 기반 청년 지역 한달살기 추천 서비스 프로토타입입니다. 사용자의 생활 취향, 업무 조건, 예산, 관심사를 바탕으로 어울리는 지역과 기간별 체류 계획을 추천합니다.

## 주요 기능

- AI Lifestyle Match: 입력 조건 기반 지역 추천
- Mood Feed: 지역 분위기와 생활 장면 탐색 UI
- Drone Living View: 지역 생활권 확인 화면
- 30일 라이프 시뮬레이션: 단계별 체류 계획 제안
- Local Link: 직무와 관심사 기반 지역 프로젝트 연결

## 파일 구조

```text
idea/
├─ index.html
├─ server.js
├─ package.json
├─ .env.example
├─ assets/
│  └─ images/
└─ docs/
   └─ idea-notes.txt
```

## 실행 방법

1. `.env.example`을 참고해 `.env` 파일을 만듭니다.
2. `OPENAI_API_KEY` 값을 설정합니다.
3. 아래 명령어로 서버를 실행합니다.

```bash
npm start
```

기본 주소는 `http://localhost:3000`입니다.

## 환경 변수

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
PORT=3000
```

## 참고

- 실제 API 키가 들어 있는 `.env`는 Git에 올리지 않습니다.
- 기획 원문은 [docs/idea-notes.txt](docs/idea-notes.txt)에 보관했습니다.
