// Admin canvas for the top of the visitor page. It edits the same layout the visitor page reads
// (public/js/layout.js), so the preview and the live page come from one set of rules.
import { h } from '/js/dom.js';
import {
  FIXED_ELEMENTS,
  ELEMENT_LABELS,
  DEFAULT_HERO_LAYOUT,
  DEFAULT_TEXT_BOX,
  DEFAULT_COLOURS,
  CANVAS_HEIGHT_PERCENT,
  FONT_CHOICES,
  MAX_TEXT_BOXES,
  TEXT_BOX_PREFIX,
  allSpecs,
  isTextBoxId,
  normalizeLayout,
  applyHeroLayout,
  stackOrder,
} from '/js/layout.js';

const FONT_OPTIONS = FONT_CHOICES.map((font) => [font.id, font.label]);
const ALIGN_CHOICES = [
  ['left', 'Left'],
  ['centre', 'Centre'],
  ['right', 'Right'],
];
const SHAPE_CHOICES = [
  ['square', 'Square'],
  ['circle', 'Circle'],
];
const INLINE_TEXT = ['name', 'bio'];
const BOX_START_COLOUR = '#6955ff';
const MIN_WIDTH = 5;
const SNAP_DISTANCE = 0.6;
const NUDGE = 0.5;
const NUDGE_FAST = 2;
const MAX_LABELS = 5;
// Size readout: one percent of the width is about 14.4px on a 1440px screen.
const PX_PER_PERCENT = 14.4;
const ARROW_STEPS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

