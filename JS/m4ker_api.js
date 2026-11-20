// =========================================================
// m4ker 백엔드(CLIP-AdStyle) 연결
// - 서버 주소 찾기: ?api=주소 → 저장된 주소 → 지금 페이지를 띄운 서버 → http://127.0.0.1:8000
// - 모든 요청은 JSON 오류({error})를 사람이 읽을 문장으로 바꿔서 던짐
// 백엔드 실행법: CLIP-AdStyle 저장소의 docs/WEB_FRONT.md
// =========================================================
const M4kerApi = (() => {
    const DEFAULT_BASE = 'http://127.0.0.1:8000';
    const STORAGE_KEY = 'm4ker.apiBase';
    let base = null;

    function readStored() {
        try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
    }

    function store(value) {
        try {
            if (value) localStorage.setItem(STORAGE_KEY, value);
            else localStorage.removeItem(STORAGE_KEY);
        } catch { /* 저장 못 해도 동작은 함 */ }
    }

    function clean(url) {
        return String(url).trim().replace(/\/+$/, '');
    }

    // 후보 주소 목록 (중복 제거)
    function candidates() {
        const list = [];
        const fromQuery = new URLSearchParams(location.search).get('api');
        if (fromQuery === 'reset') store(null);
        else if (fromQuery) { store(clean(fromQuery)); list.push(clean(fromQuery)); }
        const saved = readStored();
        if (saved) list.push(saved);
        if (window.M4KER_API_BASE) list.push(clean(window.M4KER_API_BASE));
        if (location.protocol.startsWith('http')) list.push(location.origin);
        list.push(DEFAULT_BASE);
        return [...new Set(list)];
    }

    async function probe(url) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2500);
        try {
            const res = await fetch(`${url}/api/health`, { signal: ctrl.signal });
            if (!res.ok) return false;
            const body = await res.json();
            return body && body.ok === true;
        } catch {
            return false;
        } finally {
            clearTimeout(timer);
        }
    }

    // 살아 있는 서버를 찾아 고정. 못 찾으면 null
    async function connect() {
        for (const url of candidates()) {
            if (await probe(url)) {
                base = url;
                return base;
            }
        }
        base = null;
        return null;
    }

    function url(path) {
        if (!path) return null;
        if (/^https?:\/\//.test(path)) return path;
        return `${base || DEFAULT_BASE}${path}`;
    }

    async function request(path, options = {}) {
        let res;
        try {
            res = await fetch(url(path), options);
        } catch {
            throw new Error('생성 서버에 연결할 수 없어요. 서버가 켜져 있는지 확인해 주세요.');
        }
        let body = null;
        try { body = await res.json(); } catch { /* JSON이 아닌 응답 */ }
        if (!res.ok) {
            const detail = body && (body.error || (Array.isArray(body.detail) ? body.detail.map((d) => d.msg).join(', ') : body.detail));
            throw new Error(detail || `서버 오류 (${res.status})`);
        }
        return body;
    }

    function postJson(path, data) {
        return request(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    }

    return {
        connect,
        url,
        get base() { return base; },
        readiness: () => request('/api/readiness'),
        search: (query) => postJson('/api/search', { query }),
        setVersion: (name) => postJson('/api/version', { name }),
        release: () => postJson('/api/release', {}),
        generate: (formData) => request('/api/generate', { method: 'POST', body: formData }),
    };
})();
