import { h } from '/js/dom.js';
import { layoutEditorCard, hasUnsavedLayout } from '/admin/layout-editor.js';

const app = document.getElementById('app');
const state = { site: null, tab: 'profile', mediaCategoryId: null, experienceCategoryId: null, directUploads: false };

const TABS = [
  ['profile', 'Profile & photo'],
  ['contacts', 'Contacts'],
  ['categories', 'Categories'],
  ['media', 'Photos & videos'],
  ['experience', 'Experience'],
  ['fonts', 'Fonts'],
  ['messages', 'Feedback'],
];

const EFFECTS = {
  media: [
    ['slide-row', 'Horizontal scroll row'],
    ['motion-track', 'Motion graphics scroll (pinned)'],
    ['depth-3d', '3D tilt on scroll'],
    ['grid', 'Grid view (YouTube style)'],
  ],
  experience: [['timeline', 'Timeline']],
};

const TITLE_FONTS = [
  ['anton', 'Anton (bold, default)'],
  ['courier', 'Courier Prime (typewriter)'],
  ['inter', 'Inter (clean sans)'],
];
const TITLE_SIZES = [
  ['small', 'Small'],
  ['medium', 'Medium'],
  ['large', 'Large'],
];
const COLUMN_CHOICES = [1, 2, 3, 4, 5, 6].map((n) => [String(n), `up to ${n} per row`]);
const TITLE_FONT_STACKS = {
  anton: "Anton, Impact, 'Arial Narrow', sans-serif",
  courier: "'Courier Prime', 'Courier New', monospace",
  inter: 'Inter, system-ui, sans-serif',
};
const TITLE_SIZE_PIXELS = { small: '16px', medium: '22px', large: '30px' };

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
  const [site, me] = await Promise.all([api('/site'), api('/me')]);
  state.site = site;
  state.directUploads = me.directUploads === true;
}

// On Supabase the server issues a one-time upload address for each file, and the browser sends the file
// straight there, so large videos skip the server's request size limit. Resolves to the stored name.
async function uploadDirect(file, field, onProgress) {
  const { name, url } = await api('/uploads/start', { method: 'POST', body: { filename: file.name, field } });
  await putWithProgress(url, file, onProgress);
  return name;
}

function putWithProgress(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error('Upload failed. Try again.'));
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.send(file);
  });
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
            if (hasUnsavedLayout() && !confirm('The page layout has changes that are not saved. Leave this tab without saving?')) return;
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
    case 'fonts':
      return fontsTab();
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
                titleFont: data.get('titleFont'),
                titleSize: data.get('titleSize'),
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
    h(
      'div',
      { class: 'grid-2' },
      h('label', { class: 'field' }, h('span', {}, 'Video title font'), select('titleFont', TITLE_FONTS, profile.titleFont || 'anton')),
      h('label', { class: 'field' }, h('span', {}, 'Video title size'), select('titleSize', TITLE_SIZES, profile.titleSize || 'medium'))
    ),
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
        return saveWith(() => savePhoto(file), 'Photo updated');
      },
    },
    h('h2', {}, 'Photo in the middle of the page'),
    profile.photo ? h('img', { class: 'photo-preview', src: profile.photo, alt: 'Current photo' }) : emptyText('No photo yet.'),
    photoInput,
    h('div', { class: 'row-actions' }, h('button', { class: 'primary', type: 'submit' }, 'Upload photo'))
  );

  const layoutCard = layoutEditorCard({
    profile,
    onSave: (body) => saveWith(() => api('/profile', { method: 'PUT', body }), 'Page layout saved'),
  });

  return h('div', { class: 'panel-stack' }, details, photoForm, layoutCard);
}

async function savePhoto(file) {
  if (state.directUploads) {
    const name = await uploadDirect(file, 'photo', () => {});
    return api('/profile/photo/uploaded', { method: 'POST', body: { file: name } });
  }
  const data = new FormData();
  data.append('photo', file);
  return api('/profile/photo', { method: 'POST', form: data });
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
    columnsField(3),
    h('div', { class: 'row-actions' }, h('button', { class: 'primary', type: 'submit' }, 'Add category'))
  );

  const rows = categories.map((category, index) => categoryRow(category, index, categories.length));
  return h('div', { class: 'panel-stack' }, addForm, h('section', { class: 'list' }, rows));
}

