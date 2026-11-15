// =========================================================
// m4ker 입력 페이지
// 1. 제품 사진 업로드 + 미리보기
// 2. 예시 스타일 1개 선택 → 프롬프트에 캡션 추가
// 3. 프롬프트 글자 수 + 생성 버튼 활성화
// 4. 백엔드 연결: 스타일 검색(Top-5) → 참조 선택 → 생성 결과
// =========================================================

// =========================================================
// 1. 제품 사진 업로드
//    클릭해서 고르기 + 끌어다 놓기 둘 다 지원
// =========================================================
function initUpload(onChange) {
    const drop = document.getElementById('drop');
    const input = document.getElementById('imageInput');
    const preview = document.getElementById('preview');
    const fileRow = document.getElementById('fileRow');
    const fileName = document.getElementById('fileName');
    const clearBtn = document.getElementById('clearImage');

    let previewUrl = null;
    let currentFile = null;

    function showFile(file) {
        if (!file || !file.type.startsWith('image/')) return;

        if (previewUrl) URL.revokeObjectURL(previewUrl); // 이전 미리보기 메모리 해제
        previewUrl = URL.createObjectURL(file);
        currentFile = file;

        preview.src = previewUrl;
        preview.hidden = false;
        drop.classList.add('has-image');
        fileName.textContent = file.name;
        fileRow.hidden = false;
        onChange();
    }

    function clearFile() {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        currentFile = null;

        input.value = '';
        preview.removeAttribute('src');
        preview.hidden = true;
        drop.classList.remove('has-image');
        fileRow.hidden = true;
        onChange();
    }

    input.addEventListener('change', () => showFile(input.files[0]));

    // 끌어다 놓기
    ['dragenter', 'dragover'].forEach((type) => {
        drop.addEventListener(type, (e) => {
            e.preventDefault();
            drop.classList.add('is-dragover');
        });
    });
    ['dragleave', 'drop'].forEach((type) => {
        drop.addEventListener(type, () => drop.classList.remove('is-dragover'));
    });
    drop.addEventListener('drop', (e) => {
        e.preventDefault();
        showFile(e.dataTransfer.files[0]);
    });

    clearBtn.addEventListener('click', clearFile);

    return () => currentFile; // 지금 고른 파일을 꺼내 쓰는 함수
}

// =========================================================
// 2. 예시 스타일 → 프롬프트
//    - 한 번에 하나만 들어감
//    - 다른 카드를 누르면 이전 캡션을 새 캡션으로 바꿈
//    - 같은 카드를 다시 눌러도 빠지지 않음 (프롬프트에서 직접 지우기)
// =========================================================
function initStyles(onChange) {
    const prompt = document.getElementById('prompt');
    const cards = Array.from(document.querySelectorAll('.style-card'));
    let current = null; // 지금 프롬프트에 들어 있는 캡션

    function updateSelected() {
        cards.forEach((card) => {
            const inPrompt = prompt.value.includes(card.dataset.caption);
            card.classList.toggle('is-selected', inPrompt);
            card.setAttribute('aria-pressed', inPrompt ? 'true' : 'false');
        });
    }

    cards.forEach((card) => {
        card.addEventListener('click', () => {
            const caption = card.dataset.caption;
            if (prompt.value.includes(caption)) return; // 이미 들어가 있으면 그대로

            if (current && prompt.value.includes(current)) {
                prompt.value = prompt.value.replace(current, caption); // 이전 스타일 교체
            } else {
                const text = prompt.value.trim().replace(/[,\s]+$/, ''); // 끝 쉼표 중복 방지
                prompt.value = text ? `${text}, ${caption}` : caption;
            }

            current = caption;
            updateSelected();
            onChange();
        });
    });

    // 직접 지우면 카드 선택 표시도 꺼지게
    prompt.addEventListener('input', updateSelected);
    updateSelected();
}


// =========================================================
// 3·4. 생성 버튼 + 백엔드 연결
//   - 페이지가 열리면 서버를 찾고 기능별 준비 상태를 받아옴
//   - 생성하기: (프롬프트가 바뀌었으면) 비슷한 스타일 Top-5 검색 → 고른 참조로 생성
//   - GPU가 없는 서버는 생성이 꺼져 있으므로 검색 결과만 보여줌
// =========================================================
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;

