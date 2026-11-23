// Free-placement layout for the top of the visitor page. The admin canvas uses this same file,
// so what the editor shows is what visitors get.
//
// Units: x, y, w and size are percentages of the canvas width. The canvas keeps a 16:9 ratio, so the
// whole layout scales with the screen. Below the stacking breakpoint the elements flow one under another,
// using the phone settings (spec.phone) where the admin set them, and the desktop settings everywhere else.
// Keep the defaults and font list in step with the server copy in src/validation.js.

export const FIXED_ELEMENTS = ['name', 'photo', 'labels', 'bio'];
export const ELEMENT_LABELS = { name: 'Name', photo: 'Photo', labels: 'Labels', bio: 'Bio' };
export const CANVAS_HEIGHT_PERCENT = (100 * 9) / 16;
export const STACK_QUERY = '(max-width: 760px)';
export const MAX_TEXT_BOXES = 12;
export const TEXT_BOX_PREFIX = 'box-';

// Font choices for every text on the canvas. The stacks are used on the page; the labels are shown in the editor.
export const FONT_CHOICES = [
  { id: 'anton', label: 'Anton (bold)', stack: "Anton, Impact, 'Arial Narrow', sans-serif" },
  { id: 'bebas', label: 'Bebas Neue', stack: "'Bebas Neue', Impact, sans-serif" },
  { id: 'oswald', label: 'Oswald', stack: "Oswald, 'Arial Narrow', sans-serif" },
  { id: 'montserrat', label: 'Montserrat', stack: 'Montserrat, system-ui, sans-serif' },
  { id: 'playfair', label: 'Playfair Display (serif)', stack: "'Playfair Display', Georgia, serif" },
  { id: 'courier', label: 'Courier Prime (typewriter)', stack: "'Courier Prime', 'Courier New', monospace" },
  { id: 'inter', label: 'Inter (clean sans)', stack: 'Inter, system-ui, sans-serif' },
  { id: 'pacifico', label: 'Pacifico (script)', stack: 'Pacifico, cursive' },
];
const FONT_STACKS = Object.fromEntries(FONT_CHOICES.map((font) => [font.id, font.stack]));

const TEXT_ALIGN = { left: 'left', centre: 'center', right: 'right' };
const FLEX_ALIGN = { left: 'flex-start', centre: 'center', right: 'flex-end' };
// Used when a colour is set to automatic (empty).
export const DEFAULT_COLOURS = { name: '#ffffff', labels: '#f4f1ea', bio: '#9d9ba3', box: '#ffffff' };
// Stacking order for elements the admin has not placed on phones yet: after the ones that have a phone order.
const UNORDERED_BASE = 1000;

const DEFAULT_ELEMENT = {
  font: 'anton',
  size: 2,
  bold: false,
  italic: false,
  upper: false,
  align: 'centre',
  color: '',
  background: '',
  radius: 0,
  hidden: false,
};

export const DEFAULT_HERO_LAYOUT = {
  name: { ...DEFAULT_ELEMENT, x: 0, y: 8, w: 100, size: 29, upper: true },
  photo: { ...DEFAULT_ELEMENT, x: 38, y: 24, w: 24 },
  labels: { ...DEFAULT_ELEMENT, x: 8, y: 50, w: 84, font: 'inter', size: 1.6, bold: true, upper: true },
  bio: { ...DEFAULT_ELEMENT, x: 6, y: 30, w: 28, font: 'inter', size: 1.1, align: 'left' },
};

export const DEFAULT_TEXT_BOX = { ...DEFAULT_ELEMENT, font: 'inter', size: 2.4, x: 30, y: 40, w: 40, align: 'centre' };

export function isTextBoxId(id) {
  return typeof id === 'string' && id.startsWith(TEXT_BOX_PREFIX);
}

// Fills in anything missing, so older saved layouts still draw. Boxes keep their text and order.
function withPhone(spec) {
  return { ...spec, phone: { ...(spec.phone || {}) } };
}