// Set while the canvas has changes that are not saved yet. Read by the admin shell before it switches tabs.
let hasUnsaved = false;
export function hasUnsavedLayout() {
  return hasUnsaved;
}
window.addEventListener('beforeunload', (event) => {
  if (!hasUnsaved) return;
  event.preventDefault();
  event.returnValue = '';
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(value * 100) / 100;
const textOf = (node) => node.querySelector('.le-text');
const randomBoxId = () => `${TEXT_BOX_PREFIX}${Math.random().toString(36).slice(2, 10)}`;

// Undo and redo. Each step is a copy of the layout, text and photo shape. Quick repeated changes of the same kind
// (dragging, typing, nudging) are merged into one step.
const HISTORY_LIMIT = 100;
const COALESCE_MS = 800;
function emptyHistory() {
  return { past: [], future: [], lastKey: null, lastAt: 0 };
}
function snapshot(ctx) {
  return { layout: ctx.state.layout, texts: ctx.state.texts, photoShape: ctx.state.photoShape };
}
function updateHistoryButtons(ctx) {
  if (ctx.undoButton) ctx.undoButton.disabled = ctx.history.past.length === 0;
  if (ctx.redoButton) ctx.redoButton.disabled = ctx.history.future.length === 0;
}
// Call before a change: stores the state so it can be undone. A forced checkpoint always starts a new step.
function checkpoint(ctx, key, force = false) {
  const history = ctx.history;
  const now = Date.now();
  const sameKind = !force && key === history.lastKey && now - history.lastAt < COALESCE_MS;
  history.lastAt = now;
  if (sameKind) return;
  history.past.push(snapshot(ctx));
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future = [];
  history.lastKey = key;
  updateHistoryButtons(ctx);
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

// Form controls ---------------------------------------------------------------

function fieldLabel(text, control) {
  return h('label', { class: 'field' }, h('span', {}, text), control);
}

function checkControl(text, checked, onChange) {
  return h(
    'label',
    { class: 'le-check' },
    h('input', { type: 'checkbox', checked: checked || undefined, onchange: (event) => onChange(event.target.checked) }),
    text
  );
}

function selectControl(text, choices, value, onChange) {
  const options = choices.map(([option, label]) => h('option', { value: option, selected: option === value || undefined }, label));
  return fieldLabel(text, h('select', { onchange: (event) => onChange(event.target.value) }, options));
}

function rangeControl(text, value, { min, max, step, format }, onInput) {
  const output = h('output', {}, format(value));
  const input = h('input', {
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
    oninput: (event) => {
      const next = Number(event.target.value);
      output.textContent = format(next);
      onInput(next);
    },
  });
  return h('label', { class: 'field le-range' }, h('span', {}, text, ' ', output), input);
}

// An empty colour means "automatic": the theme colour is used.
function colourControl(text, value, fallback, onChange) {
  const auto = value === '';
  const picker = h('input', {
    type: 'color',
    value: auto ? fallback : value,
    disabled: auto || undefined,
    oninput: (event) => onChange(event.target.value, false),
  });
  return h(
    'div',
    { class: 'le-colour' },
    h('span', { class: 'le-caption' }, text),
    h('div', { class: 'le-colour-row' }, picker, checkControl('Automatic', auto, (on) => onChange(on ? '' : fallback, true)))
  );
}

// State and drawing -----------------------------------------------------------

// Unsaved canvas work is kept here, tagged with the saved layout it started from. Other saves redraw the
// admin from the server; this keeps the draft when the saved layout has not changed, so nothing is lost.
let keptDraft = null;

function createContext(profile, onSave) {
  const base = JSON.stringify(profile.layout ?? null);
  const kept = keptDraft && keptDraft.base === base ? keptDraft : null;
  hasUnsaved = Boolean(kept);
  return {
    profile,
    onSave,
    base,
    history: kept ? kept.history : emptyHistory(),
    undoButton: null,
    redoButton: null,
    state: {
      layout: kept ? kept.layout : normalizeLayout(profile.layout),
      texts: kept ? kept.texts : { name: profile.name, labels: [...(profile.heroLabels || [])], bio: profile.bio || '' },
      photo: profile.photo || '',
      photoShape: kept ? kept.photoShape : profile.photoShape || 'square',
      selected: 'name',
      phone: false,
    },
    nodes: {},
    viewButtons: {},
    canvas: h('div', { class: 'lp-canvas le-canvas', tabindex: '0', role: 'group', 'aria-label': 'Page layout canvas' }),
    guide: h('div', { class: 'le-guide', 'aria-hidden': 'true' }),
    props: h('div', { class: 'le-props' }),
    readout: h('p', { class: 'le-readout muted' }),
    status: h('span', { class: 'le-status muted' }, kept ? 'Unsaved changes. Save layout to publish them.' : 'Showing the saved layout.'),
    frame: h('div', { class: 'le-frame' }),
    boxCount: h('span', { class: 'muted le-hint' }),
  };
}

// Every element id currently on the canvas: the fixed elements, then the text boxes.
function allIds(ctx) {
  return Object.keys(allSpecs(ctx.state.layout));
}

function specOf(ctx, id) {
  return allSpecs(ctx.state.layout)[id];
}

function makeNode(ctx, id) {
  const handle = h('span', { class: 'le-handle', 'aria-hidden': 'true' });
  let node;
  if (id === 'photo') {
    node = h('div', { class: 'le-el', dataset: { el: id } }, h('div', { class: 'lp-frame' }), handle);
  } else if (id === 'labels') {
    node = h('div', { class: 'le-el', dataset: { el: id } }, handle);
  } else {
    node = textNode(id, handle);
  }
  node.addEventListener('pointerdown', (event) => startGesture(ctx, id, event));
  if (id !== 'photo' && id !== 'labels') attachInlineEditing(ctx, id, node);
  return node;
}

function textNode(id, handle) {
  const placeholder = id === 'name' ? 'Your name' : id === 'bio' ? 'Short bio: double-click to write' : 'Double-click to type';
  const text = h('span', { class: 'le-text', dataset: { placeholder } });
  return h(id === 'name' ? 'h1' : 'p', { class: 'le-el', dataset: { el: id } }, text, handle);
}

function attachInlineEditing(ctx, id, node) {
  const text = textOf(node);
  node.addEventListener('dblclick', () => startEditing(text));
  text.addEventListener('input', () => storeText(ctx, id, text.innerText));
  text.addEventListener('blur', () => {
    text.contentEditable = 'false';
    renderProps(ctx);
  });
  text.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || (event.key === 'Enter' && id === 'name')) {
      event.preventDefault();
      text.blur();
    }
  });
}

