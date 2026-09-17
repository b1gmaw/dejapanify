/**
 * The small chip shown after a conversion: what changed, and an undo.
 *
 * Rendered into a shadow root attached to a fixed-position host so that page
 * stylesheets cannot restyle it and page layout cannot clip it. Positioned
 * against the field's viewport rect rather than inserted near the field, which
 * would perturb the page's own layout.
 */
import { FIELD_KIND_LABELS, type FieldKind } from '../core/types.js';
import type { EditableField } from './describe.js';

const HOST_ID = 'dejapanify-indicator-host';
const VISIBLE_MS = 4000;

const STYLE = `
:host { all: initial; }
.chip {
  position: fixed;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: #1f2937;
  color: #f9fafb;
  font: 500 12px/1.4 system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif;
  box-shadow: 0 4px 16px rgba(0,0,0,.28);
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity .16s ease, transform .16s ease;
  pointer-events: auto;
  max-width: 320px;
}
.chip[data-visible="true"] { opacity: 1; transform: translateY(0); }
.tick { color: #34d399; font-weight: 700; }
.label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button {
  all: unset;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 5px;
  background: rgba(255,255,255,.12);
  color: #f9fafb;
  font: inherit;
  white-space: nowrap;
}
button:hover { background: rgba(255,255,255,.22); }
button:focus-visible { outline: 2px solid #60a5fa; }
@media (prefers-reduced-motion: reduce) { .chip { transition: none; } }
`;

let host: HTMLDivElement | null = null;
let root: ShadowRoot | null = null;
let chip: HTMLDivElement | null = null;
let hideTimer: number | undefined;
let detach: (() => void) | null = null;

function ensureRoot(): ShadowRoot | null {
  if (root) return root;
  if (!document.body) return null;

  host = document.createElement('div');
  host.id = HOST_ID;
  // The host itself must not affect layout or intercept clicks.
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;';
  document.body.appendChild(host);

  root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  root.appendChild(style);

  chip = document.createElement('div');
  chip.className = 'chip';
  chip.setAttribute('role', 'status');
  chip.setAttribute('aria-live', 'polite');
  root.appendChild(chip);

  return root;
}

function position(el: EditableField): void {
  if (!chip) return;
  const rect = el.getBoundingClientRect();
  // Prefer below the field; flip above when it would fall off-screen.
  const below = rect.bottom + 6;
  const chipHeight = chip.offsetHeight || 30;
  const top = below + chipHeight > window.innerHeight ? Math.max(4, rect.top - chipHeight - 6) : below;
  const left = Math.min(Math.max(4, rect.left), Math.max(4, window.innerWidth - 330));
  chip.style.top = `${top}px`;
  chip.style.left = `${left}px`;
}

/** Show the chip for a conversion that just happened. */
export function showConversion(el: EditableField, kind: FieldKind, onUndo: () => void): void {
  if (!ensureRoot() || !chip) return;

  chip.textContent = '';

  const tick = document.createElement('span');
  tick.className = 'tick';
  tick.textContent = '✓';

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = `${FIELD_KIND_LABELS[kind].split(' (')[0]}に変換`;

  const undo = document.createElement('button');
  undo.type = 'button';
  undo.textContent = '⟲ 元に戻す';
  undo.addEventListener('click', () => {
    onUndo();
    hide();
  });

  chip.append(tick, label, undo);
  position(el);
  chip.dataset.visible = 'true';

  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(hide, VISIBLE_MS);

  // Track the field while the chip is up so it does not float away on scroll.
  detach?.();
  const reposition = () => position(el);
  window.addEventListener('scroll', reposition, { passive: true, capture: true });
  window.addEventListener('resize', reposition, { passive: true });
  detach = () => {
    window.removeEventListener('scroll', reposition, { capture: true } as EventListenerOptions);
    window.removeEventListener('resize', reposition);
    detach = null;
  };
}

export function hide(): void {
  window.clearTimeout(hideTimer);
  detach?.();
  if (chip) chip.dataset.visible = 'false';
}

/** Remove the host entirely, e.g. when the extension is switched off. */
export function destroyIndicator(): void {
  hide();
  host?.remove();
  host = null;
  root = null;
  chip = null;
}
