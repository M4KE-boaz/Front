// =========================================================
// 1. 스크롤하면 나타나는 효과
//    .reveal 요소가 화면에 들어오면 .is-visible 을 붙인다
// =========================================================
function initReveal() {
    const targets = document.querySelectorAll('.reveal');

    if (!('IntersectionObserver' in window)) {
        targets.forEach((el) => el.classList.add('is-visible'));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target); // 한 번 나타나면 계속 보이게
            }
        });
    }, {
        threshold: 0.18,
        rootMargin: '0px 0px -8% 0px',
    });

    targets.forEach((el) => observer.observe(el));
}

// =========================================================
// 2. "왜 m4ker" 카드 슬라이더
//    가운데 카드가 활성, 버튼·점·카드 클릭·좌우 방향키로 이동
// =========================================================
function initWhySlider() {
    const slider = document.getElementById('whySlider');
    const track = document.getElementById('whyTrack');
    const dotsBox = document.getElementById('whyDots');
    const prevBtn = document.getElementById('whyPrev');
    const nextBtn = document.getElementById('whyNext');
    if (!slider || !track) return;

    const cards = Array.from(track.querySelectorAll('.why-card'));
    const count = cards.length;
    if (count === 0) return;

    let current = 0;

    // 점(페이지 표시) 만들기
    const dots = cards.map((card, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'why-dot';
        dot.setAttribute('aria-label', `${i + 1}번째 카드 보기`);
        dot.addEventListener('click', () => goTo(i));
        dotsBox.appendChild(dot);
        return dot;
    });

    function update() {
        const viewport = track.parentElement;
        const cardWidth = cards[0].offsetWidth;
        const gap = parseFloat(getComputedStyle(track).columnGap) || 0;

        const centerOffset = viewport.offsetWidth / 2 - cardWidth / 2;
        const move = (cardWidth + gap) * current;
        track.style.transform = `translateX(${centerOffset - move}px)`;

        cards.forEach((card, i) => {
            const active = i === current;
            card.classList.toggle('is-active', active);
            card.setAttribute('aria-hidden', active ? 'false' : 'true');
        });

        dots.forEach((dot, i) => {
            dot.setAttribute('aria-current', i === current ? 'true' : 'false');
        });
    }

    function goTo(index) {
        current = (index + count) % count;
        update();
    }

    prevBtn.addEventListener('click', () => goTo(current - 1));
    nextBtn.addEventListener('click', () => goTo(current + 1));

    // 옆 카드를 누르면 그 카드로 이동
    cards.forEach((card, i) => {
        card.addEventListener('click', () => {
            if (i !== current) goTo(i);
        });
    });

    // 슬라이더 안에 포커스가 있을 때 방향키로 이동
    slider.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') goTo(current - 1);
        if (e.key === 'ArrowRight') goTo(current + 1);
    });

    window.addEventListener('resize', update);
    update();
}

document.addEventListener('DOMContentLoaded', () => {
    initReveal();
    initWhySlider();
});