function startEditing(text) {
  text.contentEditable = 'true';
  text.focus();
  const range = document.createRange();
  range.selectNodeContents(text);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function textIsEditing(ctx, id) {
  const text = textOf(ctx.nodes[id]);
  return Boolean(text && text.isContentEditable);
}

function markDirty(ctx) {
  hasUnsaved = true;
  keptDraft = {
    base: ctx.base,
    layout: ctx.state.layout,
    texts: ctx.state.texts,
    photoShape: ctx.state.photoShape,
    history: ctx.history,
  };
  ctx.status.textContent = 'Unsaved changes. Save layout to publish them.';
}

// Replaces one element's settings (a fixed element or a text box). Layout is kept immutable.
// In the phone preview, changes are saved as phone settings and the desktop settings stay as they were.
function update(ctx, id, patch, rebuild = false) {
  if (!ctx.state.phone) {
    writeLayout(ctx, id, patch, rebuild);
    return;
  }
  writeLayout(ctx, id, { phone: { ...specOf(ctx, id).phone, ...patch } }, rebuild);
}

function writeLayout(ctx, id, patch, rebuild = false) {
  checkpoint(ctx, `prop:${id}:${Object.keys(patch).join(',')}`);
  const { elements, boxes } = ctx.state.layout;
  const next = isTextBoxId(id)
    ? { elements, boxes: boxes.map((box) => (box.id === id ? { ...box, ...patch } : box)) }
    : { elements: { ...elements, [id]: { ...elements[id], ...patch } }, boxes };
  ctx.state.layout = next;
  markDirty(ctx);
  refresh(ctx);
  if (rebuild) renderProps(ctx);
}

function readoutText(ctx) {
  const id = ctx.state.selected;
  const label = ELEMENT_LABELS[id] || 'Text box';
  if (ctx.state.phone) {
    const order = stackOrder(allSpecs(ctx.state.layout));
    return `${label} is ${order.indexOf(id) + 1} of ${order.length} on phones, counting from the top.`;
  }
  const spec = specOf(ctx, id);
  return `${label}: ${round(spec.x)}% from left, ${round(spec.y)}% from top, ${round(spec.w)}% wide.`;
}

function refresh(ctx) {
  applyHeroLayout(ctx.nodes, ctx.state.layout);
  ctx.readout.textContent = readoutText(ctx);
  ctx.boxCount.textContent = `${ctx.state.layout.boxes.length} of ${MAX_TEXT_BOXES} text boxes`;
}

function select(ctx, id) {
  ctx.state.selected = id;
  for (const other of allIds(ctx)) ctx.nodes[other].classList.toggle('is-selected', other === id);
  renderProps(ctx);
  refresh(ctx);
}

// Dragging and resizing -------------------------------------------------------

function startGesture(ctx, id, event) {
  if (event.button !== 0 || textIsEditing(ctx, id)) return;
  select(ctx, id);
  if (ctx.state.phone) return;
  event.preventDefault();
  ctx.canvas.focus({ preventScroll: true });
  const mode = event.target.classList.contains('le-handle') ? 'resize' : 'move';
  const node = ctx.nodes[id];
  const start = { x: event.clientX, y: event.clientY, spec: specOf(ctx, id) };
  try {
    node.setPointerCapture(event.pointerId);
  } catch {
    // Capture only keeps the drag going when the pointer leaves the element; dragging still works without it.
  }
  const track = (moveEvent) => dragTo(ctx, id, mode, start, moveEvent);
  const finish = () => {
    node.removeEventListener('pointermove', track);
    ctx.guide.classList.remove('is-on');
    renderProps(ctx);
  };
  node.addEventListener('pointermove', track);
  node.addEventListener('pointerup', finish, { once: true });
  node.addEventListener('pointercancel', finish, { once: true });
}

function dragTo(ctx, id, mode, start, event) {
  const width = ctx.canvas.getBoundingClientRect().width;
  const dx = ((event.clientX - start.x) / width) * 100;
  const dy = ((event.clientY - start.y) / width) * 100;
  if (mode === 'resize') {
    update(ctx, id, { w: round(clamp(start.spec.w + dx, MIN_WIDTH, 100 - start.spec.x)) });
    return;
  }
  let x = clamp(start.spec.x + dx, 0, 100 - start.spec.w);
  const centre = 50 - start.spec.w / 2;
  const snapped = Math.abs(x - centre) < SNAP_DISTANCE;
  if (snapped) x = centre;
  ctx.guide.classList.toggle('is-on', snapped);
  update(ctx, id, { x: round(x), y: round(clamp(start.spec.y + dy, 0, CANVAS_HEIGHT_PERCENT)) });
}

function nudge(ctx, event) {
  const step = ARROW_STEPS[event.key];
  if (!step || event.target !== ctx.canvas || ctx.state.phone) return;
  event.preventDefault();
  const amount = event.shiftKey ? NUDGE_FAST : NUDGE;
  const id = ctx.state.selected;
  const spec = specOf(ctx, id);
  update(ctx, id, {
    x: round(clamp(spec.x + step[0] * amount, 0, 100 - spec.w)),
    y: round(clamp(spec.y + step[1] * amount, 0, CANVAS_HEIGHT_PERCENT)),
  });
}

// Content ---------------------------------------------------------------------

// The text a node should show for an element id.
function textFor(ctx, id) {
  if (id === 'name') return ctx.state.texts.name;
  if (id === 'bio') return ctx.state.texts.bio;
  return specOf(ctx, id).text;
}

// Records typed text without redrawing the node being typed in.
function storeText(ctx, id, value) {
  if (isTextBoxId(id)) {
    writeLayout(ctx, id, { text: value });
    return;
  }
  checkpoint(ctx, `text:${id}`);
  ctx.state.texts = { ...ctx.state.texts, [id]: value };
  markDirty(ctx);
}

function setText(ctx, id, value) {
  storeText(ctx, id, value);
  textOf(ctx.nodes[id]).textContent = value;
}

function setLabels(ctx, raw) {
  checkpoint(ctx, 'labels');
  const labels = raw
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, MAX_LABELS);
  ctx.state.texts = { ...ctx.state.texts, labels };
  renderLabels(ctx);
  markDirty(ctx);
}

