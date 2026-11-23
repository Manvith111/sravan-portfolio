import { h } from './dom.js';
import { applyHeroLayout, followViewport, normalizeLayout } from './layout.js';
import {
  attachTilt,
  attachReveal,
  attachRail,
  attachMotionTrack,
  attachDepthRail,
  attachScrollProgress,
  attachParallax,
} from './effects.js';

const TYPE_NAMES = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  email: 'Email',
  phone: 'Phone',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  facebook: 'Facebook',
  x: 'X',
  website: 'Website',
  other: 'Link',
};

// Title font and size choices from the admin panel. Values are set as CSS variables so the stylesheet does the rest.
const TITLE_FONT_STACKS = {
  anton: "Anton, Impact, 'Arial Narrow', sans-serif",
  courier: "'Courier Prime', 'Courier New', monospace",
  inter: 'Inter, system-ui, sans-serif',
};

const TITLE_SIZE_VALUES = {
  small: 'clamp(14px, 1.3vw, 18px)',
  medium: 'clamp(18px, 1.9vw, 24px)',
  large: 'clamp(24px, 3vw, 36px)',
};

const DEFAULT_GRID_COLUMNS = 3;
// A grid card never gets narrower than this, so titles stay readable; the row count follows the screen width.
const GRID_MIN_CARD_PX = 170;

function applyTitleStyle(profile) {
  const root = document.documentElement.style;
  root.setProperty('--card-title-font', TITLE_FONT_STACKS[profile.titleFont] || TITLE_FONT_STACKS.anton);
  root.setProperty('--card-title-size', TITLE_SIZE_VALUES[profile.titleSize] || TITLE_SIZE_VALUES.medium);
}

// Static icon artwork (stroke-based, 24px grid). Only these fixed strings are ever parsed as markup.
const ICON_PATHS = {
  whatsapp: '<path d="M3 21l1.6-4.6A9 9 0 1 1 8 19.6z"/><path d="M9 10c0 2.8 2.2 5 5 5l1-1.4-2-1-.8.8c-.9-.4-2-1.5-2.4-2.4l.8-.8-1-2z"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.9"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  linkedin: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 11v6M8 8v.01M12 17v-6M12 11c0-1.5 3-2 3 1v5"/>',
  youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9l5 3-5 3z"/>',
  facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>',
  x: '<path d="M4 4l16 16M20 4L4 20"/>',
  website: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  other: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};

function contactIcon(type) {
  const template = document.createElement('template');
  template.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[type] || ICON_PATHS.other}</svg>`;
  return template.content.firstElementChild;
}

const $ = (id) => document.getElementById(id);
const SAFE_HREF = /^(https?:|mailto:|tel:)/i;

function safeHref(href) {
  return typeof href === 'string' && SAFE_HREF.test(href) ? href : undefined;
}

function isWebLink(href) {
  return typeof href === 'string' && /^https?:/i.test(href);
}

function emptyState(text) {
  return h('p', { class: 'empty' }, text);
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Hero ---------------------------------------------------------------------

// Older profiles may lack heroLabels, so fall back to title and tagline.
function renderHeroLabels(profile) {
  const labels = profile.heroLabels?.length ? profile.heroLabels : [profile.title, profile.tagline].filter(Boolean);
  $('heroLabels').replaceChildren(...labels.map((label) => h('span', { class: 'hero-label' }, label)));
}

function renderHero(profile) {
  document.title = `${profile.name} · ${profile.title}`;
  applyTitleStyle(profile);
  $('heroName').textContent = profile.name;
  renderHeroLabels(profile);
  $('heroPhoto').classList.toggle('is-circle', profile.photoShape === 'circle');
  $('heroBio').textContent = profile.bio || '';
  $('footerName').textContent = profile.name;
  $('footerYear').textContent = String(new Date().getFullYear());

  const photo = $('heroPhoto');
  const visual = profile.photo
    ? h('img', { src: profile.photo, alt: profile.name })
    : h('span', { class: 'photo-placeholder' }, initials(profile.name));
  photo.prepend(visual);
  renderHeroLayout(profile);
}

// Canvas layout from the admin panel. Without a saved layout the classic hero stays as it is.
function renderHeroLayout(profile) {
  if (!profile.layout) return;
  const hero = document.querySelector('.hero');
  hero.classList.add('lp-canvas');
  $('heroPhoto').classList.add('lp-frame');
  const nodes = { name: $('heroName'), photo: $('heroPhotoWrap'), labels: $('heroLabels'), bio: $('heroBio') };
  for (const box of normalizeLayout(profile.layout).boxes) {
    const node = h('p', { dataset: { el: box.id } }, box.text);
    hero.append(node);
    nodes[box.id] = node;
  }
  applyHeroLayout(nodes, profile.layout);
  followViewport(hero);
}

function renderNav(categories) {
  $('nav').replaceChildren(
    ...categories.map((category) => h('a', { href: `#cat-${category.slug}` }, category.name)),
    h('a', { href: '#contact' }, 'Contact')
  );
}

