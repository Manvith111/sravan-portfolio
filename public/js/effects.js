// Visual effects for the visitor page: glossy 3D tilt, scroll reveals, drag-and-wheel rails,
// a scroll-driven motion track, 3D depth on scroll and a progress bar.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const scrollListeners = new Set();
let frameQueued = false;

function runScrollListeners() {
  frameQueued = false;
  for (const listener of scrollListeners) listener();
}

function requestScrollFrame() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(runScrollListeners);
}

export function onScrollFrame(listener) {
  scrollListeners.add(listener);
  listener();
}

window.addEventListener('scroll', requestScrollFrame, { passive: true });
window.addEventListener('resize', requestScrollFrame);

function addGlossLayer(element) {
  if (element.querySelector(':scope > .gloss')) return;
  const gloss = document.createElement('span');
  gloss.className = 'gloss';
  gloss.setAttribute('aria-hidden', 'true');
  element.append(gloss);
}

// Elements with data-tilt follow the pointer in 3D and show a glossy highlight under it.
export function attachTilt(root) {
  if (reduceMotion.matches) return;
  root.querySelectorAll('[data-tilt]').forEach((element) => {
    if (element.dataset.tiltReady) return;
    element.dataset.tiltReady = '1';
    element.classList.add('tilt');
    addGlossLayer(element);
    const strength = Number(element.dataset.tilt) || 10;

    element.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const box = element.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      element.style.setProperty('--rx', `${((0.5 - y) * strength).toFixed(2)}deg`);
      element.style.setProperty('--ry', `${((x - 0.5) * strength).toFixed(2)}deg`);
      element.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
      element.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
    });

    element.addEventListener('pointerleave', () => {
      element.style.setProperty('--rx', '0deg');
      element.style.setProperty('--ry', '0deg');
    });
  });
}

export function attachReveal(root) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );
  root.querySelectorAll('.reveal:not(.in)').forEach((element) => observer.observe(element));
}

// Horizontal rail: arrow buttons, mouse-wheel and mouse-drag scrolling, plus a progress bar.
export function attachRail(wrap) {
  const rail = wrap.querySelector('.rail');
  const previous = wrap.querySelector('.rail-btn.prev');
  const next = wrap.querySelector('.rail-btn.next');
  const bar = wrap.querySelector('.rail-progress span');
  const stepSize = () => Math.max(260, rail.clientWidth * 0.8);

  previous.addEventListener('click', () => rail.scrollBy({ left: -stepSize(), behavior: 'smooth' }));
  next.addEventListener('click', () => rail.scrollBy({ left: stepSize(), behavior: 'smooth' }));

  // Arrows appear only on a side that has more videos to scroll to.
  const updateArrows = () => {
    const hasOverflow = rail.scrollWidth - rail.clientWidth > 1;
    previous.hidden = !hasOverflow || rail.scrollLeft <= 1;
    next.hidden = !hasOverflow || rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1;
  };

  const updateProgress = () => {
    const visible = rail.scrollWidth > 0 ? rail.clientWidth / rail.scrollWidth : 1;
    const maxScroll = rail.scrollWidth - rail.clientWidth;
    const ratio = maxScroll > 0 ? rail.scrollLeft / maxScroll : 0;
    bar.style.width = `${Math.min(100, visible * 100)}%`;
    bar.style.left = `${ratio * (1 - visible) * 100}%`;
    updateArrows();
  };
  rail.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  wrap.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const atStart = rail.scrollLeft <= 0;
      const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1;
      if ((event.deltaY > 0 && atEnd) || (event.deltaY < 0 && atStart)) return;
      event.preventDefault();
      rail.scrollLeft += event.deltaY;
    },
    { passive: false }
  );

  let dragging = false;
  let startX = 0;
  let startScroll = 0;
  let movedDistance = 0;

  rail.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    dragging = true;
    movedDistance = 0;
    startX = event.clientX;
    startScroll = rail.scrollLeft;
    rail.classList.add('dragging');
  });

  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const delta = event.clientX - startX;
    movedDistance = Math.max(movedDistance, Math.abs(delta));
    rail.scrollLeft = startScroll - delta;
  });

  window.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    rail.classList.remove('dragging');
  });

  // A drag should not also open the card under the pointer.
  rail.addEventListener(
    'click',
    (event) => {
      if (movedDistance <= 5) return;
      event.stopPropagation();
      event.preventDefault();
    },
    true
  );
}

