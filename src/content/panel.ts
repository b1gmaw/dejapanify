/**
 * The panel that names a form's problem fields and jumps to them.
 *
 * Built like the undo chip: a closed shadow root on a fixed-position host, so
 * page styles cannot reach it and it never shifts the page's layout. The page's
 * own fields are never restyled; the highlight ring is drawn in our root over
 * the field's position.
 */
import { formRowOf, type FormControl } from './describe.js';
import type { Problem } from './errors.js';

const HOST_ID = 'dejapanify-panel-host';
/** Set on each listed field, so the page (and the self-test) can see what we flagged. */
const PROBLEM_ATTR = 'data-dejapanify-problem';
const RING_MS = 1500;

const STYLE = `
:host { all: initial; }
.panel {
  position: fixed; top: 16px; right: 16px; z-index: 2147483647;
  width: min(320px, calc(100vw - 32px)); max-height: 60vh; overflow: auto;
  box-sizing: border-box; padding: 12px 12px 10px; border-radius: 10px;
  background: #1f2937; color: #f9fafb; pointer-events: auto;
  font: 500 13px/1.5 system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif;
  box-shadow: 0 8px 28px rgba(0,0,0,.32);
}
.head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
.title { flex: 1; font-weight: 700; }
.note { margin: -4px 0 8px; color: #d1d5db; font-size: 12px; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
button {
  all: unset; box-sizing: border-box; cursor: pointer; border-radius: 6px;
  font: inherit; color: #f9fafb;
}
.item { display: block; width: 100%; padding: 6px 8px; background: rgba(255,255,255,.08); }
.item:hover { background: rgba(255,255,255,.16); }
.name { font-weight: 700; }
.reason { color: #fca5a5; }
.close { padding: 0 6px; font-size: 16px; line-height: 1.4; }
.close:hover { background: rgba(255,255,255,.16); }
.action { display: block; width: 100%; margin-top: 8px; padding: 6px 8px; text-align: center;
  background: #4f46e5; font-weight: 700; }
.action:hover { background: #4338ca; }
button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 1px; }
.ring {
  position: fixed; z-index: 2147483646; pointer-events: none; box-sizing: border-box;
  border: 3px solid #f59e0b; border-radius: 6px; box-shadow: 0 0 0 4px rgba(245,158,11,.3);
}
`;

export interface PanelAction {
  label: string;
  run(): void;
  /** Called when the user closes the panel without running the action. */
  dismiss?(): void;
}

export interface PanelOptions {
  problems: Problem[];
  /** A line under the title, e.g. how to proceed anyway. */
  note?: string;
  /** A button below the list, e.g. restoring wiped input. */
  action?: PanelAction;
  /** Scroll to and focus the first problem straight away. */
  autoJump?: boolean;
}

let host: HTMLDivElement | null = null;
let root: ShadowRoot | null = null;
let panel: HTMLDivElement | null = null;
let ring: HTMLDivElement | null = null;
let ringTimer: number | undefined;
let listed: Problem[] = [];
let unbind: (() => void) | null = null;

function ensureRoot(): ShadowRoot | null {
  if (root) return root;
  if (!document.body) return null;
  host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;';
  document.body.appendChild(host);
  root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  root.appendChild(style);
  return root;
}

/** Scroll `el` into view, focus it, and ring it briefly. */
export function jumpTo(el: FormControl): void {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }
  el.focus({ preventScroll: true });
  showRing(el);
}

function showRing(el: FormControl): void {
  const shadow = ensureRoot();
  if (!shadow) return;
  ring?.remove();
  const box = document.createElement('div');
  box.className = 'ring';
  shadow.appendChild(box);
  ring = box;
  const started = Date.now();
  // Follow the field while a smooth scroll carries it into place.
  const track = (): void => {
    if (ring !== box) return;
    const r = el.getBoundingClientRect();
    box.style.top = `${r.top - 4}px`;
    box.style.left = `${r.left - 4}px`;
    box.style.width = `${r.width + 8}px`;
    box.style.height = `${r.height + 8}px`;
    if (Date.now() - started < RING_MS) window.requestAnimationFrame?.(track);
  };
  track();
  window.clearTimeout(ringTimer);
  ringTimer = window.setTimeout(() => {
    if (ring === box) {
      box.remove();
      ring = null;
    }
  }, RING_MS);
}

function render(options: PanelOptions): void {
  if (!panel) return;
  panel.textContent = '';

  const head = document.createElement('div');
  head.className = 'head';
  const title = document.createElement('div');
  title.className = 'title';
  title.id = 'dejapanify-panel-title';
  title.textContent = listed.length > 0 ? `入力内容を確認してください（${listed.length}件）` : '入力内容';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close';
  close.setAttribute('aria-label', '閉じる');
  close.textContent = '×';
  close.addEventListener('click', () => dismissPanel(options));
  head.append(title, close);
  panel.appendChild(head);

  if (options.note && listed.length > 0) {
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = options.note;
    panel.appendChild(note);
  }

  const list = document.createElement('ul');
  for (const problem of listed) {
    const li = document.createElement('li');
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'item';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = problem.name;
    const reason = document.createElement('span');
    reason.className = 'reason';
    reason.textContent = ` — ${problem.reason}`;
    item.append(name, reason);
    item.addEventListener('click', () => jumpTo(problem.el));
    li.appendChild(item);
    list.appendChild(li);
  }
  panel.appendChild(list);

  if (options.action) {
    const { label, run } = options.action;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'action';
    action.textContent = label;
    action.addEventListener('click', () => {
      run();
      delete options.action;
      if (listed.length === 0) closePanel();
      else render(options);
    });
    panel.appendChild(action);
  }
}

/** Show the panel, replacing any open one. */
export function openPanel(options: PanelOptions): void {
  if (options.problems.length === 0 && !options.action) return;
  const shadow = ensureRoot();
  if (!shadow) return;
  closePanel();

  panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', 'dejapanify-panel-title');
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dismissPanel(options);
  });
  shadow.appendChild(panel);

  listed = [...options.problems];
  for (const p of listed) p.el.setAttribute(PROBLEM_ATTR, '');

  // Drop a problem once the user has edited its row and nothing in it is
  // still certainly wrong. Rows the page flagged for reasons we can't check
  // stay listed until the user touches them.
  const recheck = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    const before = listed.length;
    listed = listed.filter((p) => {
      if (!formRowOf(p.el).contains(target) || p.stillWrong()) return true;
      p.el.removeAttribute(PROBLEM_ATTR);
      return false;
    });
    if (listed.length === before) return;
    if (listed.length === 0 && !options.action) closePanel();
    else render(options);
  };
  document.addEventListener('input', recheck, true);
  document.addEventListener('change', recheck, true);
  unbind = () => {
    document.removeEventListener('input', recheck, true);
    document.removeEventListener('change', recheck, true);
  };

  render(options);
  if (options.autoJump && listed[0]) jumpTo(listed[0].el);
}

/** The user closed the panel: an action they passed over is declined. */
function dismissPanel(options: PanelOptions): void {
  options.action?.dismiss?.();
  closePanel();
}

export function closePanel(): void {
  unbind?.();
  unbind = null;
  for (const p of listed) p.el.removeAttribute(PROBLEM_ATTR);
  listed = [];
  panel?.remove();
  panel = null;
}

export function isPanelOpen(): boolean {
  return panel !== null;
}

/** Remove everything, e.g. when the extension is switched off. */
export function destroyPanel(): void {
  closePanel();
  window.clearTimeout(ringTimer);
  host?.remove();
  host = null;
  root = null;
  ring = null;
}