// Media and sections --------------------------------------------------------

function renderMedia(item) {
  if (item.mediaType === 'video') {
    const video = h('video', {
      src: item.file,
      // Nothing loads until the card nears the screen (see attachLazyMedia). The poster is kept in a data attribute until then.
      preload: 'none',
      dataset: { posterSrc: item.poster || '' },
      playsinline: true,
      loop: true,
      class: 'media',
    });
    video.muted = true;
    return video;
  }
  return h('img', { src: item.file, alt: item.title, loading: 'lazy', class: 'media' });
}

function openLightbox(item) {
  const content =
    item.mediaType === 'video'
      ? h('video', { src: item.file, controls: true, autoplay: true, playsinline: true })
      : h('img', { src: item.file, alt: item.title });
  $('lightboxBody').replaceChildren(
    h('h2', { class: 'lightbox-title' }, item.title),
    content,
    item.caption ? h('p', { class: 'lightbox-caption' }, item.caption) : null
  );
  $('lightbox').hidden = false;
  document.body.classList.add('no-scroll');
}

function closeLightbox() {
  $('lightbox').hidden = true;
  $('lightboxBody').replaceChildren();
  document.body.classList.remove('no-scroll');
}

// Brand colours used by the preset modes. "auto" starts on brand and switches once the poster has been read.
const BRAND_BOX = { background: '#ffffff', text: '#6955ff' };
const INVERSE_BOX = { background: '#6955ff', text: '#ffffff' };
const colourCache = new Map();

// Automatic colours saved by the admin panel. Without them (older items), the colours are read from the picture on the site.
function savedAutoColours(box) {
  return box.autoBackground && box.autoText ? { background: box.autoBackground, text: box.autoText } : null;
}

function titleBoxColours(box) {
  if (box.colorMode === 'inverse') return INVERSE_BOX;
  if (box.colorMode === 'custom') return { background: box.background, text: box.text };
  if (box.colorMode === 'auto') return savedAutoColours(box) || BRAND_BOX;
  return BRAND_BOX;
}

// The title box under a photo or video: a rounded rectangle placed by the admin's alignment choice.
function titleBoxElement(item) {
  const box = item.titleBox || {};
  const colours = titleBoxColours(box);
  const autoFromPoster = box.colorMode === 'auto' && !savedAutoColours(box);
  const info = h(
    'div',
    {
      class: `card-info align-${box.align || 'centre'} box-${box.boxSize || 'normal'}${box.outline === false ? '' : ' has-outline'}`,
      style: { '--box-bg': colours.background, '--box-fg': colours.text },
      dataset: autoFromPoster ? { autoSource: item.poster || item.file, autoType: item.poster ? 'image' : item.mediaType } : {},
    },
    h(
      'h3',
      {
        style: {
          fontFamily: TITLE_FONT_STACKS[box.font] || TITLE_FONT_STACKS.anton,
          fontSize: TITLE_SIZE_VALUES[box.size] || TITLE_SIZE_VALUES.medium,
          fontWeight: box.bold ? '700' : '400',
          fontStyle: box.italic ? 'italic' : 'normal',
        },
      },
      item.title
    )
  );
  return info;
}

function toHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