// Phones and small screens: pinning a full-height box leaves large empty bands, so the strip becomes a plain swipeable row.
const compactQuery = window.matchMedia('(max-width: 900px)');

// Motion graphics: the section is pinned while the page scrolls, and the track slides sideways with it.
export function attachMotionTrack(outer) {
  if (reduceMotion.matches || compactQuery.matches) {
    outer.classList.add('reduced');
    return;
  }
  const sticky = outer.querySelector('.motion-sticky');
  const track = outer.querySelector('.motion-track');
  const bar = outer.querySelector('.motion-bar span');
  const items = [...track.querySelectorAll('.motion-item')];

  // The pinned strip is as tall as its content, so the scroll length is that height plus the sideways distance.
  const layout = () => {
    const distance = Math.max(0, track.scrollWidth - sticky.clientWidth);
    outer.style.height = `${sticky.offsetHeight + distance}px`;
  };

  const update = () => {
    const distance = Math.max(1, track.scrollWidth - sticky.clientWidth);
    const scrolledIntoSection = -outer.getBoundingClientRect().top;
    const span = Math.max(1, outer.offsetHeight - sticky.offsetHeight);
    const progress = Math.min(1, Math.max(0, scrolledIntoSection / span));
    track.style.transform = `translate3d(${(-progress * distance).toFixed(1)}px, 0, 0)`;

    const center = window.innerWidth / 2;
    for (const item of items) {
      const box = item.getBoundingClientRect();
      const offset = Math.abs(box.left + box.width / 2 - center) / window.innerWidth;
      item.style.setProperty('--s', Math.max(0.84, 1 - offset * 0.35).toFixed(3));
    }

    bar.style.transform = `scaleX(${progress.toFixed(4)})`;
  };

  window.addEventListener('resize', layout);
  // Media sizes arrive after load, so the strip can grow; keep the scroll length in step with it.
  new ResizeObserver(layout).observe(sticky);
  layout();
  onScrollFrame(update);
}

// AI video: as the cards move along the strip, each one turns in 3D, grows toward the middle and fades at the edges.
export function attachDepthRail(wrap) {
  if (reduceMotion.matches) return;
  const rail = wrap.querySelector('.rail');
  const cards = [...rail.querySelectorAll('.rail-card')];

  const update = () => {
    const box = rail.getBoundingClientRect();
    const center = box.left + box.width / 2;
    const half = Math.max(1, box.width / 2);
    for (const card of cards) {
      const cardBox = card.getBoundingClientRect();
      const offset = Math.max(-1, Math.min(1, (cardBox.left + cardBox.width / 2 - center) / half));
      const magnitude = Math.abs(offset);
      card.style.setProperty('--ry', `${(-offset * 28).toFixed(2)}deg`);
      card.style.setProperty('--sc', (1 - magnitude * 0.12).toFixed(3));
      card.style.setProperty('--op', (1 - magnitude * 0.45).toFixed(3));
    }
  };

  rail.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  onScrollFrame(update);
}

export function attachScrollProgress(bar) {
  onScrollFrame(() => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = maxScroll > 0 ? window.scrollY / maxScroll : 0;
    bar.style.transform = `scaleX(${ratio.toFixed(4)})`;
  });
}

// Moves the profile photo slightly slower than the page for depth.
export function attachParallax(element) {
  if (reduceMotion.matches) return;
  onScrollFrame(() => {
    const offset = Math.min(window.scrollY, 900) * 0.18;
    element.style.setProperty('--py', `${offset.toFixed(1)}px`);
  });
}
