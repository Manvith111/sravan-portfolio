import { h } from './dom.js';
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
      poster: item.poster || undefined,
      preload: 'metadata',
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
  $('lightboxBody').replaceChildren(content, item.caption ? h('p', { class: 'lightbox-caption' }, item.caption) : null);
  $('lightbox').hidden = false;
  document.body.classList.add('no-scroll');
}

function closeLightbox() {
  $('lightbox').hidden = true;
  $('lightboxBody').replaceChildren();
  document.body.classList.remove('no-scroll');
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
    h('div', { class: 'card-info' }, h('h3', {}, item.title))
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

function renderGrid(items) {
  return h(
    'div',
    { class: 'grid' },
    items.map((item, index) => h('div', { class: 'reveal', style: { '--i': index % 6 } }, renderCard(item, 'grid-card')))
  );
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
      return renderGrid(items);
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