function renderLabels(ctx) {
  const node = ctx.nodes.labels;
  node.querySelectorAll('.hero-label').forEach((label) => label.remove());
  node.prepend(...ctx.state.texts.labels.map((label) => h('span', { class: 'hero-label' }, label)));
}

function renderPhoto(ctx) {
  const frame = ctx.nodes.photo.querySelector('.lp-frame');
  const { photo, photoShape, texts } = ctx.state;
  frame.classList.toggle('is-circle', photoShape === 'circle');
  frame.replaceChildren(photo ? h('img', { src: photo, alt: '' }) : h('span', { class: 'photo-placeholder' }, initials(texts.name)));
}

function setShape(ctx, value) {
  checkpoint(ctx, 'shape');
  ctx.state.photoShape = value;
  renderPhoto(ctx);
  markDirty(ctx);
}

function renderAllText(ctx) {
  for (const id of INLINE_TEXT) textOf(ctx.nodes[id]).textContent = textFor(ctx, id);
  for (const box of ctx.state.layout.boxes) textOf(ctx.nodes[box.id]).textContent = box.text;
  renderLabels(ctx);
  renderPhoto(ctx);
}

// Text boxes ------------------------------------------------------------------

function addBox(ctx) {
  if (ctx.state.layout.boxes.length >= MAX_TEXT_BOXES) {
    ctx.status.textContent = `You can add up to ${MAX_TEXT_BOXES} text boxes.`;
    return;
  }
  checkpoint(ctx, `add:${Date.now()}`, true);
  const box = { ...DEFAULT_TEXT_BOX, id: randomBoxId(), text: 'New text' };
  ctx.state.layout = { ...ctx.state.layout, boxes: [...ctx.state.layout.boxes, box] };
  ctx.nodes[box.id] = makeNode(ctx, box.id);
  ctx.canvas.append(ctx.nodes[box.id]);
  textOf(ctx.nodes[box.id]).textContent = box.text;
  markDirty(ctx);
  select(ctx, box.id);
}

// Text boxes are removed from the page. The fixed elements (name, photo, labels, bio) are hidden; "Show on page" brings them back.
function deleteElement(ctx, id) {
  if (!isTextBoxId(id)) {
    update(ctx, id, { hidden: true }, true);
    return;
  }
  checkpoint(ctx, `delete:${id}`, true);
  ctx.state.layout = { ...ctx.state.layout, boxes: ctx.state.layout.boxes.filter((box) => box.id !== id) };
  syncNodes(ctx);
  markDirty(ctx);
  select(ctx, 'name');
}

// Makes the canvas nodes match the text boxes in the layout (after undo or redo).
function syncNodes(ctx) {
  const wanted = new Set(ctx.state.layout.boxes.map((box) => box.id));
  for (const id of Object.keys(ctx.nodes)) {
    if (isTextBoxId(id) && !wanted.has(id)) {
      ctx.nodes[id].remove();
      delete ctx.nodes[id];
    }
  }
  for (const box of ctx.state.layout.boxes) {
    if (!ctx.nodes[box.id]) {
      ctx.nodes[box.id] = makeNode(ctx, box.id);
      ctx.canvas.append(ctx.nodes[box.id]);
    }
  }
}

