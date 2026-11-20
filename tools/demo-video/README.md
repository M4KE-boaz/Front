# 시연 영상 만들기

m4ker 입력 화면에서 "사진 끌어다 놓기 → 프롬프트 타이핑 → 예시 스타일 선택 → 생성 → 다른 참조로 다시 생성"을 사람이 하는 것처럼 보이게 녹화한다. 2026-11-16에 만든 영상 5개가 이 방법으로 만들어졌다.

**무엇이 진짜고 무엇이 연출인가**

| 진짜 | 연출 |
|---|---|
| 화면(Front)과 백엔드(CLIP-AdStyle `server.py`) | 화살표 커서 (화면 위에 그린 그림) |
| 파일 드롭·클릭·키 입력 이벤트 (브라우저가 실제로 처리) | 파일 카드가 날아가는 애니메이션 |
| 검색 Top-5, GPU 생성 결과 (`REAL`) | 한 글자씩 치는 속도, 단계 자막 |

생성을 기다리는 시간도 빨리감기 없이 실제 시간 그대로 녹화된다.

## 처음 해 보는 사람용 요약

내 컴퓨터든 학교 GPU 서버든, **`server.py`가 떠 있는 곳의 화면을 Chrome으로 열 수만 있으면** 녹화할 수 있다.

1. CLIP-AdStyle(main)에 검색용 파일을 받는다. git에는 없고 따로 전달받는 압축 파일이다(인덱스·LoRA adapter·갤러리 1,266장·CLIP 원본). 저장소 루트에서 풀면 끝.
2. 서버를 켠다. GPU가 있으면 `server.py --config configs/demo-versions-gpu.json --gpu-approved --front-dir ../Front`, 없으면 `--mock`(진단 모드)로 먼저 연습한다.
3. 제품 사진을 `tools/demo-video/products/`에 둔다. 직접 찍은 사진도 된다(단색 배경, 제품 하나).
4. `configs/` 중 하나를 복사해서 `image`, `typed`, `styleCard`, `pick`만 바꾼다.
5. Front 루트에서 `node tools/demo-video/record.mjs tools/demo-video/configs/내설정.json` → `tools/demo-video/out/`에 mp4.

- **녹화하는 컴퓨터:** Node 22+, Chrome, ffmpeg가 필요하다. 서버(Linux)에서 바로 녹화하면 Chrome 경로를 알려 준다: `CHROME_PATH=/usr/bin/google-chrome node ...`. 노트북에서 녹화하고 서버는 원격이면 `ssh -L 8000:127.0.0.1:8000 서버`로 포트만 연결한다.
- 서버를 다 쓰면 꼭 끈다. 모델이 GPU 메모리를 계속 잡고 있다.

## 구성

| 파일 | 역할 |
|---|---|
| `record.mjs` | 헤드리스 Chrome을 조작하며 녹화 → mp4 |
| `prepare_products.py` | BG60K zip에서 제품 사진을 꺼내 PNG로 저장 |
| `configs/*.json` | 영상 하나당 설정 하나 (01~05 = 2026-11-16 영상, `mock-smoke` = 모델 없이 시험용) |
| `products/`, `out/` | 제품 사진, 결과 영상 (git에 올리지 않음) |

필요한 것: Node 22+ (내장 WebSocket 사용), Google Chrome, ffmpeg, Pillow가 있는 파이썬(CLIP-AdStyle `.venv`). 추가 npm 패키지는 없다.

## 1. 제품 사진 준비

폴더 구조는 `Clip Adstyle/` 아래에 `Front/`, `CLIP-AdStyle/`, `bg60k_imgs_4.zip`이 나란히 있다고 가정한다. Front 루트에서:

```bash
../CLIP-AdStyle/.venv/bin/python -I tools/demo-video/prepare_products.py --zip ../bg60k_imgs_4.zip
```