document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    const form = $('makeForm');
    const prompt = $('prompt');
    const count = $('promptCount');
    const button = $('generateBtn');
    const status = $('makeStatus');

    const ui = {
        pill: $('serverPill'),
        pillText: $('serverText'),
        notice: $('serverNotice'),
        results: $('results'),
        queryLine: $('queryLine'),
        refs: $('refs'),
        frame: $('resultFrame'),
        msg: $('resultMsg'),
        links: $('resultLinks'),
        dlImage: $('downloadImage'),
        dlMeta: $('downloadMeta'),
        masks: $('masks'),
        warn: $('warn'),
        modeHint: $('modeHint'),
        versionOpt: $('versionOpt'),
        versionSelect: $('versionSelect'),
    };

    const state = {
        connected: false,
        info: null,          // /api/readiness 응답
        canSearch: false,
        canGenerate: false,
        canReference: false,
        session: null,       // { id, prompt, data }
        selected: 0,
        busy: false,
    };

    // ---------- 서버 연결 ----------
    function setPill(kind, text) {
        ui.pill.dataset.state = kind;
        ui.pillText.textContent = text;
    }

    function showNotice(html) {
        ui.notice.innerHTML = html;
        ui.notice.hidden = !html;
    }

    async function connect() {
        setPill('checking', '서버 확인 중…');
        const base = await M4kerApi.connect();
        if (!base) {
            state.connected = false;
            setPill('off', '서버 꺼짐');
            showNotice(
                '생성 서버에 연결할 수 없어요. CLIP-AdStyle 저장소에서 ' +
                '<code>.venv/bin/python server.py --mock --front-dir ../Front</code> 처럼 서버를 켠 뒤 ' +
                '<button type="button" class="text-btn" id="retryConnect">다시 연결</button> 을 눌러 주세요. ' +
                '다른 주소의 서버는 주소 뒤에 <code>?api=http://주소:포트</code> 를 붙이면 돼요.'
            );
            $('retryConnect').addEventListener('click', connect);
            refresh();
            return;
        }
        try {
            const info = await M4kerApi.readiness();
            applyReadiness(info);
        } catch (err) {
            state.connected = false;
            setPill('off', '서버 오류');
            showNotice(escapeHtml(err.message));
        }
        refresh();
    }

    function applyReadiness(info) {
        const r = info.readiness;
        state.info = info;
        state.connected = true;
        state.canSearch = r.search.status !== 'BLOCKED';
        state.canGenerate = r.text_only.status !== 'BLOCKED';
        state.canReference = state.canGenerate && state.canSearch && r.reference.status !== 'BLOCKED';

        if (state.canSearch && state.canGenerate) setPill('ok', info.mock ? '연결됨 · 진단 모드' : '연결됨');
        else if (state.canSearch) setPill('partial', '연결됨 · 스타일 검색만');
        else if (state.canGenerate) setPill('partial', '연결됨 · 생성만');
        else setPill('off', '연결됨 · 사용 불가');

        const notes = [];
        if (info.mock) notes.push('<b>진단 모드(CPU MOCK)</b>예요. 학습 안 된 작은 모델이라 결과는 AI 생성 결과가 아니에요.');
        if (!state.canSearch) notes.push('스타일 검색이 꺼져 있어요: ' + escapeHtml(r.search.message));
        if (!state.canGenerate) notes.push('이 서버는 GPU 생성이 꺼져 있어서 <b>비슷한 광고 스타일 찾기</b>까지만 돼요.');
        showNotice(notes.join('<br>'));

        ui.results.classList.toggle('search-only', !state.canGenerate);
        $('refsHint').textContent = state.canGenerate
            ? '하나를 고르고 생성하기를 누르면 그 사진을 참고해요. 점수는 비슷한 정도이고 품질 점수가 아니에요.'
            : '프롬프트와 비슷한 실제 광고 사진이에요. 점수는 비슷한 정도이고 품질 점수가 아니에요.';

        // 생성 방식: 참고 생성이 안 되면 프롬프트만
        const refRadio = form.ownerDocument.querySelector('input[name="mode"][value="reference"]');
        const textRadio = form.ownerDocument.querySelector('input[name="mode"][value="text_only"]');
        refRadio.disabled = !state.canReference;
        if (!state.canReference) {
            textRadio.checked = true;
            ui.modeHint.textContent = state.canGenerate
                ? '이 서버는 참고 생성이 꺼져 있어요: ' + r.reference.message
                : '이 서버는 생성이 꺼져 있어요.';
        }

        // 검색 모델 버전 (2개 이상일 때만)
        if (info.versions.length > 1) {
            ui.versionSelect.innerHTML = '';
            info.versions.forEach((v) => {
                const opt = new Option(v.label, v.name, false, v.name === info.active_version);
                ui.versionSelect.add(opt);
            });
            ui.versionOpt.hidden = false;
        }
        if (info.warning) ui.warn.textContent = info.warning;
    }

    // ---------- 화면 갱신 ----------
    function promptText() {
        return prompt.value.trim();
    }

    function refresh(keepStatus = false) {
        count.textContent = `${prompt.value.length} / ${prompt.maxLength}`;

        const hasImage = Boolean(getFile());
        const text = promptText();
        const needsImage = state.canGenerate;
        const blockedHangul = state.connected && HANGUL.test(text) && !(state.info && state.info.translation);

        button.textContent = state.connected && !state.canGenerate ? '스타일 찾기' : '생성하기';
        button.disabled = state.busy || !state.connected || !(state.canSearch || state.canGenerate)
            || !text || (needsImage && !hasImage) || blockedHangul;

        if (state.busy || keepStatus) return;
        if (!state.connected) status.textContent = '생성 서버와 연결되면 시작할 수 있어요.';
        else if (needsImage && !hasImage) status.textContent = '제품 사진을 올려 주세요.';
        else if (!text) status.textContent = '프롬프트를 입력하거나 예시 스타일을 골라 주세요.';
        else if (blockedHangul) status.textContent = '이 서버는 한국어 번역이 꺼져 있어요. 영어로 적거나 예시 스타일만 써 주세요.';
        else status.textContent = '준비됐어요!';
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ---------- 4. 비슷한 스타일 ----------
    function renderRefs() {
        const s = state.session;
        ui.refs.innerHTML = '';
        if (!s) {
            ui.queryLine.textContent = state.canSearch ? '프롬프트가 바뀌었어요. 생성하기를 누르면 다시 찾아요.' : '이 서버는 스타일 검색이 꺼져 있어요.';
            return;
        }
        const d = s.data;
        const parts = [];
        if (d.source_query) parts.push(`번역: ${d.source_query} → ${d.query}`);
        if (d.version_label) parts.push(`모델: ${d.version_label}`);
        if (d.status === 'CPU_MOCK') parts.push('진단용 MOCK 검색');
        ui.queryLine.textContent = parts.join(' · ');

        d.hits.forEach((hit, i) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'ref-card' + (i === state.selected ? ' is-selected' : '');
            card.setAttribute('aria-pressed', i === state.selected ? 'true' : 'false');
            card.innerHTML = `<img alt="참고 후보 ${hit.rank}위" loading="lazy"><span class="ref-meta">#${hit.rank} · ${hit.score.toFixed(3)}</span>`;
            card.querySelector('img').src = M4kerApi.url(hit.thumbnail_url);
            card.addEventListener('click', () => {
                state.selected = i;
                renderRefs();
                if (state.canReference) status.textContent = `${hit.rank}위 스타일을 골랐어요. 생성하기를 누르면 이 사진을 참고해요.`;
            });
            ui.refs.appendChild(card);
        });
    }

    function invalidateSearch() {
        if (!state.session) return;
        state.session = null;
        state.selected = 0;
        renderRefs();
    }

    // ---------- 5. 생성 결과 ----------
    function clearResult(text) {
        ui.frame.innerHTML = `<span>${escapeHtml(text || '생성하기를 누르면 여기에 결과가 나와요.')}</span>`;
        ui.msg.textContent = '';
        ui.msg.classList.remove('is-error');
        ui.links.hidden = true;
        ui.masks.hidden = true;
    }

    function showLoading(label) {
        const started = Date.now();
        ui.frame.innerHTML = `<div><div class="spinner"></div><span>${escapeHtml(label)} <span id="elapsed">0</span>초</span></div>`;
        ui.msg.textContent = '';
        ui.links.hidden = true;
        ui.masks.hidden = true;
        const timer = setInterval(() => {
            const el = $('elapsed');
            if (el) el.textContent = Math.round((Date.now() - started) / 1000);
        }, 1000);
        return () => clearInterval(timer);
    }

    function showResult(res) {
        const img = new Image();
        img.alt = '생성된 광고 이미지';
        img.src = M4kerApi.url(res.result_url);
        ui.frame.innerHTML = '';
        ui.frame.appendChild(img);
        ui.msg.classList.remove('is-error');
        ui.msg.textContent = res.message;
        ui.dlImage.href = M4kerApi.url(res.result_url);
        ui.dlImage.setAttribute('download', `m4ker-${res.run_id}.png`);
        ui.dlMeta.href = M4kerApi.url(res.metadata_url);
        ui.links.hidden = false;
        $('fgImg').src = M4kerApi.url(res.foreground_url);
        $('keepImg').src = M4kerApi.url(res.keep_mask_url);
        $('repaintImg').src = M4kerApi.url(res.repaint_mask_url);
        ui.masks.hidden = false;
    }

    function showError(err) {
        ui.msg.classList.add('is-error');
        ui.msg.textContent = err.message;
    }

    // ---------- 세부 설정 ----------
    const ranges = [
        ['productScale', 'scaleOut', 2],
        ['centerX', 'xOut', 2],
        ['centerY', 'yOut', 2],
        ['adapterScale', 'adapterOut', 2],
        ['steps', 'stepsOut', 0],
    ];
    ranges.forEach(([inputId, outId, digits]) => {
        const input = $(inputId);
        const out = $(outId);
        const sync = () => { out.textContent = Number(input.value).toFixed(digits); };
        input.addEventListener('input', sync);
        sync();
    });

    ui.versionSelect.addEventListener('change', async () => {
        try {
            await M4kerApi.setVersion(ui.versionSelect.value);
            invalidateSearch();
            status.textContent = '검색 모델을 바꿨어요. 생성하기를 누르면 다시 찾아요.';
        } catch (err) {
            status.textContent = err.message;
        }
    });

    function generationForm(mode) {
        const data = new FormData();
        data.append('product', getFile());
        const mask = $('maskInput').files[0];
        if (mask) data.append('mask', mask);
        data.append('query', promptText());
        if (state.session) {
            data.append('session_id', state.session.id);
            data.append('selected', String(state.selected));
        }
        data.append('mode', mode);
        data.append('steps', $('steps').value);
        data.append('seed', String(Math.max(0, Math.floor(Number($('seed').value) || 0))));
        data.append('adapter_scale', $('adapterScale').value);
        data.append('product_scale', $('productScale').value);
        data.append('center_x', $('centerX').value);
        data.append('center_y', $('centerY').value);
        data.append('fallback', $('fallback').checked ? 'true' : 'false');
        return data;
    }

    // ---------- 시작 ----------
    const getFile = initUpload(() => {
        if (state.canGenerate && !state.busy) clearResult();
        refresh();
    });
    initStyles(() => { invalidateSearch(); refresh(); });
    prompt.addEventListener('input', () => { invalidateSearch(); refresh(); });
    refresh();
    connect();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (button.disabled) return;
        const text = promptText();
        state.busy = true;
        button.disabled = true;
        ui.results.hidden = false;

        try {
            // 1) 비슷한 스타일 찾기 (프롬프트가 바뀌었을 때만)
            if (state.canSearch && (!state.session || state.session.prompt !== text)) {
                status.textContent = '비슷한 광고 스타일을 찾는 중이에요…';
                const data = await M4kerApi.search(text);
                state.session = { id: data.session_id, prompt: text, data };
                state.selected = 0;
                renderRefs();
            } else if (!state.canSearch) {
                renderRefs();
            }

            // 2) 생성
            if (!state.canGenerate) {
                status.textContent = '스타일 검색 완료!';
                return;
            }
            const wanted = form.ownerDocument.querySelector('input[name="mode"]:checked').value;
            const mode = wanted === 'reference' && state.canReference && state.session ? 'reference' : 'text_only';
            status.textContent = mode === 'reference' ? '고른 스타일을 참고해서 만드는 중이에요…' : '프롬프트로 배경을 만드는 중이에요…';
            const stop = showLoading('광고 이미지를 만드는 중');
            try {
                const res = await M4kerApi.generate(generationForm(mode));
                showResult(res);
                status.textContent = '완성됐어요! 다른 스타일을 골라 다시 만들 수도 있어요.';
            } finally {
                stop();
            }
        } catch (err) {
            if (ui.frame.querySelector('.spinner')) clearResult('생성하지 못했어요.');
            showError(err);
            status.textContent = '문제가 생겼어요. 아래 안내를 확인해 주세요.';
        } finally {
            state.busy = false;
            refresh(true);
        }
    });
});
