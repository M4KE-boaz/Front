// =========================================================
// m4ker 입력 페이지 · 버전 2 (단계별로 펼쳐지는 방식)
// 앱 파이프라인 명세(APP_PIPELINE.md)의 흐름을 따른다
//
// ① 제품 사진 + 스타일 문장 → [스타일 검색]
// ② Top-5 중 참조 1장 선택 (기본 Top 1) → [생성하기]
// ③ (선택) 고급 설정: 참조 강도, steps, seed, 제품 크기·위치
// ④ 결과: 이미지, 다운로드, 마스크·메타데이터
//
// 백엔드(FastAPI)가 생기면 API_BASE에 주소만 넣으면 된다.
// 비어 있으면 가짜 API(mock)로 동작하고, 화면에 "진단용 · AI 생성 결과 아님"을 표시한다.
// =========================================================

const API_BASE = null; // 예: 'http://localhost:8000'

const LIMITS = {
    types: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 20 * 1024 * 1024, // 20MB
    maxPixels: 20_000_000,      // 20메가픽셀
    maxChars: 1000,
    maxTokens: 77,              // CLIP 텍스트 토큰 한도
};

const DEFAULTS = {
    mode: 'text_only', // 명세 기본값
    adapterScale: 0.6,
    steps: 20,
    seed: 42,
    fallback: false,
    productScale: 0.65,
    centerX: 0.5,
    centerY: 0.5,
};

const CANVAS = 512;

// =========================================================
// 가짜 검색 대상 (서버 연결 전용)
// 실제로는 서버의 test gallery 1,266장에서 CLIP+LoRA로 검색한다
// =========================================================
const MOCK_GALLERY = [
    { id: '14554', tile: 'tile-green', sky: ['#e0e9d8', '#d6e3cc'], floor: '#c9d6bf', horizon: 0.6, leaves: true,
      words: ['green', 'leaves', 'leaf', 'plant', 'plants', 'garden', 'natural', 'fresh', 'outdoor', 'nature', 'forest'] },
    { id: '08812', tile: 'tile-warm', sky: ['#f6e7d6', '#f3e2cf'], floor: '#e8dccf', horizon: 0.58, sun: '#fff4d6',
      words: ['warm', 'wooden', 'wood', 'table', 'cafe', 'cozy', 'morning', 'sunlight', 'coffee', 'soft'] },
    { id: '21007', tile: 'tile-sunset', sky: ['#f7d3bf', '#f0b9a9'], floor: '#e6d0c5', horizon: 0.58, sun: '#ffd8bf',
      words: ['sunset', 'pink', 'orange', 'dreamy', 'warm', 'evening', 'golden', 'atmosphere'] },
    { id: '03391', tile: 'tile-studio', sky: ['#dcdfe6', '#e4e6ec'], floor: '#c0c5cf', horizon: 0.6,
      words: ['minimal', 'studio', 'clean', 'white', 'simple', 'even', 'shadow', 'lighting', 'background'] },
    { id: '17730', tile: 'tile-ocean', sky: ['#cfe6f5', '#dcedf8'], floor: '#9fc6df', horizon: 0.56, sun: '#ffffff',
      words: ['blue', 'ocean', 'sea', 'summer', 'beach', 'cool', 'water', 'sky', 'fresh'] },
    { id: '11208', tile: 'tile-marble', sky: ['#ecebee', '#f2f1f4'], floor: '#d6d3da', horizon: 0.6,
      words: ['marble', 'luxury', 'elegant', 'stone', 'premium', 'clean', 'minimal'] },
    { id: '19944', tile: 'tile-night', sky: ['#3b3355', '#463d63'], floor: '#2a2440', horizon: 0.6, lights: true,
      words: ['dark', 'night', 'luxury', 'gold', 'dramatic', 'christmas', 'lights', 'moody'] },
    { id: '05561', tile: 'tile-snow', sky: ['#e6ecf3', '#eef2f7'], floor: '#f7f9fc', horizon: 0.6, snow: true,
      words: ['christmas', 'winter', 'snow', 'holiday', 'festive', 'cozy', 'white', 'cold'] },
];