// Averages the colour of a small copy of the picture, then picks dark or white text for contrast.
function averageColour(source) {
  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data;
  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return { r: r / pixels, g: g / pixels, b: b / pixels };
}

// Pictures are fetched as data first. A picture drawn straight from another domain would block the colour reading.
async function loadPicture(src, type) {
  if (type === 'video') {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'auto';
      video.crossOrigin = 'anonymous';
      video.addEventListener('loadeddata', () => resolve(video), { once: true });
      video.addEventListener('error', () => reject(new Error('video unavailable')), { once: true });
      video.src = src;
    });
  }
  const response = await fetch(src);
  if (!response.ok) throw new Error('picture unavailable');
  return createImageBitmap(await response.blob());
}

// Returns the box colours for a picture, or null when the picture cannot be read (for example a cross-site file).
async function sampleTitleColours(src, type) {
  if (colourCache.has(src)) return colourCache.get(src);
  let colours = null;
  try {
    const average = averageColour(await loadPicture(src, type));
    const text = (0.299 * average.r + 0.587 * average.g + 0.114 * average.b) / 255 > 0.6 ? '#111111' : '#ffffff';
    colours = { background: toHex(average), text };
  } catch {
    colours = null;
  }
  colourCache.set(src, colours);
  return colours;
}

async function applyAutoTitleColours(info) {
  const colours = await sampleTitleColours(info.dataset.autoSource, info.dataset.autoType);
  if (!colours) return;
  info.style.setProperty('--box-bg', colours.background);
  info.style.setProperty('--box-fg', colours.text);
}

// Posters, video metadata and automatic colours are fetched only for cards close to the screen.
// Each video shows its poster image; a video with no poster loads its first frame once it is near the screen.
const LAZY_ROOT_MARGIN = '300px 0px';

function loadCardMedia(card) {
  const video = card.querySelector('video');
  if (video) {
    const poster = video.dataset.posterSrc;
    if (poster && !video.poster) video.poster = poster;
    if (!poster) video.preload = 'metadata';
  }
  const info = card.querySelector('.card-info[data-auto-source]');
  if (info) applyAutoTitleColours(info);
}

function attachLazyMedia(root) {
  const cards = [...root.querySelectorAll('.card')];
  if (!('IntersectionObserver' in window)) {
    cards.forEach(loadCardMedia);
    return;
  }
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        loadCardMedia(entry.target);
        observer.unobserve(entry.target);
      }),
    { rootMargin: LAZY_ROOT_MARGIN }
  );
  cards.forEach((card) => observer.observe(card));
}

function renderCard(item, extraClass) {
  const isVideo = item.mediaType === 'video';
  const media = renderMedia(item);
  const card = h(
    'article',
    {
      class: `card ${extraClass}`,
      tabindex: '0',
      role: 'button',
      'aria-label': `Open ${item.title}`,
      dataset: { tilt: '9' },
    },
    h('div', { class: 'card-media' }, media),
    titleBoxElement(item)
  );

  card.addEventListener('click', () => openLightbox(item));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') openLightbox(item);
  });
  if (isVideo) {
    card.addEventListener('pointerenter', () => media.play().catch(() => {}));
    card.addEventListener('pointerleave', () => media.pause());
  }
  return card;
}

function renderRail(items, { depth = false } = {}) {
  return h(
    'div',
    { class: depth ? 'rail-wrap depth-rail' : 'rail-wrap' },
    h('button', { class: 'rail-btn prev', type: 'button', 'aria-label': 'Scroll left' }, '←'),
    h('div', { class: 'rail', tabindex: '0' }, items.map((item) => renderCard(item, 'rail-card'))),
    h('button', { class: 'rail-btn next', type: 'button', 'aria-label': 'Scroll right' }, '→'),
    h('div', { class: 'rail-progress' }, h('span'))
  );
}

function renderMotionTrack(items) {
  return h(
    'div',
    { class: 'motion-outer' },
    h(
      'div',
      { class: 'motion-sticky' },
      h(
        'div',
        { class: 'motion-track' },
        items.map((item) => h('div', { class: 'motion-item' }, renderCard(item, 'motion-card')))
      ),
      h('div', { class: 'motion-bar' }, h('span'))
    )
  );
}