- 기본으로 4장(러닝화 2774, 시계 34054, 크림 53904, 선글라스 51894)을 `products/`에 꺼낸다. 다른 사진은 `--ids <id> ...`.
- BG60K 일부 파일은 확장자만 `.png`이고 실제로는 JPEG라서, 이 스크립트가 진짜 PNG로 다시 저장한다.
- **사진 고르는 기준:** 단색 배경에 제품 하나만 있는 사진이어야 배경 제거(rembg)가 깔끔하다. 검색 대상인 test 1,266장(`CLIP-AdStyle/indexes/versions/lora-60k-test/image_ids.json`)에 있는 사진은 피한다. 들어 있으면 검색 결과에 자기 자신이 나온다.
- 대리석 타일(`smoke_product.png`)은 GPU 서버의 `~/workspaces/clip-adstyle-train/data/demo/smoke_product.png`에 있다. `scp`로 받아 `products/`에 둔다.

## 2. 설정 파일

```json
{
  "url": "http://127.0.0.1:8000/m4ker_input.html",
  "image": "../products/34054-watch.png",
  "typed": "luxury wristwatch",
  "styleCard": 0,
  "pick": 3,
  "adapterScale": 0.4,
  "showSettings": true,
  "out": "../out/03-watch-cafe-settings.mp4"
}
```

| 키 | 뜻 |
|---|---|
| `image`, `out` | 설정 파일 위치 기준 상대 경로 (절대 경로도 됨) |
| `typed` | 한 글자씩 칠 문장. **영어로.** 한국어는 번역이 켜진 서버에서만 된다 |
| `styleCard` | 클릭할 예시 스타일 카드 (0 따뜻한 카페, 1 싱그러운 자연, 2 노을빛 감성, 3 미니멀 스튜디오). 안 쓰면 `null` |
| `pick` | 다시 생성할 때 고를 참조 순위 (0이 1위). `null`이나 0이면 다시 생성 장면 없음 |
| `adapterScale` | 참고 강도. **0.4~0.45 권장** (아래 주의 참고). 생략하면 화면 기본값 0.6 |
| `showSettings` | `true`면 세부 설정을 열고 슬라이더를 끌어내리는 장면까지 녹화 |
| `width`, `height` | 화면 크기, 기본 1440×900 |

`typed` 뒤에 쉼표를 붙이지 않는다. 예시 스타일 카드가 앞에 쉼표를 붙여 준다.

## 3. 모델 없이 시험 (Mac, 진단 모드)

설정이나 스크립트를 고친 뒤에는 GPU를 쓰기 전에 이걸로 먼저 확인한다. CLIP-AdStyle 루트에서 서버를 켜고:

```bash
.venv/bin/python server.py --mock --front-dir ../Front     # 이 터미널은 열어 둔다
```

Front 루트에서:

```bash
node tools/demo-video/record.mjs tools/demo-video/configs/mock-smoke.json
```

진단 모드의 가짜 토크나이저는 글자 수(바이트)로 77을 세서 긴 문장을 거절한다. 그래서 `mock-smoke`는 짧은 문장을 쓴다. 실제 서버는 긴 문장도 된다.

## 4. 실제 영상 (GPU 서버)

**접속 주의:** GPU 서버 주소·계정은 공개 저장소에 적지 않는다. 비공개 CLIP-AdStyle 저장소의 `docs/DEMO_OPERATIONS.md`에 있고, 아래에서는 `GPU=계정@주소`로 쓴다. 이 서버는 하루 3번 로그인에 실패하면 IP를 영구 차단한다(fail2ban). 비밀번호는 `Clip Adstyle/.env`의 `SSH_PASSWORD`에 있다. 한 번에 정확히 입력하고, 실패하면 반복하지 않는다. 연결 하나를 만들어 계속 재사용한다(ControlMaster).

