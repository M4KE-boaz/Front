# Front

m4ker 웹 화면 (BOAZ 미니프로젝트 4조). 정적 HTML/CSS/JS이며, 검색·생성은 [CLIP-AdStyle](https://github.com/M4KE-boaz/CLIP-AdStyle) 백엔드(`server.py`)가 담당합니다.

| 파일 | 역할 |
|---|---|
| `m4ker_startpage.html` | 시작 화면 |
| `m4ker_input.html` | 입력 → 비슷한 광고 스타일 Top-5 → 생성 결과 |
| `JS/m4ker_api.js` | 백엔드 연결 (서버 찾기, 요청/오류 처리) |
| `JS/m4ker_input.js` | 입력 화면 동작 |
| `css/m4ker_style.css` | 공통 스타일 |

## 실행

두 저장소를 같은 폴더에 나란히 둡니다.

```bash
git clone https://github.com/M4KE-boaz/Front.git
git clone https://github.com/M4KE-boaz/CLIP-AdStyle.git   # 데모 기능은 exp/demo-ko-generation 브랜치
cd CLIP-AdStyle && git checkout exp/demo-ko-generation

# 모델 없이 화면 흐름만 확인 (진단 모드, AI 생성 결과 아님)
.venv/bin/python server.py --mock --front-dir ../Front
# 실제 LoRA 검색 (Mac/CPU, 생성은 꺼짐)
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 .venv/bin/python server.py --config configs/demo-versions-cpu.json --front-dir ../Front
```

브라우저에서 http://127.0.0.1:8000/ 을 엽니다. 백엔드 환경 준비·GPU 서버 실행은 CLIP-AdStyle의 `docs/WEB_FRONT.md`를 참고하세요.

Front만 따로 띄워도 됩니다 (VS Code Live Server 등). 화면은 서버를 `?api=주소` → 페이지를 띄운 서버 → `http://127.0.0.1:8000` 순서로 찾습니다. 예: `m4ker_input.html?api=http://127.0.0.1:9000` (`?api=reset`으로 초기화).

## 서버별 화면

| 서버 상태 | 상단 표시 | 버튼 | 결과 |
|---|---|---|---|
| GPU 서버 (생성 가능) | 연결됨 | 생성하기 | 스타일 Top-5 + 생성 이미지 |
| Mac/CPU | 연결됨 · 스타일 검색만 | 스타일 찾기 (사진 없어도 됨) | 스타일 Top-5 |
| `--mock` | 연결됨 · 진단 모드 | 생성하기 | 진단용 결과 (AI 생성 아님) |
| 꺼짐 | 서버 꺼짐 | 비활성 | 켜는 방법 안내 |

한국어 프롬프트는 번역이 켜진 서버(GPU 설정)에서만 됩니다. 그 외에는 영어로 적거나 예시 스타일을 고르세요.