// Grid view: the admin's number is the most videos allowed in a row. The real number follows the screen width.
function renderGrid(items, columns = DEFAULT_GRID_COLUMNS) {
  const maxColumns = Math.max(1, Math.round(Number(columns)) || DEFAULT_GRID_COLUMNS);
  return h(
    'div',
    { class: 'grid', dataset: { maxColumns: String(maxColumns) }, style: { '--columns': maxColumns } },
    items.map((item, index) => h('div', { class: 'reveal', style: { '--i': index % 6 } }, renderCard(item, 'grid-card')))
  );
}

// How many cards fit across the grid right now, capped at the admin's maximum. One card when only one fits.
function fitGridColumns(grid) {
  const style = getComputedStyle(grid);
  const inner = grid.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const gap = parseFloat(style.columnGap) || 0;
  const fits = Math.floor((inner + gap) / (GRID_MIN_CARD_PX + gap));
  const maxColumns = Number(grid.dataset.maxColumns) || DEFAULT_GRID_COLUMNS;
  grid.style.setProperty('--columns', String(Math.max(1, Math.min(maxColumns, fits))));
}

function attachGridFit() {
  const grids = [...document.querySelectorAll('.grid')];
  grids.forEach(fitGridColumns);
  if (!('ResizeObserver' in window)) return;
  const observer = new ResizeObserver((entries) => entries.forEach((entry) => fitGridColumns(entry.target)));
  grids.forEach((grid) => observer.observe(grid));
}

function renderTimeline(entries) {
  return h(
    'ol',
    { class: 'timeline' },
    entries.map((entry, index) =>
      h(
        'li',
        { class: `tl-item reveal ${index % 2 ? 'right' : 'left'}`, style: { '--i': index % 3 } },
        h('span', { class: 'tl-dot' }),
        h(
          'article',
          { class: 'tl-card', dataset: { tilt: '6' } },
          entry.period ? h('p', { class: 'tl-period' }, entry.period) : null,
          h('h3', {}, entry.role),
          [entry.company, entry.location].some(Boolean)
            ? h('p', { class: 'tl-company' }, [entry.company, entry.location].filter(Boolean).join(' · '))
            : null,
          entry.description ? h('p', { class: 'tl-desc' }, entry.description) : null
        )
      )
    )
  );
}

function renderSectionBody(category) {
  if (category.effect === 'timeline') {
    const entries = category.experiences || [];
    return entries.length ? renderTimeline(entries) : emptyState('Experience entries appear here once added in the admin panel.');
  }
  const items = category.items || [];
  if (!items.length) return emptyState('Photos and videos for this category appear here once added in the admin panel.');
  switch (category.effect) {
    case 'motion-track':
      return renderMotionTrack(items);
    case 'depth-3d':
      return renderRail(items, { depth: true });
    case 'grid':
      return renderGrid(items, category.columns);
    default:
      return renderRail(items);
  }
}

function renderSections(categories) {
  $('sections').replaceChildren(
    ...categories.map((category, index) =>
      h(
        'section',
        { class: `section effect-${category.effect}`, id: `cat-${category.slug}` },
        h(
          'header',
          { class: 'section-head reveal' },
          h('span', { class: 'num' }, String(index + 1).padStart(2, '0')),
          h('h2', { class: 'display' }, category.name),
          category.description ? h('p', { class: 'section-desc' }, category.description) : null
        ),
        renderSectionBody(category)
      )
    )
  );
}

// Contact and feedback ------------------------------------------------------

function renderTestimonials(testimonials) {
  const section = $('clientFeedback');
  section.hidden = testimonials.length === 0;
  $('testimonialGrid').replaceChildren(
    ...testimonials.map((item) =>
      h(
        'article',
        { class: 'testimonial glass reveal', dataset: { tilt: '6' } },
        h('p', { class: 'testimonial-text' }, `“${item.message}”`),
        h('p', { class: 'testimonial-name' }, item.name)
      )
    )
  );
}