// =========================================================
// API: API_BASE가 있으면 실제 서버, 없으면 가짜 응답
// =========================================================
const api = {
    get isMock() {
        return !API_BASE;
    },

    async readiness() {
        if (this.isMock) {
            const mock = { status: 'CPU_MOCK', message: '서버 연결 전 · 가짜 데이터' };
            return { search: mock, text_only: mock, reference: mock, segmentation: { status: 'READY_NOT_RUN', message: '' }, translation: false };
        }
        return request('/readiness');
    },

    async search(query) {
        if (this.isMock) {
            await wait(700);
            if (hasHangul(query)) {
                throw new Error('번역 설정이 없어 한국어 문장은 검색할 수 없어요. 영어로 적어 주세요.');
            }
            return mockSearch(query);
        }
        return request('/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });
    },

    async generate(payload) {
        if (this.isMock) {
            await wait(1200);
            return mockGenerate(payload);
        }
        const data = new FormData();
        data.append('product', payload.file);
        if (payload.mask) data.append('mask', payload.mask);
        data.append('query', payload.query);
        if (payload.sessionId) data.append('session_id', payload.sessionId);
        if (payload.options.mode === 'reference') {
            data.append('selected', String(payload.selected)); // 참조는 순번으로만 보낸다
        }
        data.append('mode', payload.options.mode);
        data.append('steps', String(payload.options.steps));
        data.append('seed', String(payload.options.seed));
        data.append('adapter_scale', String(payload.options.adapterScale));
        data.append('explicit_fallback', String(payload.options.fallback));
        data.append('product_scale', String(payload.options.productScale));
        data.append('center_x', String(payload.options.centerX));
        data.append('center_y', String(payload.options.centerY));
        return request('/generate', { method: 'POST', body: data });
    },

    async release() {
        if (this.isMock) {
            await wait(300);
            return { ok: true };
        }
        return request('/release', { method: 'POST' });
    },
};

async function request(path, options = {}) {
    const res = await fetch(API_BASE + path, options);
    let body = null;
    try {
        body = await res.json();
    } catch (e) {
        body = null;
    }
    if (!res.ok) {
        const msg = (body && (body.message || body.detail)) || `서버 오류 (${res.status})`;
        throw new Error(msg);
    }
    return body;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasHangul(text) {
    return /[ㄱ-ㆎ가-힣]/.test(text);
}

// 애니메이션 이미지인지 확인 (APNG의 acTL, 움직이는 WebP의 ANIM 조각)
async function isAnimated(file) {
    if (file.type !== 'image/png' && file.type !== 'image/webp') return false;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const find = (tag, limit) => {
        const t = [...tag].map((c) => c.charCodeAt(0));
        const end = Math.min(bytes.length - 4, limit);
        for (let i = 0; i < end; i++) {
            if (bytes[i] === t[0] && bytes[i + 1] === t[1] && bytes[i + 2] === t[2] && bytes[i + 3] === t[3]) return i;
        }
        return -1;
    };
    if (file.type === 'image/png') {
        const actl = find('acTL', bytes.length);
        const idat = find('IDAT', bytes.length);
        return actl !== -1 && (idat === -1 || actl < idat);
    }
    return find('ANIM', 4096) !== -1;
}

// 투명 배경(알파)이 있는 사진인지 확인
function hasAlpha(img) {
    const c = document.createElement('canvas');
    const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 250) return true;
    }
    return false;
}

// 문장 → 단어 목록
function words(text) {
    return text.toLowerCase().match(/[a-z]+/g) || [];
}

// CLIP 토큰 수 대략 추정 (정확한 값은 서버가 다시 검사)
function estimateTokens(text) {
    const w = text.trim().match(/[A-Za-z]+|\d+|[^\sA-Za-z\d]/g) || [];
    return Math.ceil(w.length * 1.15);
}

