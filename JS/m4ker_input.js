// =========================================================
// m4ker 입력 페이지
// 1. 제품 사진 업로드 + 미리보기
// 2. 예시 스타일 1개 선택 → 프롬프트에 캡션 추가
// 3. 프롬프트 글자 수 + 생성 버튼 활성화
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
                const text = prompt.value.trim();
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
// 3. 프롬프트 글자 수 + 생성 버튼
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('makeForm');
    const prompt = document.getElementById('prompt');
    const count = document.getElementById('promptCount');
    const button = document.getElementById('generateBtn');
    const status = document.getElementById('makeStatus');

    function refresh() {
        count.textContent = `${prompt.value.length} / ${prompt.maxLength}`;

        const hasImage = Boolean(getFile());
        const hasPrompt = prompt.value.trim().length > 0;
        button.disabled = !(hasImage && hasPrompt);

        if (!hasImage) status.textContent = '제품 사진을 올려 주세요.';
        else if (!hasPrompt) status.textContent = '프롬프트를 입력하거나 예시 스타일을 골라 주세요.';
        else status.textContent = '준비됐어요!';
    }

    const getFile = initUpload(refresh);
    initStyles(refresh);
    prompt.addEventListener('input', refresh);
    refresh();

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // TODO: 백엔드(생성 서버)가 준비되면 여기서 전송
        // const data = new FormData();
        // data.append('image', getFile());
        // data.append('prompt', prompt.value.trim());
        // fetch('/generate', { method: 'POST', body: data })
        console.log('image:', getFile(), 'prompt:', prompt.value.trim());
        status.textContent = '아직 생성 서버와 연결되지 않았어요. (콘솔에서 입력값 확인)';
    });
});