```bash
GPU=계정@주소   # DEMO_OPERATIONS.md 참고

# 1) 접속 + 8000 포트 연결 (비밀번호 1회). 이후 명령은 이 연결을 재사용
ssh -o NumberOfPasswordPrompts=1 -o ControlMaster=yes -o ControlPath=/tmp/adst-cm \
    -o ControlPersist=1h -fN -L 8000:127.0.0.1:8000 "$GPU"

# 2) 서버에서 API 켜기 (데모 폴더 clip-adstyle-demo, Front는 ~/workspaces/m4ker-front)
ssh -o ControlPath=/tmp/adst-cm "$GPU" 'cd ~/workspaces/clip-adstyle-demo && \
  HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 setsid -f .venv-cuda/bin/python server.py \
  --config configs/demo-versions-gpu.json --gpu-approved --front-dir ../m4ker-front --port 8000 \
  > results/server-api.log 2>&1 < /dev/null'
curl -s 127.0.0.1:8000/api/health          # {"ok":true,"mock":false} 이면 준비 완료

# 3) 녹화 (Front 루트에서, 여러 개를 한 번에)
node tools/demo-video/record.mjs tools/demo-video/configs/0*.json
```

결과는 `tools/demo-video/out/`에 생기고, 영상마다 `resultMsg`가 출력된다. `REAL · reference · 제품 내부 픽셀 차이 0`이면 정상이다. 영상 하나에 40~50초, 1440×900이고 2~3MB 정도다.

**끄기 (꼭 할 것).** 서버 앱은 SSH와 분리돼 떠 있어서, SSH만 닫으면 GPU를 계속 점유한다.

```bash
# pkill -f 를 쓰면 자기 자신의 ssh 명령줄까지 잡아 세션이 끊긴다 → python 프로세스만 골라서 끈다
ssh -o ControlPath=/tmp/adst-cm "$GPU" \
  'for p in $(pgrep -f "server\.py --config"); do [ "$(cat /proc/$p/comm)" = python ] && kill $p; done; \
   sleep 3; ss -ltn | grep ":8000 " || echo "8000 닫힘"; nvidia-smi --query-gpu=memory.used --format=csv,noheader'
ssh -o ControlPath=/tmp/adst-cm -O exit "$GPU"   # 연결 종료
```

GPU에는 다른 프로젝트(`research/.../api_server.py`)도 올라가 있다. 그 프로세스는 건드리지 않는다. 그 프로젝트가 GPU를 많이 쓰고 있으면 여유 메모리가 7.5GB 정도뿐이라 한국어 번역(약 9GB)은 켤 수 없다.

**Front를 고쳤다면** 서버의 `~/workspaces/m4ker-front`도 갱신해야 화면에 반영된다. 서버 폴더에는 git 원격이 없어서 파일로 보낸다.

```bash
git archive --format=tar HEAD -o /tmp/front.tar
scp -o ControlPath=/tmp/adst-cm /tmp/front.tar "$GPU":/tmp/
ssh -o ControlPath=/tmp/adst-cm "$GPU" 'tar -xf /tmp/front.tar -C ~/workspaces/m4ker-front && rm /tmp/front.tar'
```

## 주의 · 문제 해결

- **참조 복사:** 참고 강도가 0.6(기본)이면 참조 사진 속 물건(그릇 테두리, 빵 등)이 결과에 자주 복사된다. 0.4~0.45로 낮춘 10건 중에서는 1건(선글라스, 공 모양 물건)만 복사됐다. 녹화 후에는 결과를 꼭 눈으로 확인하고, 이상하면 `pick`을 바꿔 다시 찍는다.
- **중간에 멈춤:** `timeout: ...` 오류와 함께 `state: {...}`가 출력된다. `msg`에 서버가 돌려준 오류(예: `query exceeds 77 tokens`)가 들어 있다.
- **"화면이 서버에 연결되지 않음":** `server.py`가 안 켜졌거나 8000 포트 연결이 끊긴 것이다. `curl 127.0.0.1:8000/api/health`로 확인한다.
- **Chrome 위치가 다를 때:** `CHROME_PATH=/경로/chrome node ...`. 디버깅 포트(기본 9334)가 겹치면 `CDP_PORT=9444`.
- **결과 확인:** 영상 몇 장면만 뽑아 보려면 `ffmpeg -ss 30 -i out/01-....mp4 -frames:v 1 still.jpg`.