// 같은 입력이면 같은 숫자를 내는 간단한 난수
function seededRandom(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function hashText(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function scoreGallery(query) {
    const q = new Set(words(query));
    return MOCK_GALLERY
        .map((item) => {
            const overlap = item.words.filter((w) => q.has(w)).length;
            const jitter = seededRandom(hashText(query + item.id))() * 0.012;
            return { item, score: Math.min(0.35, 0.2 + overlap * 0.022 + jitter) };
        })
        .sort((a, b) => b.score - a.score);
}

function mockSearch(query) {
    const hits = scoreGallery(query)
        .slice(0, 5)
        .map((h, i) => ({ rank: i + 1, score: Number(h.score.toFixed(4)), image_id: h.item.id, mock: h.item }));

    return { session_id: `mock-${Date.now()}`, query, source_query: null, hits, status: 'CPU_MOCK' };
}

// =========================================================
// 캔버스 그리기 도우미
// =========================================================

// 제품 사진을 캔버스 안에 놓을 상자 (가장 긴 변 = 크기 × 512)
function productBox(img, options) {
    const longest = options.productScale * CANVAS;
    const ratio = img ? img.naturalWidth / img.naturalHeight : 0.45;
    const w = ratio >= 1 ? longest : longest * ratio;
    const h = ratio >= 1 ? longest / ratio : longest;
    const x = options.centerX * CANVAS - w / 2;
    const y = options.centerY * CANVAS - h / 2;
    const inside = x >= 0 && y >= 0 && x + w <= CANVAS && y + h <= CANVAS;
    return { x, y, w, h, inside };
}

function paintScene(ctx, item, seed) {
    const rand = seededRandom(seed);
    const hy = item.horizon * CANVAS;

    const sky = ctx.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, item.sky[0]);
    sky.addColorStop(1, item.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS, hy);
    ctx.fillStyle = item.floor;
    ctx.fillRect(0, hy, CANVAS, CANVAS - hy);

    ctx.save();
    ctx.filter = 'blur(10px)';
    if (item.sun) {
        ctx.fillStyle = item.sun;
        ctx.beginPath();
        ctx.arc(CANVAS * (0.6 + rand() * 0.25), CANVAS * (0.15 + rand() * 0.1), 60, 0, Math.PI * 2);
        ctx.fill();
    }
    if (item.leaves) {
        ctx.fillStyle = '#9fbf8c';
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(rand() * CANVAS, rand() * hy * 0.9, 30 + rand() * 50, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (item.lights || item.snow) {
        ctx.filter = 'blur(2px)';
        ctx.fillStyle = item.lights ? '#ffd68c' : '#ffffff';
        for (let i = 0; i < 26; i++) {
            ctx.beginPath();
            ctx.arc(rand() * CANVAS, rand() * hy, 2 + rand() * 5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawShadow(ctx, box) {
    ctx.save();
    ctx.filter = 'blur(10px)';
    ctx.fillStyle = 'rgba(40, 30, 60, 0.28)';
    ctx.beginPath();
    ctx.ellipse(box.x + box.w / 2, box.y + box.h, box.w * 0.45, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function makeCanvas() {
    const c = document.createElement('canvas');
    c.width = CANVAS;
    c.height = CANVAS;
    return c;
}

// 가짜 생성: 참조 장면 위에 제품 사진을 그대로 올림 (AI 생성 아님)
function mockGenerate({ productImg, hit, options, query }) {
    const box = productBox(productImg, options);
    // 문장만 사용: 문장과 가장 비슷한 장면을 배경으로 (가짜)
    const scene = options.mode === 'reference' && hit ? hit.mock : scoreGallery(query)[0].item;

    const out = makeCanvas();
    const ctx = out.getContext('2d');
    paintScene(ctx, scene, options.seed);
    drawShadow(ctx, box);
    ctx.drawImage(productImg, box.x, box.y, box.w, box.h);

    const fg = makeCanvas();
    fg.getContext('2d').drawImage(productImg, box.x, box.y, box.w, box.h);

    // 보존 마스크: 제품이 있는 곳 = 흰색
    const keep = makeCanvas();
    const kctx = keep.getContext('2d');
    const alpha = fg.getContext('2d').getImageData(0, 0, CANVAS, CANVAS);
    const mask = kctx.createImageData(CANVAS, CANVAS);
    const repaintData = kctx.createImageData(CANVAS, CANVAS);
    for (let i = 0; i < alpha.data.length; i += 4) {
        const v = alpha.data[i + 3] > 0 ? 255 : 0;
        mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = v;
        mask.data[i + 3] = 255;
        repaintData.data[i] = repaintData.data[i + 1] = repaintData.data[i + 2] = 255 - v;
        repaintData.data[i + 3] = 255;
    }
    kctx.putImageData(mask, 0, 0);
    const repaint = makeCanvas();
    repaint.getContext('2d').putImageData(repaintData, 0, 0);

    const experiment = options.mode === 'reference' ? 'reference' : 'text_only';
    return {
        status: 'CPU_MOCK',
        message: 'CPU_MOCK · 진단용, AI 생성 결과 아님',
        result_url: out.toDataURL('image/png'),
        foreground_url: fg.toDataURL('image/png'),
        keep_mask_url: keep.toDataURL('image/png'),
        repaint_mask_url: repaint.toDataURL('image/png'),
        metadata: {
            status: 'CPU_MOCK',
            mode: options.mode,
            experiment,
            query,
            reference: options.mode === 'reference' && hit ? { rank: hit.rank, image_id: hit.image_id, score: hit.score } : null,
            steps: options.steps,
            seed: options.seed,
            adapter_scale: options.mode === 'reference' ? options.adapterScale : null,
            canvas: { size: CANVAS, product_scale: options.productScale, center_xy: [options.centerX, options.centerY] },
            guidance: 7.5,
            negative_prompt: 'text, watermark, distorted product',
            created_at: new Date().toISOString(),
        },
    };
}

// =========================================================
// 화면
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);

    const el = {
        make: $('make'),
        notice: $('notice'),
        searchForm: $('searchForm'),
        drop: $('drop'),
        imageInput: $('imageInput'),
        preview: $('preview'),
        fileName: $('fileName'),
        clearImage: $('clearImage'),
        maskLabel: $('maskLabel'),
        maskInput: $('maskInput'),
        maskName: $('maskName'),
        clearMask: $('clearMask'),
        prompt: $('prompt'),
        promptCount: $('promptCount'),
        searchBtn: $('searchBtn'),
        searchStatus: $('searchStatus'),
        results: $('results'),
        translated: $('translated'),
        hits: $('hits'),
        generate: $('generate'),
        segNotice: $('segNotice'),
        refZoom: $('refZoom'),
        refZoomLink: $('refZoomLink'),
        refDialog: $('refDialog'),
        refDialogImg: $('refDialogImg'),
        refDialogCap: $('refDialogCap'),
        genForm: $('genForm'),
        genRefThumb: $('genRefThumb'),
        genRefTitle: $('genRefTitle'),
        genRefSub: $('genRefSub'),
        modeRefLabel: $('modeRefLabel'),
        advToggle: $('advToggle'),
        advanced: $('advanced'),
        adapterField: $('adapterField'),
        fallbackField: $('fallbackField'),
        generateBtn: $('generateBtn'),
        placement: $('placement'),
        placementMsg: $('placementMsg'),
        result: $('result'),
        resultImg: $('resultImg'),
        resultBadge: $('resultBadge'),
        resultTitle: $('resultTitle'),
        resultSub: $('resultSub'),
        usedProduct: $('usedProduct'),
        usedProductName: $('usedProductName'),
        usedRefBox: $('usedRefBox'),
        usedRef: $('usedRef'),
        usedRefName: $('usedRefName'),
        downloadPng: $('downloadPng'),
        downloadJson: $('downloadJson'),
        regenerate: $('regenerate'),
        otherRef: $('otherRef'),
        fgImg: $('fgImg'),
        keepImg: $('keepImg'),
        repaintImg: $('repaintImg'),
        metaJson: $('metaJson'),
        releaseBtn: $('releaseBtn'),
    };

    const opt = {
        adapterScale: $('adapterScale'),
        steps: $('steps'),
        seed: $('seed'),
        fallback: $('fallback'),
        productScale: $('productScale'),
        centerX: $('centerX'),
        centerY: $('centerY'),
    };

    const state = {
        readiness: null,
        file: null,
        fileUrl: null,
        productImg: null,
        mask: null,
        alpha: false,    // 투명 배경 PNG인지
        session: null,   // 검색 결과 (서버 세션)
        selected: 0,     // Top-5 중 고른 순번 (0~4)
        jsonUrl: null,
        busy: false,
    };

    // ---------- 상태 문구 ----------
    function setStatus(text, kind = '') {
        el.searchStatus.textContent = text;
        el.searchStatus.className = `make-status ${kind ? `msg-${kind}` : ''}`;
    }

    // ---------- 준비 상태 (단계 0) ----------
    async function loadReadiness() {
        try {
            state.readiness = await api.readiness();
        } catch (e) {
            state.readiness = null;
            showNotice('서버에 연결할 수 없어요. 서버가 켜져 있는지 확인해 주세요.');
            return;
        }
        const r = state.readiness;
        const blocked = ['search', 'text_only', 'reference'].filter((k) => r[k] && r[k].status === 'BLOCKED');

        if (api.isMock || r.search.status === 'CPU_MOCK') {
            showNotice('서버 연결 전이라 가짜 데이터로 동작해요 · 진단용, AI 생성 결과 아님');
        } else if (blocked.length) {
            showNotice(blocked.map((k) => r[k].message).filter(Boolean).join(' · ') || '일부 기능을 지금 쓸 수 없어요.');
        }

        // 참조 생성이 막혀 있으면 선택지를 숨기고 문장만 사용
        if (r.reference && r.reference.status === 'BLOCKED') {
            el.modeRefLabel.hidden = true;
            setMode('text_only');
        }
        if (r.segmentation && r.segmentation.status === 'BLOCKED') {
            // 명세: 일반 사진은 마스크나 투명 PNG가 필요하다고 안내
            el.segNotice.hidden = false;
            el.maskLabel.hidden = false;
            el.maskLabel.classList.remove('is-quiet');
        }
        refresh();
    }

    function showNotice(text) {
        el.notice.textContent = text;
        el.notice.hidden = false;
    }

    function isBlocked(key) {
        const r = state.readiness;
        return Boolean(r && r[key] && r[key].status === 'BLOCKED');
    }

    // ---------- ① 제품 사진 ----------
    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => resolve({ img, url });
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('이미지를 열 수 없어요.'));
            };
            img.src = url;
        });
    }

    async function setProduct(file) {
        if (!file) return;
        if (!LIMITS.types.includes(file.type)) {
            setStatus('PNG, JPEG, WebP 이미지 한 장만 올릴 수 있어요.', 'error');
            return;
        }
        if (file.size > LIMITS.maxBytes) {
            setStatus('20MB 제한을 넘었어요. 더 작은 사진을 올려 주세요.', 'error');
            return;
        }
        if (await isAnimated(file)) {
            setStatus('움직이는 이미지는 쓸 수 없어요. 정지된 사진 한 장을 올려 주세요.', 'error');
            return;
        }
        let loaded;
        try {
            loaded = await loadImage(file);
        } catch (e) {
            setStatus(e.message, 'error');
            return;
        }
        if (loaded.img.naturalWidth * loaded.img.naturalHeight > LIMITS.maxPixels) {
            URL.revokeObjectURL(loaded.url);
            setStatus('20메가픽셀 제한을 넘었어요. 사진 크기를 줄여 주세요.', 'error');
            return;
        }

        if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
        state.file = file;
        state.fileUrl = loaded.url;
        state.productImg = loaded.img;
        state.alpha = file.type !== 'image/jpeg' && hasAlpha(loaded.img);
        clearMask();

        el.preview.src = loaded.url;
        el.preview.hidden = false;
        el.drop.classList.add('has-image');
        el.fileName.textContent = `${file.name} · ${loaded.img.naturalWidth}×${loaded.img.naturalHeight}`;
        el.clearImage.hidden = false;
        el.maskLabel.hidden = false;
        el.generate.hidden = false;

        clearResult('제품 사진이 바뀌었어요.');
        if (el.result.hidden && !state.session) promptMessage();
        drawPlacement();
        refresh();
    }

    function clearProduct() {
        if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
        state.file = null;
        state.fileUrl = null;
        state.productImg = null;
        clearMask();

        el.imageInput.value = '';
        el.preview.removeAttribute('src');
        el.preview.hidden = true;
        el.drop.classList.remove('has-image');
        el.fileName.textContent = '';
        el.clearImage.hidden = true;
        el.maskLabel.hidden = !isBlocked('segmentation');
        el.generate.hidden = !state.session;

        clearResult();
        drawPlacement();
        refresh();
    }

    // 선택 기능: 제품 마스크 (흰색 = 제품, 원본과 같은 크기)
    async function setMask(file) {
        if (!file) return;
        if (file.type !== 'image/png') {
            setStatus('마스크는 PNG 파일만 쓸 수 있어요.', 'error');
            return;
        }
        let loaded;
        try {
            loaded = await loadImage(file);
        } catch (e) {
            setStatus(e.message, 'error');
            return;
        }
        URL.revokeObjectURL(loaded.url);
        const p = state.productImg;
        if (!p || loaded.img.naturalWidth !== p.naturalWidth || loaded.img.naturalHeight !== p.naturalHeight) {
            el.maskInput.value = '';
            setStatus('마스크는 제품 사진과 같은 크기여야 해요.', 'error');
            return;
        }
        state.mask = file;
        el.maskName.textContent = `마스크: ${file.name}`;
        el.maskName.hidden = false;
        el.clearMask.hidden = false;
        el.maskLabel.hidden = true;
        clearResult('마스크가 바뀌었어요.');
        refresh();
    }

    function clearMask() {
        state.mask = null;
        el.maskInput.value = '';
        el.maskName.hidden = true;
        el.clearMask.hidden = true;
        if (state.file) el.maskLabel.hidden = false;
    }

    el.imageInput.addEventListener('change', () => setProduct(el.imageInput.files[0]));
    el.clearImage.addEventListener('click', clearProduct);
    el.maskInput.addEventListener('change', () => setMask(el.maskInput.files[0]));
    el.clearMask.addEventListener('click', () => {
        clearMask();
        clearResult();
        refresh();
    });

    ['dragenter', 'dragover'].forEach((type) => {
        el.drop.addEventListener(type, (e) => {
            e.preventDefault();
            el.drop.classList.add('is-dragover');
        });
    });
    ['dragleave', 'drop'].forEach((type) => {
        el.drop.addEventListener(type, () => el.drop.classList.remove('is-dragover'));
    });
    el.drop.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length !== 1) {
            setStatus('사진은 한 장만 올릴 수 있어요.', 'error');
            return;
        }
        setProduct(e.dataTransfer.files[0]);
    });

    // ---------- ① 스타일 문장 ----------
    function promptCheck() {
        const text = el.prompt.value.trim();
        const tokens = estimateTokens(text);
        if (!text) return { ok: false, msg: '원하는 분위기를 입력해 주세요.' };
        if (text.length > LIMITS.maxChars) return { ok: false, msg: '1000자 이하로 줄여 주세요.' };
        if (tokens > LIMITS.maxTokens) return { ok: false, msg: `문장이 너무 길어요 (약 ${tokens}토큰). CLIP은 77토큰까지만 읽어요.`, over: true };
        if (hasHangul(text) && !(state.readiness && state.readiness.translation)) {
            return { ok: true, msg: '한국어가 섞여 있어요. 서버에 번역 설정이 없으면 거절될 수 있어요.', kind: 'warn' };
        }
        return { ok: true, tokens };
    }

    function updateCount() {
        const text = el.prompt.value;
        const tokens = estimateTokens(text);
        const near = tokens > 60;
        el.promptCount.textContent = near
            ? `토큰 약 ${tokens} / ${LIMITS.maxTokens} · ${text.length} / ${LIMITS.maxChars}`
            : `${text.length} / ${LIMITS.maxChars}`;
        el.promptCount.classList.toggle('is-over', tokens > LIMITS.maxTokens);
    }

    el.prompt.addEventListener('input', () => {
        // 명세: 문장을 바꾸면 검색 결과·선택·생성 결과를 모두 비운다
        const hadSearch = Boolean(state.session);
        if (hadSearch) clearSearch();
        updateCount();
        updateExamples();
        promptMessage(hadSearch ? '문장이 바뀌었어요. 다시 검색해 주세요.' : '');
        refresh();
    });

    // 예시 문장 (1개만, 다른 걸 누르면 교체, 빼는 건 문장에서 직접)
    const cards = Array.from(document.querySelectorAll('.style-card'));
    let currentCaption = null;

    cards.forEach((card) => {
        card.querySelector('.style-desc').textContent = card.dataset.caption;
        card.addEventListener('click', () => {
            const caption = card.dataset.caption;
            if (el.prompt.value.includes(caption)) return;
            if (currentCaption && el.prompt.value.includes(currentCaption)) {
                el.prompt.value = el.prompt.value.replace(currentCaption, caption);
            } else {
                const text = el.prompt.value.trim();
                el.prompt.value = text ? `${text}, ${caption}` : caption;
            }
            currentCaption = caption;
            el.prompt.dispatchEvent(new Event('input'));
        });
    });

    function updateExamples() {
        cards.forEach((card) => {
            const on = el.prompt.value.includes(card.dataset.caption);
            card.classList.toggle('is-selected', on);
            card.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    // ---------- ② 검색 ----------
    el.searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const check = promptCheck();
        if (!check.ok || state.busy) return;

        setBusy(el.searchBtn, true, '검색 중…');
        setStatus('비슷한 광고 사진을 찾고 있어요…');
        try {
            const session = await api.search(el.prompt.value.trim());
            state.session = session;
            state.selected = 0;
            renderHits();
            el.make.classList.add('is-searched');
            el.results.hidden = false;
            el.generate.hidden = false;
            setReferenceAvailable(true);
            setStatus(state.file ? '참조 사진을 고르고 생성해 보세요.' : '생성하려면 제품 사진을 올려 주세요.');
            el.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (err) {
            setStatus(err.message, 'error');
        } finally {
            setBusy(el.searchBtn, false, state.session ? '다시 검색' : '스타일 검색');
            refresh();
        }
    });

    function thumb(hit, className = 'hit-img') {
        if (hit.thumbnail_url) {
            const img = document.createElement('img');
            img.className = className;
            img.src = API_BASE + hit.thumbnail_url;
            img.alt = '';
            return img;
        }
        const span = document.createElement('span');
        span.className = `${className} ${hit.mock.tile}`;
        span.setAttribute('aria-hidden', 'true');
        return span;
    }

    function renderHits() {
        const s = state.session;
        el.hits.innerHTML = '';

        if (s.source_query) {
            el.translated.innerHTML = '';
            el.translated.append('번역: ', s.source_query, ' → ');
            const b = document.createElement('b');
            b.textContent = s.query;
            el.translated.append(b);
            el.translated.hidden = false;
        } else {
            el.translated.hidden = true;
        }

        s.hits.forEach((hit, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'hit';
            btn.setAttribute('aria-pressed', 'false');
            btn.setAttribute('aria-label', `Top ${hit.rank}, 유사도 ${hit.score.toFixed(4)}, 이미지 ${hit.image_id}`);
            btn.append(thumb(hit));

            const check = document.createElement('span');
            check.className = 'hit-check';
            check.textContent = '✓';
            btn.append(check);

            const meta = document.createElement('span');
            meta.className = 'hit-meta';
            meta.innerHTML = `Top ${hit.rank}<span>${hit.score.toFixed(3)} · ${hit.image_id}</span>`;
            btn.append(meta);

            btn.addEventListener('click', () => selectHit(i));
            el.hits.append(btn);
        });
        selectHit(state.selected, true);
    }

    function selectHit(i, silent = false) {
        state.selected = i;
        Array.from(el.hits.children).forEach((btn, j) => {
            btn.classList.toggle('is-selected', j === i);
            btn.setAttribute('aria-pressed', j === i ? 'true' : 'false');
        });
        // 사진을 직접 고르면 참조 사용으로 바꾼다 (처음 기본값은 명세대로 문장만 사용)
        if (!silent && getMode() !== 'reference') {
            setMode('reference');
            clearResult('생성 방식이 바뀌었어요.');
        } else if (!silent) {
            clearResult('참조 사진이 바뀌었어요.');
        }
        updateGenbarText();
    }

    function clearSearch() {
        state.session = null;
        el.results.hidden = true;
        el.make.classList.remove('is-searched');
        el.searchBtn.textContent = '스타일 검색';
        el.generate.hidden = !state.file;
        setReferenceAvailable(false);
        clearResult();
    }

    // 참조 사용은 검색 결과가 있을 때만 고를 수 있다
    function setReferenceAvailable(on) {
        const input = el.modeRefLabel.querySelector('input');
        input.disabled = !on;
        el.modeRefLabel.classList.toggle('is-disabled', !on);
        el.modeRefLabel.title = on ? '' : '스타일 검색을 먼저 해 주세요';
        if (!on && getMode() === 'reference') setMode('text_only');
        updateGenbarText();
    }

    // ---------- 생성 방식 + 고급 설정 ----------
    function getMode() {
        return el.genForm.querySelector('input[name="mode"]:checked').value;
    }

    function setMode(mode) {
        el.genForm.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;
        updateGenbarText();
    }

    function updateGenbarText() {
        const hit = state.session && state.session.hits[state.selected];
        const ref = getMode() === 'reference' && Boolean(hit);

        let t;
        if (ref) {
            t = thumb(hit);
        } else {
            t = document.createElement('span');
            t.className = 'hit-img text-thumb';
            t.setAttribute('aria-hidden', 'true');
            t.textContent = 'Aa';
        }
        t.id = 'genRefThumb';
        el.genRefThumb.replaceWith(t);
        el.genRefThumb = t;

        el.genRefTitle.textContent = ref ? `Top ${hit.rank} 사진으로 생성` : '문장만으로 생성';
        el.genRefSub.textContent = ref ? '참조 사진의 분위기를 따라가요' : '참조 사진 없이 문장만 써요';
        el.refZoom.disabled = !ref;
        el.refZoomLink.hidden = !ref;
        el.adapterField.hidden = !ref;
        el.fallbackField.hidden = !ref;
    }

    // 선택한 참조 크게 보기 (최대 512×512)
    function openRefDialog() {
        const hit = state.session && state.session.hits[state.selected];
        if (!hit) return;
        el.refDialogImg.innerHTML = '';
        const big = hit.preview_url || hit.thumbnail_url
            ? Object.assign(document.createElement('img'), { src: API_BASE + (hit.preview_url || hit.thumbnail_url), alt: '선택한 참조 사진' })
            : thumb(hit, 'ref-big');
        el.refDialogImg.append(big);
        el.refDialogCap.textContent = `Top ${hit.rank} · ${hit.score.toFixed(4)} · ${hit.image_id}`;
        el.refDialog.showModal();
    }

    el.refZoom.addEventListener('click', openRefDialog);
    el.refZoomLink.addEventListener('click', openRefDialog);
    $('refDialogClose').addEventListener('click', () => el.refDialog.close());
    el.refDialog.addEventListener('click', (e) => {
        if (e.target === el.refDialog) el.refDialog.close();
    });

    el.genForm.querySelectorAll('input[name="mode"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            updateGenbarText();
            clearResult('생성 방식이 바뀌었어요.');
        });
    });

    el.advToggle.addEventListener('click', () => {
        const open = el.advanced.hidden;
        el.advanced.hidden = !open;
        el.advToggle.setAttribute('aria-expanded', String(open));
        el.advToggle.firstChild.textContent = open ? '고급 설정 ▾ ' : '고급 설정 ▸ ';
        if (open) drawPlacement();
    });

    function readOptions() {
        return {
            mode: getMode(),
            adapterScale: Number(opt.adapterScale.value),
            steps: Number(opt.steps.value),
            seed: Math.max(0, Math.floor(Number(opt.seed.value) || 0)),
            fallback: opt.fallback.checked,
            productScale: Number(opt.productScale.value),
            centerX: Number(opt.centerX.value),
            centerY: Number(opt.centerY.value),
        };
    }

    const outputs = [
        [opt.adapterScale, $('adapterOut'), 2],
        [opt.steps, $('stepsOut'), 0],
        [opt.productScale, $('scaleOut'), 2],
        [opt.centerX, $('xOut'), 2],
        [opt.centerY, $('yOut'), 2],
    ];

    function syncOutputs() {
        outputs.forEach(([input, out, digits]) => {
            out.textContent = Number(input.value).toFixed(digits);
        });
    }

    [...Object.values(opt)].forEach((input) => {
        input.addEventListener('input', () => {
            syncOutputs();
            drawPlacement();
            clearResult('설정이 바뀌었어요.');
            refresh();
        });
    });

    $('resetOptions').addEventListener('click', () => {
        opt.adapterScale.value = DEFAULTS.adapterScale;
        opt.steps.value = DEFAULTS.steps;
        opt.seed.value = DEFAULTS.seed;
        opt.fallback.checked = DEFAULTS.fallback;
        opt.productScale.value = DEFAULTS.productScale;
        opt.centerX.value = DEFAULTS.centerX;
        opt.centerY.value = DEFAULTS.centerY;
        syncOutputs();
        drawPlacement();
        clearResult('설정이 바뀌었어요.');
        refresh();
    });

    // 배치 미리보기 (사진 전체 크기 기준, 배경 분리 전)
    function drawPlacement() {
        const ctx = el.placement.getContext('2d');
        ctx.clearRect(0, 0, CANVAS, CANVAS);
        const box = productBox(state.productImg, readOptions());

        if (state.productImg) {
            ctx.drawImage(state.productImg, box.x, box.y, box.w, box.h);
        } else {
            ctx.fillStyle = 'rgba(90, 63, 216, 0.25)';
            ctx.fillRect(box.x, box.y, box.w, box.h);
        }
        ctx.strokeStyle = box.inside ? 'rgba(90, 63, 216, 0.8)' : '#c0362c';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.strokeRect(box.x, box.y, box.w, box.h);

        el.placementMsg.textContent = box.inside
            ? '점선 = 사진이 놓일 자리 (배경 분리 전 기준)'
            : '제품이 캔버스 밖으로 나가요. 크기나 위치를 줄여 주세요.';
        el.placementMsg.className = `placement-msg ${box.inside ? '' : 'msg-error'}`;
        return box.inside;
    }

    // ---------- ③ 생성 ----------
    el.genForm.addEventListener('submit', (e) => {
        e.preventDefault();
        generate();
    });

    async function generate() {
        if (state.busy || !canGenerate()) return;
        const options = readOptions();
        const hit = state.session ? state.session.hits[state.selected] : null;

        setBusy(el.generateBtn, true, '생성 중…');
        setStatus('배경을 그리고 있어요… (한 번에 한 명씩 순서대로 처리돼요)');
        try {
            const res = await api.generate({
                file: state.file,
                mask: state.mask,
                productImg: state.productImg,
                // 명세: 생성 프롬프트는 검색에 쓴 영어 문장 (검색 안 했으면 입력한 문장)
                query: state.session ? state.session.query : el.prompt.value.trim(),
                sessionId: state.session ? state.session.session_id : null,
                selected: state.selected,
                hit,
                options,
            });
            showResult(res, options, hit);
            setStatus('완성됐어요!');
        } catch (err) {
            setStatus(err.message, 'error');
        } finally {
            setBusy(el.generateBtn, false, '생성하기');
            refresh();
        }
    }

    function canGenerate() {
        if (!state.file || isBlocked('text_only')) return false;
        const options = readOptions();
        if (options.mode === 'reference' && !state.session) return false;
        if (!state.session) {
            // 검색 없이 문장만으로 생성할 때도 문장 검사는 통과해야 한다
            const check = promptCheck();
            if (!check.ok) return false;
            if (hasHangul(el.prompt.value) && !(state.readiness && state.readiness.translation)) return false;
        }
        // 배경 분리를 못 쓰면 마스크나 투명 PNG가 있어야 한다
        if (isBlocked('segmentation') && !state.mask && !state.alpha) return false;
        return productBox(state.productImg, options).inside;
    }

    // ---------- ④ 결과 ----------
    function url(path) {
        if (!path) return '';
        return path.startsWith('data:') || api.isMock ? path : API_BASE + path;
    }

    function showResult(res, options, hit) {
        const mock = res.status === 'CPU_MOCK';
        el.resultImg.src = url(res.result_url);
        el.resultBadge.textContent = res.message || res.status;
        el.resultBadge.classList.toggle('is-mock', mock);
        el.resultTitle.textContent = mock ? '미리보기를 만들었어요' : '광고 이미지가 완성됐어요';

        let sub = mock
            ? '서버 연결 전이라 참조 장면 위에 사진을 그대로 올린 가짜 결과예요.'
            : '제품은 원본 그대로 두고, 배경만 새로 그렸어요.';
        if (res.metadata && res.metadata.experiment === 'fallback_text_only') {
            sub += ' 참조 생성에 실패해 문장만으로 다시 만들었어요.';
        }
        el.resultSub.textContent = sub;

        el.usedProduct.src = state.fileUrl;
        el.usedProductName.textContent = state.file.name;
        if (options.mode === 'reference' && hit) {
            const t = thumb(hit);
            t.id = 'usedRef';
            el.usedRef.replaceWith(t);
            el.usedRef = t;
            el.usedRefName.textContent = `참조 Top ${hit.rank}`;
            el.usedRefBox.hidden = false;
        } else {
            el.usedRefBox.hidden = true;
        }

        el.downloadPng.href = url(res.result_url);
        el.fgImg.src = url(res.foreground_url);
        el.keepImg.src = url(res.keep_mask_url);
        el.repaintImg.src = url(res.repaint_mask_url);

        const meta = res.metadata || {};
        el.metaJson.textContent = JSON.stringify(meta, null, 2);
        if (state.jsonUrl) URL.revokeObjectURL(state.jsonUrl);
        state.jsonUrl = URL.createObjectURL(new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }));
        el.downloadJson.href = state.jsonUrl;

        el.result.hidden = false;
        el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 명세: 입력·옵션이 바뀌면 이전 결과를 비운다
    function clearResult(reason) {
        if (el.result.hidden) return;
        el.result.hidden = true;
        el.resultImg.removeAttribute('src');
        if (reason) setStatus(`${reason} 다시 생성해 주세요.`);
    }

    el.regenerate.addEventListener('click', () => {
        opt.seed.value = readOptions().seed + 1;
        generate();
    });

    el.otherRef.addEventListener('click', () => {
        if (!state.session) {
            el.prompt.focus();
            setStatus('참조 사진을 쓰려면 먼저 스타일 검색을 해 주세요.');
            return;
        }
        el.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const next = el.hits.children[(state.selected + 1) % el.hits.children.length];
        if (next) next.focus();
    });

    el.releaseBtn.addEventListener('click', async () => {
        setBusy(el.releaseBtn, true, '해제 중…');
        try {
            await api.release();
            setStatus('모델을 메모리에서 내렸어요. 다음 검색·생성은 조금 느릴 수 있어요.');
        } catch (err) {
            setStatus(err.message, 'error');
        } finally {
            setBusy(el.releaseBtn, false, '모델 메모리 해제');
        }
    });

    // ---------- 버튼 상태 ----------
    function setBusy(btn, busy, label) {
        state.busy = busy;
        btn.classList.toggle('is-loading', busy);
        btn.textContent = label;
    }

    function refresh() {
        const check = promptCheck();
        el.searchBtn.disabled = state.busy || !check.ok || isBlocked('search');
        el.generateBtn.disabled = state.busy || !canGenerate();
    }

    // 문장 상태에 맞는 안내 (오류·경고가 있으면 그게 먼저)
    function promptMessage(fallback) {
        const check = promptCheck();
        if (!el.prompt.value.trim()) {
            setStatus(fallback || '제품 사진과 원하는 분위기를 입력해 주세요.');
        } else if (!check.ok) {
            setStatus(check.msg, 'error');
        } else if (check.kind === 'warn') {
            setStatus(check.msg, 'warn');
        } else {
            setStatus(fallback || (state.session
                ? '참조 사진을 고르고 생성해 보세요.'
                : state.file
                    ? '스타일 검색으로 참조 사진을 찾거나, 문장만으로 바로 생성할 수 있어요.'
                    : '준비됐어요! 검색을 눌러 보세요.'));
        }
    }

    syncOutputs();
    updateCount();
    drawPlacement();
    loadReadiness();
});