// Only used by grid view; the public site reads it when the scroll effect is "Grid view".
function columnsField(columns) {
  return h(
    'label',
    { class: 'field' },
    h('span', {}, 'Most videos per row (grid view; the screen size sets the real number)'),
    select('columns', COLUMN_CHOICES, String(columns))
  );
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
    columnsField(category.columns || 3),
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

const ALIGN_CHOICES = [
  ['left', 'Left'],
  ['centre', 'Centre'],
  ['right', 'Right'],
];
const TEXT_SIZE_CHOICES = [
  ['small', 'Small'],
  ['medium', 'Medium'],
  ['large', 'Large'],
];
const BOX_SIZE_CHOICES = [
  ['compact', 'Compact'],
  ['normal', 'Normal'],
  ['large', 'Large'],
];
const COLOUR_MODE_CHOICES = [
  ['brand', 'White box, violet text (default)'],
  ['inverse', 'Violet box, white text'],
  ['auto', 'Match the poster colours (automatic)'],
  ['custom', 'Custom colours'],
];
const DEFAULT_BOX_FIELDS = {
  align: 'centre',
  font: 'anton',
  size: 'medium',
  boxSize: 'normal',
  bold: false,
  italic: false,
  outline: true,
  colorMode: 'brand',
  background: '#ffffff',
  text: '#6955ff',
};
const BRAND_COLOURS = { background: '#ffffff', text: '#6955ff' };
const INVERSE_COLOURS = { background: '#6955ff', text: '#ffffff' };

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

// Title box controls: one panel, used by both the upload form and each item row ---------

function titleBoxPanel(box) {
  const current = { ...DEFAULT_BOX_FIELDS, ...box };
  return h(
    'section',
    { class: 'box-panel' },
    h('h3', { class: 'box-panel-title' }, 'Title box'),
    h(
      'div',
      { class: 'box-grid' },
      h('label', { class: 'field' }, h('span', {}, 'Alignment'), select('align', ALIGN_CHOICES, current.align)),
      h('label', { class: 'field' }, h('span', {}, 'Font'), select('font', TITLE_FONTS, current.font)),
      h('label', { class: 'field' }, h('span', {}, 'Text size'), select('size', TEXT_SIZE_CHOICES, current.size)),
      h('label', { class: 'field' }, h('span', {}, 'Box size'), select('boxSize', BOX_SIZE_CHOICES, current.boxSize))
    ),
    h(
      'div',
      { class: 'box-flags' },
      h('label', {}, h('input', { type: 'checkbox', name: 'bold', checked: current.bold }), ' Bold'),
      h('label', {}, h('input', { type: 'checkbox', name: 'italic', checked: current.italic }), ' Italic'),
      h('label', {}, h('input', { type: 'checkbox', name: 'outline', checked: current.outline }), ' Outline')
    ),
    h(
      'div',
      { class: 'colour-row' },
      h('label', { class: 'field' }, h('span', {}, 'Colours'), select('colorMode', COLOUR_MODE_CHOICES, current.colorMode)),
      h('div', { class: 'auto-readout', hidden: current.colorMode !== 'auto' })
    ),
    h(
      'div',
      { class: 'custom-colours', hidden: current.colorMode !== 'custom' },
      h('label', { class: 'field' }, h('span', {}, 'Box colour'), h('input', { type: 'color', name: 'background', value: current.background })),
      h('label', { class: 'field' }, h('span', {}, 'Text colour'), h('input', { type: 'color', name: 'text', value: current.text }))
    )
  );
}

// Shows the colours the box gets in automatic mode, beside the colour choice.
function setReadout(readout, colours) {
  if (!readout) return;
  if (!colours) {
    readout.replaceChildren(h('span', { class: 'muted' }, 'Choose a photo or video to read its colours.'));
    return;
  }
  readout.replaceChildren(
    h('span', { class: 'swatch', style: { background: colours.background } }),
    h('span', {}, `Box ${colours.background}`),
    h('span', { class: 'swatch', style: { background: colours.text } }),
    h('span', {}, `Text ${colours.text}`)
  );
}

// Same rule as the visitor page: the box takes the average colour of the picture, with dark or white text for contrast.
function pictureColours(source) {
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
  const average = { r: r / pixels, g: g / pixels, b: b / pixels };
  const background = `#${[average.r, average.g, average.b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
  const brightness = (0.299 * average.r + 0.587 * average.g + 0.114 * average.b) / 255;
  return { background, text: brightness > 0.6 ? '#111111' : '#ffffff' };
}

// Posters are kept small (at most 960px wide, JPEG) so the site loads quickly. Returns the original if it cannot be shrunk.
const MAX_POSTER_WIDTH = 960;

async function shrinkPicture(source) {
  try {
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, MAX_POSTER_WIDTH / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ? new File([blob], 'poster.jpg', { type: 'image/jpeg' }) : source;
  } catch {
    return source;
  }
}

async function shrinkItemPoster(item) {
  try {
    const response = await fetch(item.poster);
    if (!response.ok) throw new Error('The poster could not be read.');
    const data = new FormData();
    data.append('poster', await shrinkPicture(await response.blob()), 'poster.jpg');
    await api(`/items/${item.id}/poster`, { method: 'POST', form: data });
    notify('Poster made smaller');
    await loadSite();
    renderShell();
  } catch (error) {
    handleError(error);
  }
}

const colourCache = new Map();

async function readPictureColours(source) {
  try {
    if (source.type === 'video') {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'auto';
      video.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        video.addEventListener('loadeddata', resolve, { once: true });
        video.addEventListener('error', reject, { once: true });
        video.src = source.src;
      });
      return pictureColours(video);
    }
    const response = await fetch(source.src);
    if (!response.ok) return null;
    return pictureColours(await createImageBitmap(await response.blob()));
  } catch {
    return null;
  }
}

// Reads a picture's colours once per address, so typing in the title does not re-read the file.
function sampleSource(source) {
  const key = `${source.type}|${source.src}`;
  if (!colourCache.has(key)) colourCache.set(key, readPictureColours(source));
  return colourCache.get(key);
}

function isTicked(value) {
  return value === 'on' || value === 'true';
}

// Reads the box controls from a form (or FormData) into a titleBox object.
function titleBoxFromFormData(data) {
  return {
    align: data.get('align'),
    font: data.get('font'),
    size: data.get('size'),
    boxSize: data.get('boxSize'),
    bold: isTicked(data.get('bold')),
    italic: isTicked(data.get('italic')),
    outline: isTicked(data.get('outline')),
    colorMode: data.get('colorMode'),
    background: data.get('background'),
    text: data.get('text'),
    autoBackground: data.get('autoBackground') || '',
    autoText: data.get('autoText') || '',
  };
}

// Stores the automatic colours in the form data, so they are saved with the item and the site never has to read the picture.
async function attachAutoColours(data, preview) {
  const colours = await preview.resolveAutoColours();
  data.set('autoBackground', colours ? colours.background : '');
  data.set('autoText', colours ? colours.text : '');
  return data;
}

function readBoxValues(form) {
  const control = (name) => form.querySelector(`[name="${name}"]`);
  return {
    title: control('title')?.value || '',
    align: control('align')?.value,
    font: control('font')?.value,
    size: control('size')?.value,
    boxSize: control('boxSize')?.value,
    bold: Boolean(control('bold')?.checked),
    italic: Boolean(control('italic')?.checked),
    outline: Boolean(control('outline')?.checked),
    colorMode: control('colorMode')?.value,
    background: control('background')?.value,
    text: control('text')?.value,
  };
}

// Keeps the readout and the custom colour pickers in step with the colour choice, then updates the card preview.
function syncBoxForm(form, preview) {
  const values = readBoxValues(form);
  form.querySelector('.custom-colours').hidden = values.colorMode !== 'custom';
  form.querySelector('.auto-readout').hidden = values.colorMode !== 'auto';
  preview.setBox(values);
}

function isVideoFile(file) {
  return file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
}

// The card as visitors will see it: the poster or video, with the title box on top. Updates live as settings change.
// In automatic mode the box colours come from the poster, or from the first frame when there is no poster (as on the site).
function titlePreview(onColours = () => {}) {
  let media = null;
  let values = { ...DEFAULT_BOX_FIELDS, title: '' };
  let autoColours = null;
  let token = 0;
  const mediaSlot = h('div', { class: 'poster-card-media' });
  const titleLine = h('h3', { class: 'poster-title' }, 'Title appears here');
  const info = h('div', { class: 'poster-card-info' }, titleLine);
  const element = h('article', { class: 'poster-card' }, mediaSlot, info);

  function renderMedia() {
    if (!media) {
      mediaSlot.replaceChildren(h('p', { class: 'muted poster-empty' }, 'Choose a photo or video to see its card here.'));
      return;
    }
    mediaSlot.replaceChildren(
      media.type === 'video'
        ? h('video', {
            src: media.src,
            poster: media.poster || undefined,
            controls: true,
            muted: true,
            playsinline: true,
            preload: media.poster ? 'none' : 'metadata',
            class: 'poster-video',
          })
        : h('img', { src: media.src, alt: '', class: 'poster-video' })
    );
  }

  function currentColours() {
    if (values.colorMode === 'inverse') return INVERSE_COLOURS;
    if (values.colorMode === 'custom') return { background: values.background, text: values.text };
    if (values.colorMode === 'auto') return autoColours || BRAND_COLOURS;
    return BRAND_COLOURS;
  }

  function renderBox() {
    const colours = currentColours();
    titleLine.textContent = values.title || 'Title appears here';
    titleLine.style.fontFamily = TITLE_FONT_STACKS[values.font] || TITLE_FONT_STACKS.anton;
    titleLine.style.fontSize = TITLE_SIZE_PIXELS[values.size] || TITLE_SIZE_PIXELS.medium;
    titleLine.style.fontWeight = values.bold ? '700' : '400';
    titleLine.style.fontStyle = values.italic ? 'italic' : 'normal';
    titleLine.style.color = colours.text;
    info.className = `poster-card-info align-${values.align || 'centre'} box-${values.boxSize || 'normal'}`;
    info.style.background = colours.background;
    info.style.border = values.outline ? `2px solid ${colours.text}` : 'none';
  }

  async function refreshColours() {
    const current = ++token;
    if (values.colorMode !== 'auto') {
      renderBox();
      return;
    }
    if (!media) {
      autoColours = null;
      renderBox();
      onColours(null);
      return;
    }
    const source = media.poster ? { src: media.poster, type: 'image' } : { src: media.src, type: media.type };
    const result = await sampleSource(source);
    if (current !== token) return;
    autoColours = result;
    renderBox();
    onColours(result);
  }

  renderMedia();
  renderBox();
  return {
    element,
    // The colours the site should use, read now and saved with the item. Null unless the box is in automatic mode.
    async resolveAutoColours() {
      if (values.colorMode !== 'auto' || !media) return null;
      const source = media.poster ? { src: media.poster, type: 'image' } : { src: media.src, type: media.type };
      return sampleSource(source);
    },
    setMedia(next) {
      media = next;
      autoColours = null;
      renderMedia();
      refreshColours();
    },
    setBox(next) {
      values = { ...values, ...next };
      refreshColours();
    },
  };
}

// Lets the admin scrub a video and keep one frame as its poster. Shown only for a video with no poster file.
function framePicker(onChange) {
  const video = h('video', { class: 'poster-video', muted: true, playsinline: true, preload: 'auto' });
  const slider = h('input', { type: 'range', min: '0', max: '0', step: '0.1', value: '0', 'aria-label': 'Pick a moment in the video' });
  const status = h('p', { class: 'muted' });
  const captureButton = h('button', { type: 'button' }, 'Use this frame as poster');
  const removeButton = h('button', { type: 'button' }, 'Remove chosen frame');
  removeButton.hidden = true;
  const element = h(
    'div',
    { class: 'frame-picker' },
    h('p', { class: 'muted' }, 'No poster image chosen. Move the slider to a frame and keep it as the poster.'),
    video,
    h('label', { class: 'field' }, h('span', {}, 'Frame'), slider),
    h('div', { class: 'row-actions' }, captureButton, removeButton),
    status
  );
  element.hidden = true;
  let objectUrl = '';
  let captured = null;

  video.addEventListener('loadedmetadata', () => {
    slider.max = String(Number.isFinite(video.duration) ? video.duration : 0);
    slider.value = '0';
    video.currentTime = 0;
  });
  slider.addEventListener('input', () => {
    video.currentTime = Number(slider.value);
  });

  captureButton.addEventListener('click', () => {
    if (!video.videoWidth) {
      status.textContent = 'The video is still loading. Try again in a moment.';
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          status.textContent = 'Could not capture this frame. Try another moment.';
          return;
        }
        captured = new File([blob], 'poster.jpg', { type: 'image/jpeg' });
        removeButton.hidden = false;
        status.textContent = 'This frame is now the poster.';
        onChange();
      },
      'image/jpeg',
      0.92
    );
  });
  removeButton.addEventListener('click', () => {
    captured = null;
    removeButton.hidden = true;
    status.textContent = '';
    onChange();
  });

  return {
    element,
    chosenFrame: () => captured,
    setVisible: (visible) => {
      element.hidden = !visible;
    },
    load: (file) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;
    },
    reset: () => {
      captured = null;
      removeButton.hidden = true;
      status.textContent = '';
    },
  };
}

function uploadForm(category) {
  const fileInput = h('input', { type: 'file', name: 'file', accept: 'image/*,video/*', required: true });
  const posterInput = h('input', { type: 'file', name: 'poster', accept: 'image/*' });
  let objectUrls = [];
  const freshUrl = (file) => {
    const url = URL.createObjectURL(file);
    objectUrls.push(url);
    return url;
  };

  const frame = framePicker(() => refreshMedia());
  const preview = titlePreview((colours) => setReadout(form.querySelector('.auto-readout'), colours));
  const form = h(
    'form',
    {
      class: 'card',
      onsubmit: (event) => {
        event.preventDefault();
        uploadItem(form, category.id, { chosenFrame: frame.chosenFrame, preview });
      },
      oninput: () => syncBoxForm(form, preview),
    },
    h('h2', {}, `Add to ${category.name}`),
    h('div', { class: 'grid-2' }, field('Title', 'title', '', { max: 120 }), field('Caption', 'caption', '', { max: 500 })),
    h(
      'div',
      { class: 'grid-2' },
      h('label', { class: 'field' }, h('span', {}, 'Photo or video (jpg, png, webp, gif, mp4, webm, mov)'), fileInput),
      h('label', { class: 'field' }, h('span', {}, 'Poster image for a video (optional)'), posterInput)
    ),
    titleBoxPanel(),
    h('p', { class: 'muted preview-caption' }, 'How this card will look on the site:'),
    preview.element,
    frame.element,
    h('div', { class: 'progress-wrap', hidden: true }, h('div', { class: 'progress-bar' })),
    h('div', { class: 'row-actions' }, h('button', { type: 'submit', class: 'primary' }, 'Upload'))
  );

  // Works out what the preview shows: the chosen poster, else the captured frame, else the video itself.
  function refreshMedia({ loadFrames = false } = {}) {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls = [];
    const main = fileInput.files[0];
    if (!main) {
      preview.setMedia(null);
      frame.setVisible(false);
      return;
    }
    const chosenPoster = posterInput.files[0]?.size ? posterInput.files[0] : null;
    const poster = chosenPoster || frame.chosenFrame();
    const type = isVideoFile(main) ? 'video' : 'image';
    preview.setMedia({ src: freshUrl(main), type, poster: poster ? freshUrl(poster) : null });
    const needsFrame = type === 'video' && !chosenPoster;
    frame.setVisible(needsFrame);
    if (needsFrame && loadFrames) frame.load(main);
  }

  fileInput.addEventListener('change', () => {
    frame.reset();
    refreshMedia({ loadFrames: true });
  });
  posterInput.addEventListener('change', () => refreshMedia());
  syncBoxForm(form, preview);
  return form;
}

async function uploadItem(form, categoryId, extras) {
  const data = new FormData(form);
  // Drop empty file inputs so the server does not receive blank file parts.
  if (!data.get('poster')?.size) data.delete('poster');
  // A frame picked from the video stands in when no poster file was chosen.
  const chosenFrame = extras.chosenFrame();
  if (!data.get('poster') && chosenFrame) data.set('poster', chosenFrame);
  if (data.get('poster')) data.set('poster', await shrinkPicture(data.get('poster')));
  if (!data.get('file')?.size) return notify('Choose a photo or video first', true);
  data.set('categoryId', categoryId);
  await attachAutoColours(data, extras.preview);
  // Send every box setting explicitly, so an unticked box (which a form leaves out) is saved as off.
  for (const [key, value] of Object.entries(titleBoxFromFormData(data))) data.set(key, String(value));

  const progressWrap = form.querySelector('.progress-wrap');
  const progressBar = form.querySelector('.progress-bar');
  const submit = form.querySelector('button[type="submit"]');
  progressWrap.hidden = false;
  progressBar.style.width = '0%';
  submit.disabled = true;

  const setProgress = (ratio) => {
    progressBar.style.width = `${Math.round(ratio * 100)}%`;
  };
  try {
    if (state.directUploads) {
      await uploadItemDirect(data, categoryId, setProgress);
    } else {
      await uploadWithProgress('/items', data, setProgress);
    }
    notify('Uploaded');
    await loadSite();
    renderShell();
  } catch (error) {
    submit.disabled = false;
    progressWrap.hidden = true;
    handleError(error);
  }
}

// Sends the main file and optional poster to storage, then records the item on the server.
async function uploadItemDirect(data, categoryId, onProgress) {
  const main = data.get('file');
  const fileName = await uploadDirect(main, 'file', onProgress);
  const poster = data.get('poster');
  const posterName = poster?.size ? await uploadDirect(poster, 'poster', () => {}) : '';
  await api('/items/uploaded', {
    method: 'POST',
    body: {
      categoryId,
      title: data.get('title') || '',
      caption: data.get('caption') || '',
      file: fileName,
      poster: posterName,
      originalName: main.name,
      titleBox: titleBoxFromFormData(data),
    },
  });
}

function itemRow(item, index, total) {
  let form;
  const preview = titlePreview((colours) => setReadout(form.querySelector('.auto-readout'), colours));
  form = h(
    'form',
    {
      class: 'item-form',
      onsubmit: async (event) => {
        event.preventDefault();
        const data = await attachAutoColours(new FormData(form), preview);
        const fields = formObject(data);
        const body = { title: fields.title, caption: fields.caption, titleBox: titleBoxFromFormData(data) };
        saveWith(() => api(`/items/${item.id}`, { method: 'PUT', body }), 'Saved');
      },
      oninput: () => syncBoxForm(form, preview),
    },
    h('div', { class: 'grid-2' }, field('Title', 'title', item.title, { max: 120 }), field('Caption', 'caption', item.caption, { max: 500 })),
    titleBoxPanel(item.titleBox),
    h(
      'div',
      { class: 'row-actions' },
      h('button', { type: 'submit', class: 'primary small' }, 'Save'),
      item.poster ? h('button', { type: 'button', class: 'small', onclick: () => shrinkItemPoster(item) }, 'Shrink poster') : null,
      moveButtons('items', item.id, index, total),
      deleteButton('items', item.id, 'item', ' The file will be removed from the server.')
    )
  );
  preview.setMedia({ src: item.file, type: item.mediaType === 'video' ? 'video' : 'image', poster: item.poster || null });
  syncBoxForm(form, preview);
  return h('div', { class: 'media-row' }, preview.element, form);
}

// Fonts ----------------------------------------------------------------------

const FONT_USES = [
  ['anton', 'Anton', 'Video card titles (default), section headings, the hero name, motion counter, timeline role titles and client-feedback names.'],
  ['courier', 'Courier Prime', 'Video-open title and timeline dates.'],
  ['inter', 'Inter', 'Body text, navigation and buttons (the site default).'],
];

function fontsTab() {
  return h(
    'div',
    { class: 'panel-stack' },
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Fonts used on the site'),
      h('p', { class: 'muted' }, 'Video title boxes can use any of the title fonts below. Pick one per photo or video in Photos & videos, or set the default in Profile & photo.'),
      h(
        'div',
        { class: 'font-list' },
        FONT_USES.map(([key, name, uses]) =>
          h(
            'article',
            { class: 'font-card' },
            h('p', { class: 'font-sample', style: { fontFamily: TITLE_FONT_STACKS[key] } }, `${name} · Video title 01`),
            h('p', { class: 'muted' }, `${name}: ${uses}`)
          )
        )
      )
    )
  );
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
