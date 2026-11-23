'use strict';

const { sortOrder } = require('./records');
const { DEFAULT_TITLE_FONT, DEFAULT_TITLE_SIZE, DEFAULT_COLUMNS, DEFAULT_TITLE_BOX } = require('./validation');

// Items saved before title boxes existed get the default box.
function withTitleBox(item) {
  return { ...item, titleBox: { ...DEFAULT_TITLE_BOX, ...item.titleBox } };
}

// Shape returned to visitors and to the admin panel. Password hashes and the JWT secret never leave the server.
// Profiles saved before hero labels and photo shape existed get these defaults.
const PROFILE_DEFAULTS = {
  heroLabels: ['Video Editor', 'Motion Graphic Designer', 'AI Video Generator'],
  photoShape: 'square',
  titleFont: DEFAULT_TITLE_FONT,
  titleSize: DEFAULT_TITLE_SIZE,
};

function buildSitePayload(state) {
  return {
    profile: { ...PROFILE_DEFAULTS, ...state.profile },
    testimonials: buildTestimonials(state),
    contacts: sortOrder(state.contacts),
    categories: sortOrder(state.categories).map((category) => {
      const withColumns = { ...category, columns: category.columns ?? DEFAULT_COLUMNS };
      return category.kind === 'experience'
        ? { ...withColumns, experiences: sortOrder(state.experiences.filter((e) => e.categoryId === category.id)) }
        : { ...withColumns, items: sortOrder(state.items.filter((i) => i.categoryId === category.id)).map(withTitleBox) };
    }),
  };
}

// Only feedback the admin has chosen to feature, without email addresses.
function buildTestimonials(state) {
  return [...state.messages]
    .filter((message) => message.featured === true)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((message) => ({ id: message.id, name: message.name || 'Client', message: message.message, createdAt: message.createdAt }));
}

function buildAdminPayload(state) {
  return {
    ...buildSitePayload(state),
    messages: [...state.messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

// Every local upload URL the site currently references, so unused files can be removed.
function referencedUploads(state) {
  const urls = new Set([state.profile.photo]);
  for (const item of state.items) {
    urls.add(item.file);
    urls.add(item.poster);
  }
  return urls;
}

module.exports = { buildSitePayload, buildAdminPayload, referencedUploads };