// Every contact is listed with its icon and value. The same list appears in the contact section and in the Contact me pop-up.
function contactRows(contacts) {
  if (!contacts.length) return [emptyState('Contact details appear here once added in the admin panel.')];
  return contacts.map((contact) => {
    const href = safeHref(contact.href);
    const external = isWebLink(href);
    const typeName = TYPE_NAMES[contact.type] || 'Link';
    return h(
      'a',
      { class: 'contact-row', href, target: external ? '_blank' : undefined, rel: external ? 'noopener' : undefined },
      h('span', { class: 'contact-row-icon' }, contactIcon(contact.type)),
      h('span', { class: 'contact-row-text' }, h('strong', {}, `${typeName} · ${contact.label}`), h('span', {}, contact.value))
    );
  });
}

function renderContacts(contacts) {
  $('contactDetails').replaceChildren(...contactRows(contacts));
  $('contactList').replaceChildren(...contactRows(contacts));

  $('footerContacts').replaceChildren(
    ...contacts.map((contact) => {
      const href = safeHref(contact.href);
      const external = isWebLink(href);
      const typeName = TYPE_NAMES[contact.type] || 'Link';
      return h(
        'a',
        {
          class: 'footer-icon',
          href,
          title: `${typeName}: ${contact.label}`,
          'aria-label': `${typeName}: ${contact.label}`,
          target: external ? '_blank' : undefined,
          rel: external ? 'noopener' : undefined,
        },
        contactIcon(contact.type)
      );
    })
  );
}

function setupFeedbackForm() {
  const form = $('feedbackForm');
  const status = $('feedbackStatus');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form));
    status.textContent = 'Sending…';
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not send your message');
      form.reset();
      status.textContent = 'Thanks! Your message was sent.';
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

function setupLightbox() {
  $('lightboxClose').addEventListener('click', closeLightbox);
  $('lightbox').addEventListener('click', (event) => {
    if (event.target === $('lightbox')) closeLightbox();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('lightbox').hidden) closeLightbox();
  });
}

// The top menu hides once the page is scrolled.
function setupChrome() {
  const topbar = document.querySelector('.topbar');
  const update = () => topbar.classList.toggle('is-hidden', window.scrollY > 80);
  window.addEventListener('scroll', update, { passive: true });
  update();
  setupContactModal();
}

// The Contact me button opens a pop-up with every contact detail.
function setupContactModal() {
  const modal = $('contactModal');
  const open = () => {
    modal.hidden = false;
    document.body.classList.add('no-scroll');
  };
  const close = () => {
    modal.hidden = true;
    document.body.classList.remove('no-scroll');
  };
  $('contactFab').addEventListener('click', open);
  $('contactClose').addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) close();
  });
}

// "Website created by" line in the footer, shown only when the admin has filled it in.
function renderCreatedBy(profile) {
  const line = $('createdBy');
  if (!profile.createdByName) {
    line.hidden = true;
    return;
  }
  line.hidden = false;
  const link = $('createdByLink');
  link.textContent = profile.createdByName;
  const url = safeHref(profile.createdByUrl);
  if (url) {
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
  } else {
    link.removeAttribute('href');
  }
}

// Start -------------------------------------------------------------------

function activateEffects() {
  attachTilt(document);
  attachReveal(document);
  document.querySelectorAll('.rail-wrap').forEach(attachRail);
  document.querySelectorAll('.motion-outer').forEach(attachMotionTrack);
  document.querySelectorAll('.depth-rail').forEach(attachDepthRail);
  attachParallax($('heroPhotoWrap'));
  attachScrollProgress(document.getElementById('scrollProgress'));
  attachGridFit();
  attachLazyMedia(document);
}

async function init() {
  setupLightbox();
  setupFeedbackForm();
  setupChrome();
  try {
    const response = await fetch('/api/site');
    if (!response.ok) throw new Error('Could not load the portfolio');
    const site = await response.json();
    renderHero(site.profile);
    renderCreatedBy(site.profile);
    renderNav(site.categories);
    renderSections(site.categories);
    renderTestimonials(site.testimonials || []);
    renderContacts(site.contacts);
    activateEffects();
  } catch (error) {
    $('sections').replaceChildren(emptyState(`${error.message}. Please refresh the page.`));
  }
}

init();
