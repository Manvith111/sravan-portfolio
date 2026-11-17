import { h } from '/js/dom.js';

const app = document.getElementById('app');
const state = { site: null, tab: 'profile', mediaCategoryId: null, experienceCategoryId: null };

const TABS = [
  ['profile', 'Profile & photo'],
  ['contacts', 'Contacts'],
  ['categories', 'Categories'],
  ['media', 'Photos & videos'],
  ['experience', 'Experience'],
  ['messages', 'Feedback'],
];

const EFFECTS = {
  media: [
    ['slide-row', 'Horizontal scroll row'],
    ['motion-track', 'Motion graphics scroll (pinned)'],
    ['depth-3d', '3D tilt on scroll'],
    ['grid', 'Grid reveal'],
  ],
  experience: [['timeline', 'Timeline']],
};

const KIND_LABELS = { media: 'Photos & videos', experience: 'Experience' };

const CONTACT_TYPES = [
  ['whatsapp', 'WhatsApp'],
  ['instagram', 'Instagram'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['linkedin', 'LinkedIn'],
  ['youtube', 'YouTube'],
  ['facebook', 'Facebook'],
  ['x', 'X'],
  ['website', 'Website'],
  ['other', 'Other link'],
];

// Network -------------------------------------------------------------------

function requestError(response, data) {
  const error = new Error(data.error || `Request failed (${response.status})`);
  error.status = response.status;
  return error;
}

async function api(path, { method = 'GET', body, form } = {}) {
  const init = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  if (form) init.body = form;
  const response = await fetch(`/api/admin${path}`, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw requestError(response, data);
  return data;
}

function uploadWithProgress(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/admin${path}`);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener('load', () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON responses (for example a proxy error page) keep the empty object; the status code decides.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
        return;
      }
      const error = new Error(data.error || 'Upload failed');
      error.status = xhr.status;
      reject(error);
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.send(formData);
  });
}

async function loadSite() {
  state.site = await api('/site');
}

// Feedback helpers ------------------------------------------------------------

function notify(message, isError = false) {
  const toast = h('div', { class: `toast${isError ? ' error' : ''}`, role: 'status' }, message);
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3500);
}

function handleError(error) {
  if (error.status === 401) {
    loginView('Your session ended. Please sign in again.');
    return;
  }
  notify(error.message, true);
}

// Runs an action, reloads the site data and redraws. Errors become toasts.
async function saveWith(action, message) {
  try {
    await action();
    await loadSite();
    notify(message);
    renderShell();
  } catch (error) {
    handleError(error);
  }
}

function formObject(formData) {
  return Object.fromEntries(formData.entries());
}

// Form building blocks ----------------------------------------------------------

function field(label, name, value = '', options = {}) {
  const control = options.multiline
    ? h('textarea', { name, maxlength: options.max || 1000, placeholder: options.placeholder }, value)
    : h('input', {
        name,
        value,
        type: options.type || 'text',
        maxlength: options.max || 200,
        required: options.required,
        placeholder: options.placeholder,
      });
  return h('label', { class: 'field' }, h('span', {}, label), control);
}

function select(name, options, selected) {
  return h(
    'select',
    { name },
    options.map(([value, text]) => h('option', { value, selected: value === selected ? true : undefined }, text))
  );
}

function categoryPicker(categories, selectedId, onChange) {
  const picker = select('categoryPicker', categories.map((c) => [c.id, c.name]), selectedId);
  picker.addEventListener('change', () => onChange(picker.value));
  return h('label', { class: 'field' }, h('span', {}, 'Category'), picker);
}

function moveButtons(path, id, index, total) {
  return h(
    'span',
    { class: 'move' },
    h(
      'button',
      { type: 'button', class: 'ghost small', disabled: index === 0, 'aria-label': 'Move up', onclick: () => moveItem(path, id, 'up') },
      '↑'
    ),
    h(
      'button',
      { type: 'button', class: 'ghost small', disabled: index === total - 1, 'aria-label': 'Move down', onclick: () => moveItem(path, id, 'down') },
      '↓'
    )
  );
}

function deleteButton(path, id, label, warning = '') {
  return h(
    'button',
    {
      type: 'button',
      class: 'danger small',
      onclick: () => {
        if (!confirm(`Delete this ${label}?${warning}`)) return;
        saveWith(() => api(`/${path}/${id}`, { method: 'DELETE' }), `${label[0].toUpperCase()}${label.slice(1)} deleted`);
      },
    },
    'Delete'
  );
}

function moveItem(path, id, direction) {
  return saveWith(() => api(`/${path}/${id}/move`, { method: 'POST', body: { direction } }), 'Order updated');
}

function emptyText(text) {
  return h('p', { class: 'muted' }, text);
}

// Login and shell ------------------------------------------------------------

function loginView(message = '') {
  const errorLine = h('p', { class: 'error', role: 'alert' }, message);
  const form = h(
    'form',
    {
      class: 'login',
      onsubmit: async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        try {
          await api('/login', {
            method: 'POST',
            body: { username: data.get('username'), password: data.get('password') },
          });
          await start();
        } catch (error) {
          errorLine.textContent = error.message;
        }
      },
    },
    h('h1', {}, 'Admin sign in'),
    h('label', { class: 'field' }, h('span', {}, 'Username'), h('input', { name: 'username', required: true, autocomplete: 'username' })),
    h('label', { class: 'field' }, h('span', {}, 'Password'), h('input', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' })),
    h('button', { class: 'primary', type: 'submit' }, 'Sign in'),
    errorLine
  );
  app.replaceChildren(h('div', { class: 'login-wrap' }, form));
}

function renderShell() {
  const tabs = h(
    'nav',
    { class: 'tabs' },
    TABS.map(([id, label]) =>
      h(
        'button',
        {
          type: 'button',
          class: `tab${state.tab === id ? ' active' : ''}`,
          onclick: () => {
            state.tab = id;
            renderShell();
          },
        },
        label
      )
    )
  );
  app.replaceChildren(
    h(
      'header',
      { class: 'admin-top' },
      h('div', { class: 'brand' }, `${state.site.profile.name} · Admin`),
      h(
        'div',
        { class: 'top-actions' },
        h('a', { href: '/', target: '_blank', rel: 'noopener' }, 'View site'),
        h('button', { type: 'button', class: 'ghost', onclick: signOut }, 'Sign out')
      )
    ),
    tabs,
    h('main', { class: 'panel' }, renderTab())
  );
}

function renderTab() {
  switch (state.tab) {
    case 'contacts':
      return contactsTab();
    case 'categories':
      return categoriesTab();
    case 'media':
      return mediaTab();
    case 'experience':
      return experienceTab();
    case 'messages':
      return messagesTab();
    default:
      return profileTab();
  }
}

async function signOut() {
  await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
  loginView('Signed out.');
}

// Profile ----------------------------------------------------------------

function profileTab() {
  const profile = state.site.profile;

  const details = h(
    'form',
    {
      class: 'card',
      onsubmit: (event) => {
        event.preventDefault();
        const data = new FormData(details);
        saveWith(
          () =>
            api('/profile', {
              method: 'PUT',
              body: {
                name: data.get('name'),
                title: data.get('title'),
                tagline: data.get('tagline'),
                bio: data.get('bio'),
                heroLabels: data.get('heroLabels'),
                photoShape: data.get('photoShape'),
                createdByName: data.get('createdByName'),
                createdByUrl: data.get('createdByUrl'),
              },
            }),
          'Profile saved'
        );
      },
    },
    h('h2', {}, 'Profile'),
    h('div', { class: 'grid-3' }, field('Name', 'name', profile.name, { required: true, max: 60 }), field('Title', 'title', profile.title, { max: 80 }), field('Tagline', 'tagline', profile.tagline, { max: 120 })),
    field('Hero labels (comma separated, up to 5)', 'heroLabels', (profile.heroLabels || []).join(', '), { max: 200 }),
    h('label', { class: 'field' }, h('span', {}, 'Centre photo shape'), select('photoShape', [['square', 'Square'], ['circle', 'Circle']], profile.photoShape || 'square')),
    field('Short bio', 'bio', profile.bio, { multiline: true, max: 1000 }),
    h(
      'div',
      { class: 'grid-2' },
      field('Website created by (your name)', 'createdByName', profile.createdByName || '', { max: 60 }),
      field('Your link (optional, https://...)', 'createdByUrl', profile.createdByUrl || '', { max: 300 })
    ),
    h('div', { class: 'row-actions' }, h('button', { class: 'primary', type: 'submit' }, 'Save profile'))
  );

  const photoInput = h('input', { type: 'file', accept: 'image/*' });
  const photoForm = h(
    'form',
    {
      class: 'card',
      onsubmit: (event) => {
        event.preventDefault();
        const file = photoInput.files[0];
        if (!file) return notify('Choose a photo first', true);
        const data = new FormData();
        data.append('photo', file);
        return saveWith(() => api('/profile/photo', { method: 'POST', form: data }), 'Photo updated');
      },
    },
    h('h2', {}, 'Photo in the middle of the page'),
    profile.photo ? h('img', { class: 'photo-preview', src: profile.photo, alt: 'Current photo' }) : emptyText('No photo yet.'),
    photoInput,
    h('div', { class: 'row-actions' }, h('button', { class: 'primary', type: 'submit' }, 'Upload photo'))
  );

  return h('div', { class: 'panel-stack' }, details, photoForm);
}

// Contacts ----------------------------------------------------------------

function contactsTab() {
  const contacts = state.site.contacts;
  const addForm = h(
    'form',
    {
      class: 'card',
      onsubmit: (event) => {
        event.preventDefault();
        const body = formObject(new FormData(addForm));
        saveWith(() => api('/contacts', { method: 'POST', body }), 'Contact added');
      },
    },
    h('h2', {}, 'Add a contact'),
    h(
      'div',
      { class: 'grid-3' },
      h('label', { class: 'field' }, h('span', {}, 'Type'), select('type', CONTACT_TYPES, 'whatsapp')),
      field('Label (e.g. Personal, Work)', 'label', '', { max: 60 }),
      field('Number, handle, email or link', 'value', '', { required: true, max: 300 })
    ),
    field('Link (optional, for Website or Other)', 'url', '', { max: 500, placeholder: 'https://...' }),
    h('div', { class: 'row-actions' }, h('button', { class: 'primary', type: 'submit' }, 'Add contact'))
  );

  const rows = contacts.map((contact, index) => contactRow(contact, index, contacts.length));
  return h('div', { class: 'panel-stack' }, addForm, h('section', { class: 'list' }, rows.length ? rows : emptyText('No contacts yet.')));
}

function contactRow(contact, index, total) {
  const form = h(
    'form',
    {
      class: 'card row-form',
      onsubmit: (event) => {
        event.preventDefault();
        const body = formObject(new FormData(form));
        saveWith(() => api(`/contacts/${contact.id}`, { method: 'PUT', body }), 'Contact saved');
      },
    },
    h('label', { class: 'field' }, h('span', {}, 'Type'), select('type', CONTACT_TYPES, contact.type)),
    field('Label', 'label', contact.label, { max: 60 }),
    field('Value', 'value', contact.value, { max: 300 }),
    h(
      'div',
      { class: 'row-actions' },
      h('button', { type: 'submit', class: 'primary small' }, 'Save'),
      moveButtons('contacts', contact.id, index, total),
      deleteButton('contacts', contact.id, 'contact')
    )
  );
  return form;
}

// Categories ----------------------------------------------------------------

function categoriesTab() {
  const categories = state.site.categories;
  const kindSelect = select('kind', [['media', KIND_LABELS.media], ['experience', KIND_LABELS.experience]], 'media');
  const effectSelect = select('effect', EFFECTS.media, 'slide-row');
  kindSelect.addEventListener('change', () => {
    effectSelect.replaceChildren(...EFFECTS[kindSelect.value].map(([value, text]) => h('option', { value }, text)));
  });

  const addForm = h(
    'form',
    {
      class: 'card',
      onsubmit: (event) => {
        event.preventDefault();
        const body = formObject(new FormData(addForm));
        saveWith(() => api('/categories', { method: 'POST', body }), 'Category added');
      },
    },
    h('h2', {}, 'Add a category'),
    h(
      'div',
      { class: 'grid-3' },
      field('Name', 'name', '', { required: true, max: 60 }),
      h('label', { class: 'field' }, h('span', {}, 'Kind'), kindSelect),
      h('label', { class: 'field' }, h('span', {}, 'Scroll effect'), effectSelect)
    ),
    field('Description', 'description', '', { max: 300 }),
    h('div', { class: 'row-actions' }, h('button', { class: 'primary', type: 'submit' }, 'Add category'))
  );

  const rows = categories.map((category, index) => categoryRow(category, index, categories.length));
  return h('div', { class: 'panel-stack' }, addForm, h('section', { class: 'list' }, rows));
}

function categoryRow(category, index, total) {
  const effectSelect = select('effect', EFFECTS[category.kind], category.effect);
  const form = h(
    'form',
    {
      class: 'card',
      onsubmit: (event) => {
        event.preventDefault();
        const body = formObject(new FormData(form));
        saveWith(() => api(`/categories/${category.id}`, { method: 'PUT', body }), 'Category saved');
      },
    },
    h(
      'div',
      { class: 'grid-3' },
      field('Name', 'name', category.name, { required: true, max: 60 }),
      h('label', { class: 'field' }, h('span', {}, 'Kind'), h('input', { value: KIND_LABELS[category.kind], disabled: true })),
      h('label', { class: 'field' }, h('span', {}, 'Scroll effect'), effectSelect)
    ),
    field('Description', 'description', category.description, { max: 300 }),
    h(
      'div',
      { class: 'row-actions' },
      h('button', { type: 'submit', class: 'primary small' }, 'Save'),
      moveButtons('categories', category.id, index, total),
      deleteButton('categories', category.id, 'category', ' Its photos, videos and experience entries will be deleted too.')
    )
  );
  return form;
}

// Photos & videos ------------------------------------------------------------

function mediaTab() {
  const media = state.site.categories.filter((c) => c.kind === 'media');
  if (!media.length) return emptyText('Add a photos & videos category first (Categories tab).');
  if (!media.some((c) => c.id === state.mediaCategoryId)) state.mediaCategoryId = media[0].id;
  const category = media.find((c) => c.id === state.mediaCategoryId);

  const items = category.items || [];
  return h(
    'div',
    { class: 'panel-stack' },
    categoryPicker(media, category.id, (id) => {
      state.mediaCategoryId = id;
      renderShell();
    }),
    uploadForm(category),
    h('section', { class: 'list' }, items.length ? items.map((item, index) => itemRow(item, index, items.length)) : emptyText('No photos or videos in this category yet.'))
  );
}

function uploadForm(category) {
  const form = h(
    'form',
    {
      class: 'card',
      onsubmit: (event) => {
        event.preventDefault();
        uploadItem(form, category.id);
      },
    },
    h('h2', {}, `Add to ${category.name}`),
    h('div', { class: 'grid-2' }, field('Title', 'title', '', { max: 120 }), field('Caption', 'caption', '', { max: 500 })),
    h('label', { class: 'field' }, h('span', {}, 'Photo or video (jpg, png, webp, gif, mp4, webm, mov)'), h('input', { type: 'file', name: 'file', accept: 'image/*,video/*', required: true })),
    h('label', { class: 'field' }, h('span', {}, 'Poster image for a video (optional)'), h('input', { type: 'file', name: 'poster', accept: 'image/*' })),
    h('div', { class: 'progress-wrap', hidden: true }, h('div', { class: 'progress-bar' })),
    h('div', { class: 'row-actions' }, h('button', { type: 'submit', class: 'primary' }, 'Upload'))
  );
  return form;
}

async function uploadItem(form, categoryId) {
  const data = new FormData(form);
  // Drop empty file inputs so the server does not receive blank file parts.
  if (!data.get('poster')?.size) data.delete('poster');
  if (!data.get('file')?.size) return notify('Choose a photo or video first', true);
  data.set('categoryId', categoryId);

  const progressWrap = form.querySelector('.progress-wrap');
  const progressBar = form.querySelector('.progress-bar');
  const submit = form.querySelector('button[type="submit"]');
  progressWrap.hidden = false;
  progressBar.style.width = '0%';
  submit.disabled = true;

  try {
    await uploadWithProgress('/items', data, (ratio) => {
      progressBar.style.width = `${Math.round(ratio * 100)}%`;
    });
    notify('Uploaded');
    await loadSite();
    renderShell();
  } catch (error) {
    submit.disabled = false;
    progressWrap.hidden = true;
    handleError(error);
  }
}

function itemRow(item, index, total) {
  const preview =
    item.mediaType === 'video'
      ? h('video', { src: item.file, poster: item.poster || undefined, muted: true, preload: 'metadata', class: 'thumb' })
      : h('img', { src: item.file, alt: '', class: 'thumb' });

  const form = h(
    'form',
    {
      class: 'row-form',
      onsubmit: (event) => {
        event.preventDefault();
        const body = formObject(new FormData(form));
        saveWith(() => api(`/items/${item.id}`, { method: 'PUT', body }), 'Saved');
      },
    },
    field('Title', 'title', item.title, { max: 120 }),
    field('Caption', 'caption', item.caption, { max: 500 }),
    h(
      'div',
      { class: 'row-actions' },
      h('button', { type: 'submit', class: 'primary small' }, 'Save'),
      moveButtons('items', item.id, index, total),
      deleteButton('items', item.id, 'item', ' The file will be removed from the server.')
    )
  );
  return h('div', { class: 'media-row' }, preview, form);
}

// Experience ----------------------------------------------------------------

function experienceTab() {
  const experienceCategories = state.site.categories.filter((c) => c.kind === 'experience');
  if (!experienceCategories.length) {
    return emptyText('No experience category. Add one with Kind = Experience (Categories tab).');
  }
  if (!experienceCategories.some((c) => c.id === state.experienceCategoryId)) {
    state.experienceCategoryId = experienceCategories[0].id;
  }
  const category = experienceCategories.find((c) => c.id === state.experienceCategoryId);
  const entries = category.experiences || [];

  const addForm = h(
    'form',
    {
      class: 'card',
      onsubmit: (event) => {
        event.preventDefault();
        const body = { ...formObject(new FormData(addForm)), categoryId: category.id };
        saveWith(() => api('/experiences', { method: 'POST', body }), 'Experience added');
      },
    },
    h('h2', {}, 'Add an experience'),
    h('div', { class: 'grid-2' }, field('Role / title', 'role', '', { required: true, max: 120 }), field('Company / client', 'company', '', { max: 120 })),
    h('div', { class: 'grid-2' }, field('Period (e.g. 2022 – Present)', 'period', '', { max: 80 }), field('Location', 'location', '', { max: 80 })),
    field('What you did', 'description', '', { multiline: true, max: 1000 }),
    h('div', { class: 'row-actions' }, h('button', { class: 'primary', type: 'submit' }, 'Add experience'))
  );

  return h(
    'div',
    { class: 'panel-stack' },
    categoryPicker(experienceCategories, category.id, (id) => {
      state.experienceCategoryId = id;
      renderShell();
    }),
    addForm,
    h(
      'section',
      { class: 'list' },
      entries.length ? entries.map((entry, index) => experienceRow(entry, index, entries.length)) : emptyText('No experience entries yet. Entries show in the order listed here; use the arrows to reorder.')
    )
  );
}

function experienceRow(entry, index, total) {
  const form = h(
    'form',
    {
      class: 'card exp-row',
      onsubmit: (event) => {
        event.preventDefault();
        const body = formObject(new FormData(form));
        saveWith(() => api(`/experiences/${entry.id}`, { method: 'PUT', body }), 'Experience saved');
      },
    },
    h('div', { class: 'grid-2' }, field('Role / title', 'role', entry.role, { required: true, max: 120 }), field('Company / client', 'company', entry.company, { max: 120 })),
    h('div', { class: 'grid-2' }, field('Period', 'period', entry.period, { max: 80 }), field('Location', 'location', entry.location, { max: 80 })),
    field('What you did', 'description', entry.description, { multiline: true, max: 1000 }),
    h(
      'div',
      { class: 'row-actions' },
      h('button', { type: 'submit', class: 'primary small' }, 'Save'),
      moveButtons('experiences', entry.id, index, total),
      deleteButton('experiences', entry.id, 'experience entry')
    )
  );
  return form;
}

// Feedback ----------------------------------------------------------------

function featureButton(message) {
  const featured = message.featured === true;
  return h(
    'button',
    {
      type: 'button',
      class: featured ? 'primary small' : 'small',
      onclick: () => {
        saveWith(
          () => api(`/messages/${message.id}/feature`, { method: 'PUT', body: { featured: !featured } }),
          featured ? 'Removed from the site' : 'Now shown on the site'
        );
      },
    },
    featured ? 'Shown on site ✓' : 'Show on site'
  );
}

function messagesTab() {
  const messages = state.site.messages || [];
  if (!messages.length) return emptyText('No feedback yet.');
  return h(
    'section',
    { class: 'list' },
    messages.map((message) =>
      h(
        'article',
        { class: 'card msg' },
        h(
          'div',
          { class: 'msg-head' },
          h('strong', {}, message.name || 'Anonymous'),
          message.email ? h('span', { class: 'muted' }, `· ${message.email}`) : null,
          h('span', { class: 'muted' }, `· ${new Date(message.createdAt).toLocaleString()}`)
        ),
        h('p', {}, message.message),
        h(
          'div',
          { class: 'row-actions' },
          featureButton(message),
          deleteButton('messages', message.id, 'message')
        )
      )
    )
  );
}

// Start ----------------------------------------------------------------

async function start() {
  try {
    await loadSite();
    renderShell();
  } catch (error) {
    if (error.status === 401) loginView();
    else notify(error.message, true);
  }
}

start();
