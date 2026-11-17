'use strict';

const { sortOrder } = require('./records');

// Shape returned to visitors and to the admin panel. Password hashes and the JWT secret never leave the server.
// Profiles saved before hero labels and photo shape existed get these defaults.
const PROFILE_DEFAULTS = {
  heroLabels: ['Video Editor', 'Motion Graphic Designer', 'AI Video Generator'],
  photoShape: 'square',
};

function buildSitePayload(state) {
  return {
    profile: { ...PROFILE_DEFAULTS, ...state.profile },
    testimonials: buildTestimonials(state),
    contacts: sortOrder(state.contacts),
    categories: sortOrder(state.categories).map((category) =>
      category.kind === 'experience'
        ? { ...category, experiences: sortOrder(state.experiences.filter((e) => e.categoryId === category.id)) }
        : { ...category, items: sortOrder(state.items.filter((i) => i.categoryId === category.id)) }
    ),
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