function applySnapshot(ctx, snap) {
  ctx.history.lastKey = null;
  ctx.state.layout = snap.layout;
  ctx.state.texts = snap.texts;
  ctx.state.photoShape = snap.photoShape;
  syncNodes(ctx);
  renderAllText(ctx);
  renderPhoto(ctx);
  if (!specOf(ctx, ctx.state.selected)) ctx.state.selected = 'name';
  select(ctx, ctx.state.selected);
  markDirty(ctx);
  updateHistoryButtons(ctx);
}

function undo(ctx) {
  const history = ctx.history;
  if (!history.past.length) return;
  history.future.push(snapshot(ctx));
  applySnapshot(ctx, history.past.pop());
}

function redo(ctx) {
  const history = ctx.history;
  if (!history.future.length) return;
  history.past.push(snapshot(ctx));
  applySnapshot(ctx, history.future.pop());
}

// Ctrl+Z undo, Ctrl+Y or Ctrl+Shift+Z redo, Delete removes the selected element. Arrow keys nudge.
function keyboard(ctx, event) {
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (modifier && key === 'z' && !event.shiftKey) {
    event.preventDefault();
    undo(ctx);
  } else if (modifier && (key === 'y' || (key === 'z' && event.shiftKey))) {
    event.preventDefault();
    redo(ctx);
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && event.target === ctx.canvas) {
    event.preventDefault();
    deleteElement(ctx, ctx.state.selected);
  } else {
    nudge(ctx, event);
  }
}

// Properties panel ------------------------------------------------------------

// The settings the canvas edits: the desktop ones, or the phone ones (desktop values fill in anything the phone does not set).
function viewSpec(ctx, id) {
  const spec = specOf(ctx, id);
  if (!ctx.state.phone) return spec;
  return { ...spec, ...spec.phone, hidden: spec.phone.hidden === true };
}

function deleteLabel(ctx, id) {
  if (isTextBoxId(id)) return 'Delete text box';
  return ctx.state.phone ? 'Hide on phone' : 'Delete element';
}

function resetElement(ctx, id) {
  if (ctx.state.phone) {
    writeLayout(ctx, id, { phone: {} }, true);
    return;
  }
  writeLayout(ctx, id, isTextBoxId(id) ? DEFAULT_TEXT_BOX : DEFAULT_HERO_LAYOUT[id], true);
}

// Moves the element one place up or down the phone stack. Every element gets an explicit phone order.
function moveInStack(ctx, id, direction) {
  const order = stackOrder(allSpecs(ctx.state.layout));
  const from = order.indexOf(id);
  const to = from + direction;
  if (to < 0 || to >= order.length) return;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  const position = (key) => next.indexOf(key);
  const withOrder = (spec, key) => ({ ...spec, phone: { ...spec.phone, order: position(key) } });
  const { elements, boxes } = ctx.state.layout;
  checkpoint(ctx, `order:${id}`, true);
  ctx.state.layout = {
    elements: Object.fromEntries(Object.entries(elements).map(([key, spec]) => [key, withOrder(spec, key)])),
    boxes: boxes.map((box) => withOrder(box, box.id)),
  };
  markDirty(ctx);
  refresh(ctx);
  renderProps(ctx);
}

function phoneOrderControls(ctx, id) {
  const order = stackOrder(allSpecs(ctx.state.layout));
  const index = order.indexOf(id);
  return [
    h(
      'div',
      { class: 'row-actions' },
      h('button', { type: 'button', class: 'ghost small', disabled: index === 0 || undefined, onclick: () => moveInStack(ctx, id, -1) }, 'Move up'),
      h(
        'button',
        { type: 'button', class: 'ghost small', disabled: index === order.length - 1 || undefined, onclick: () => moveInStack(ctx, id, 1) },
        'Move down'
      )
    ),
    h('p', { class: 'muted le-hint' }, 'The phone version stacks elements from the top down in this order. The desktop layout is not changed.'),
  ];
}

