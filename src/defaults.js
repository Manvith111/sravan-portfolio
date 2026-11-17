'use strict';

const crypto = require('crypto');
const { slugify } = require('./records');

function createCategory(name, kind, effect, order, description) {
  return {
    id: crypto.randomUUID(),
    name,
    slug: slugify(name),
    kind,
    effect,
    description,
    order,
  };
}

// First-run content. Everything here can be edited or deleted from the admin panel.
function createDefaultState() {
  return {
    meta: {
      jwtSecret: crypto.randomBytes(48).toString('hex'),
      createdAt: new Date().toISOString(),
    },
    admin: null,
    profile: {
      name: 'SRAVAN',
      title: 'Video Editor',
      tagline: 'AI Video Generator',
      bio: '',
      photo: '',
      heroLabels: ['Video Editor', 'Motion Graphic Designer', 'AI Video Generator'],
      photoShape: 'square',
    },
    contacts: [],
    categories: [
      createCategory('Experience', 'experience', 'timeline', 0, 'Where I have worked and what I have built'),
      createCategory('Motion Graphics', 'media', 'motion-track', 1, 'Motion design, kinetic type and animated graphics'),
      createCategory('AI Video Generation', 'media', 'depth-3d', 2, 'Videos generated and refined with AI tools'),
      createCategory('Video Editing', 'media', 'slide-row', 3, 'Edits, cuts, reels and long-form storytelling'),
    ],
    items: [],
    experiences: [],
    messages: [],
  };
}

module.exports = { createDefaultState };