export function normalizeLayout(layout) {
  const stored = layout && typeof layout === 'object' && layout.elements ? layout.elements : {};
  const elements = {};
  for (const id of FIXED_ELEMENTS) {
    elements[id] = withPhone({ ...DEFAULT_HERO_LAYOUT[id], ...(stored[id] || {}) });
  }
  const boxes = (Array.isArray(layout?.boxes) ? layout.boxes : [])
    .filter((box) => box && isTextBoxId(box.id) && typeof box.text === 'string')
    .slice(0, MAX_TEXT_BOXES)
    .map((box) => withPhone({ ...DEFAULT_TEXT_BOX, ...box }));
  return { elements, boxes };
}

// Every element on the canvas, with its settings: the fixed ones first, then the text boxes.
export function allSpecs(layout) {
  const specs = { ...layout.elements };
  for (const box of layout.boxes) specs[box.id] = box;
  return specs;
}

// Every element from top to bottom as it stacks on phones: the admin's phone order first, then by position.
export function stackOrder(specs) {
  const key = (spec) => spec.phone?.order ?? UNORDERED_BASE + spec.y;
  return Object.keys(specs).sort((a, b) => key(specs[a]) - key(specs[b]) || specs[a].x - specs[b].x);
}

function styleVars(colourKey, style, prefix) {
  return {
    [`--lp-${prefix}font`]: FONT_STACKS[style.font] || FONT_STACKS.inter,
    [`--lp-${prefix}size`]: `${style.size}cqw`,
    [`--lp-${prefix}weight`]: style.bold ? '700' : '400',
    [`--lp-${prefix}style`]: style.italic ? 'italic' : 'normal',
    [`--lp-${prefix}transform`]: style.upper ? 'uppercase' : 'none',
    [`--lp-${prefix}align`]: TEXT_ALIGN[style.align] || 'center',
    [`--lp-${prefix}justify`]: FLEX_ALIGN[style.align] || 'center',
    [`--lp-${prefix}color`]: style.color || DEFAULT_COLOURS[colourKey],
    [`--lp-${prefix}box`]: style.background || 'transparent',
    [`--lp-${prefix}pad`]: style.background ? '0.15em 0.45em' : '0',
    [`--lp-${prefix}radius`]: `${style.radius}px`,
  };
}

// CSS custom properties for one element. Desktop values use --lp-*, phone values use --lp-m-*.
// The stylesheet picks the set that matches the screen, so nothing is hard-coded per element.
export function elementVars(id, spec) {
  const placement = { '--x': `${spec.x}cqw`, '--y': `${spec.y}cqw`, '--w': `${spec.w}cqw` };
  const phone = { ...spec, ...spec.phone };
  const phoneWidth = { '--lp-m-w': `${phone.w}cqw` };
  if (id === 'photo') return { ...placement, ...phoneWidth };
  const colourKey = isTextBoxId(id) ? 'box' : id;
  return { ...placement, ...styleVars(colourKey, spec, ''), ...styleVars(colourKey, phone, 'm-'), ...phoneWidth };
}

// Places every element in `nodes` (element id -> DOM node). Ids without a spec are left alone.
export function applyHeroLayout(nodes, layout) {
  const normalized = normalizeLayout(layout);
  const specs = allSpecs(normalized);
  const order = stackOrder(specs);
  for (const id of Object.keys(nodes)) {
    const node = nodes[id];
    const spec = specs[id];
    if (!spec) continue;
    node.classList.add('lp-el', `lp-${isTextBoxId(id) ? 'box' : id}`);
    if (id !== 'photo') node.classList.add('lp-text');
    node.classList.toggle('lp-hidden', spec.hidden === true);
    node.classList.toggle('lp-phone-hidden', spec.phone?.hidden === true);
    node.style.order = String(order.indexOf(id));
    for (const [name, value] of Object.entries(elementVars(id, spec))) {
      node.style.setProperty(name, value);
    }
  }
  return normalized;
}

// Keeps the stacked (phone) arrangement in step with the window width.
export function followViewport(canvas) {
  const media = window.matchMedia(STACK_QUERY);
  const update = () => canvas.classList.toggle('lp-stacked', media.matches);
  media.addEventListener('change', update);
  update();
}