function renderProps(ctx) {
  const id = ctx.state.selected;
  const change = (patch, rebuild = false) => update(ctx, id, patch, rebuild);
  const title = ELEMENT_LABELS[id] || 'Text box';
  const parts = [
    h('h3', { class: 'le-props-title' }, ctx.state.phone ? `${title} · phone` : title),
    ...(ctx.state.phone ? phoneOrderControls(ctx, id) : []),
    ...contentControls(ctx, id),
    ...styleControls(ctx, id, viewSpec(ctx, id), change),
    h('button', { type: 'button', class: 'danger small', onclick: () => deleteElement(ctx, id) }, deleteLabel(ctx, id)),
    h(
      'button',
      { type: 'button', class: 'ghost small', onclick: () => resetElement(ctx, id) },
      ctx.state.phone ? 'Reset phone settings' : 'Reset this element'
    ),
  ];
  ctx.props.replaceChildren(...parts.filter(Boolean));
}

function contentControls(ctx, id) {
  const { texts } = ctx.state;
  if (id === 'photo') {
    return [
      selectControl('Photo shape', SHAPE_CHOICES, ctx.state.photoShape, (value) => setShape(ctx, value)),
      h('p', { class: 'muted le-hint' }, 'To change the photo, use Upload photo in the card below.'),
    ];
  }
  if (id === 'labels') {
    const input = h('input', { value: texts.labels.join(', '), maxlength: '200', oninput: (event) => setLabels(ctx, event.target.value) });
    return [fieldLabel(`Labels (comma separated, up to ${MAX_LABELS})`, input)];
  }
  if (id === 'bio') {
    const area = h('textarea', { maxlength: '1000', oninput: (event) => setText(ctx, id, event.target.value) }, texts.bio);
    return [fieldLabel('Bio', area)];
  }
  if (isTextBoxId(id)) {
    const area = h('textarea', { maxlength: '500', oninput: (event) => setText(ctx, id, event.target.value) }, specOf(ctx, id).text);
    return [fieldLabel('Text', area)];
  }
  const input = h('input', { value: texts.name, maxlength: '60', oninput: (event) => setText(ctx, id, event.target.value) });
  return [fieldLabel('Name', input)];
}

function sizeLabel(value) {
  return `${value}% · about ${Math.round(value * PX_PER_PERCENT)}px`;
}

function styleControls(ctx, id, spec, change) {
  const phone = ctx.state.phone;
  const width = rangeControl(
    phone ? 'Width on phone' : 'Width',
    spec.w,
    { min: MIN_WIDTH, max: 100, step: 0.5, format: (value) => `${value}%` },
    (w) => change({ w })
  );
  const visible = checkControl(phone ? 'Show on phone' : 'Show on page', !spec.hidden, (on) => change({ hidden: !on }, true));
  // On phones, text is always full width, so only the photo keeps a width setting.
  const placement = phone && id !== 'photo' ? [visible] : [width, visible];
  if (id === 'photo') return placement;
  const boxed = spec.background !== '';
  return [
    selectControl('Font', FONT_OPTIONS, spec.font, (font) => change({ font })),
    rangeControl('Size', spec.size, { min: 0.8, max: 40, step: 0.1, format: sizeLabel }, (size) => change({ size })),
    h(
      'div',
      { class: 'le-flags' },
      checkControl('Bold', spec.bold, (on) => change({ bold: on })),
      checkControl('Italic', spec.italic, (on) => change({ italic: on })),
      checkControl('Capitals', spec.upper, (on) => change({ upper: on }))
    ),
    selectControl('Align', ALIGN_CHOICES, spec.align, (align) => change({ align })),
    colourControl('Text colour', spec.color, DEFAULT_COLOURS[isTextBoxId(id) ? 'box' : id], (color, rebuild) => change({ color }, rebuild)),
    checkControl('Background box', boxed, (on) => change({ background: on ? BOX_START_COLOUR : '' }, true)),
    boxed ? colourControl('Box colour', spec.background, BOX_START_COLOUR, (background) => change({ background })) : null,
    rangeControl('Corner radius', spec.radius, { min: 0, max: 60, step: 1, format: (value) => `${value}px` }, (radius) => change({ radius })),
    ...placement,
  ];
}

// Toolbar and saving ----------------------------------------------------------

// The profile route replaces title, tagline and credit fields when they are missing, so they are always sent.
function saveBody(ctx, layout) {
  const { profile, state } = ctx;
  return {
    name: state.texts.name,
    title: profile.title ?? '',
    tagline: profile.tagline ?? '',
    bio: state.texts.bio,
    heroLabels: state.texts.labels.join(', '),
    photoShape: state.photoShape,
    createdByName: profile.createdByName ?? '',
    createdByUrl: profile.createdByUrl ?? '',
    layout,
  };
}

// The draft is only dropped when the saved layout changes on the server (see createContext), so a failed save keeps it.
function saveLayout(ctx, layout) {
  ctx.onSave(saveBody(ctx, layout));
}

function setPhone(ctx, on) {
  ctx.state.phone = on;
  ctx.canvas.classList.toggle('lp-stacked', on);
  ctx.frame.classList.toggle('is-phone', on);
  ctx.viewButtons.desktop.setAttribute('aria-pressed', String(!on));
  ctx.viewButtons.phone.setAttribute('aria-pressed', String(on));
  refresh(ctx);
  renderProps(ctx);
}

function resetLayout(ctx) {
  if (!confirm('Reset every element to the starting layout? Your text and text boxes are kept.')) return;
  checkpoint(ctx, `reset:${Date.now()}`, true);
  ctx.state.layout = { ...normalizeLayout(null), boxes: ctx.state.layout.boxes };
  markDirty(ctx);
  refresh(ctx);
  renderProps(ctx);
}

function turnOffCanvas(ctx) {
  if (!confirm('Turn the canvas off? The visitor page goes back to the classic top. Your text is kept.')) return;
  saveLayout(ctx, null);
}

function viewToggle(ctx) {
  const desktop = h('button', { type: 'button', onclick: () => setPhone(ctx, false) }, 'Desktop');
  const phone = h('button', { type: 'button', onclick: () => setPhone(ctx, true) }, 'Phone preview');
  ctx.viewButtons = { desktop, phone };
  return h('div', { class: 'le-segment' }, desktop, phone);
}

function toolbar(ctx) {
  ctx.undoButton = h('button', { type: 'button', title: 'Undo (Ctrl+Z)', onclick: () => undo(ctx) }, 'Undo');
  ctx.redoButton = h('button', { type: 'button', title: 'Redo (Ctrl+Y)', onclick: () => redo(ctx) }, 'Redo');
  updateHistoryButtons(ctx);
  return h(
    'div',
    { class: 'le-toolbar' },
    viewToggle(ctx),
    h('button', { type: 'button', class: 'primary', onclick: () => saveLayout(ctx, ctx.state.layout) }, 'Save layout'),
    ctx.undoButton,
    ctx.redoButton,
    h('button', { type: 'button', onclick: () => addBox(ctx) }, 'Add text box'),
    h('button', { type: 'button', onclick: () => resetLayout(ctx) }, 'Reset to default'),
    h('button', { type: 'button', class: 'ghost', onclick: () => turnOffCanvas(ctx) }, 'Use classic top'),
    ctx.status
  );
}

// Entry point -----------------------------------------------------------------

export function layoutEditorCard({ profile, onSave }) {
  const ctx = createContext(profile, onSave);
  for (const id of FIXED_ELEMENTS) ctx.nodes[id] = makeNode(ctx, id);
  for (const box of ctx.state.layout.boxes) ctx.nodes[box.id] = makeNode(ctx, box.id);
  ctx.canvas.append(ctx.guide, ...Object.values(ctx.nodes));
  ctx.canvas.addEventListener('keydown', (event) => keyboard(ctx, event));
  renderAllText(ctx);
  ctx.frame.append(ctx.canvas);
  select(ctx, 'name');
  return h(
    'section',
    { class: 'card le-card' },
    h('h2', {}, 'Page layout canvas'),
    h(
      'p',
      { class: 'muted' },
      'Arrange the top of your page here. Save, and the visitor page changes to match. On phones the elements stack automatically, in the same top-to-bottom order.'
    ),
    toolbar(ctx),
    h(
      'div',
      { class: 'le-hint-row' },
      h('p', { class: 'muted le-hint' }, 'Desktop: drag an element to move it. Drag the purple corner to change its width. Phone preview: change how each element looks on phones and reorder them; the desktop layout is not affected. Double-click text to edit it. Arrow keys nudge the selected element (hold Shift for bigger steps).'),
      ctx.boxCount
    ),
    h('div', { class: 'le-body' }, h('div', { class: 'le-stage' }, ctx.frame, ctx.readout), ctx.props)
  );
}
