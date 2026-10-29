/**
 * What happens when the user tries to move a form on: 確認画面へ, 次へ, 送信.
 *
 * Many Japanese sites accept that press and reject the input later, after a
 * server round trip that reloads the page, or seconds later from a script,
 * often with nothing more than 「入力内容に誤りがあります」. So a proceed
 * attempt is met three ways:
 *
 * 1. Pre-flight: if a field is certainly wrong by the page's own rules (a
 *    required field left empty, a value its pattern rejects), stop this one
 *    press and show which. Pressing again goes through regardless.
 * 2. Watching: for ten seconds afterwards, an error the page puts up is
 *    caught, its fields named, and the first one jumped to.
 * 3. On load: a page that arrives already showing errors -- the server's
 *    rejection -- gets the same treatment, plus an offer to refill a form the
 *    site wiped, when that setting is on.
 *
 * Proceed buttons are found by their text, since many are plain links or
 * <button type="button"> driven by script that never fire a submit event.
 */
import { isProceedText } from '../core/errors.js';
import { currentSettings, sweepAll, sweepForm } from './manager.js';
import { certainProblems, collectProblems, controlsIn, errorSignals } from './errors.js';
import { isPanelOpen, openPanel } from './panel.js';
import { restoreOffer, saveDraft } from './recovery.js';

/** After a stopped press, the next one in the same form goes through. */
const BYPASS_MS = 30_000;
/** How long after a press a rejection still counts as its answer. */
export const WATCH_MS = 10_000;
const DEBOUNCE_MS = 300;

const PROCEED_SELECTOR =
  'button, input[type="submit"], input[type="image"], input[type="button"], a, [role="button"]';

type Scope = HTMLFormElement | Element;

const bypassUntil = new WeakMap<Scope, number>();
const passedAt = new WeakMap<Scope, number>();
let stopWatching: (() => void) | null = null;

function debug(...args: unknown[]): void {
  if (currentSettings().debug) console.debug('[dejapanify]', ...args);
}

function buttonText(el: Element): string {
  if (el instanceof HTMLInputElement) return el.value || el.alt || el.getAttribute('aria-label') || '';
  const text = (el.textContent ?? '').trim();
  return (
    text ||
    el.getAttribute('aria-label') ||
    el.querySelector('img')?.getAttribute('alt') ||
    el.getAttribute('title') ||
    ''
  );
}

/** The form a button moves on, or the nearest container holding its fields. */
function scopeFor(button: Element): Scope | null {
  const form = (button as HTMLButtonElement).form ?? button.closest('form');
  if (form) return form;
  for (let node = button.parentElement; node && node !== document.documentElement; node = node.parentElement) {
    if (controlsIn(node).length >= 2) return node;
  }
  return null;
}

/**
 * Handle one proceed attempt. Returns false when it was stopped.
 * `fromSubmit` marks the submit event that follows a click already handled.
 */
function attempt(scope: Scope, event: Event, fromSubmit: boolean): boolean {
  const settings = currentSettings();
  if (!settings?.enabled) return true;
  const now = Date.now();
  if (fromSubmit && now - (passedAt.get(scope) ?? 0) < 1000) return true;

  // Width conversion first, so a value it would fix is not flagged.
  if (scope instanceof HTMLFormElement) sweepForm(scope);
  else sweepAll(scope);

  if (settings.preflight && (bypassUntil.get(scope) ?? 0) <= now) {
    const problems = certainProblems(scope);
    if (problems.length > 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      bypassUntil.set(scope, now + BYPASS_MS);
      debug('pre-flight stopped a proceed:', problems.map((p) => `${p.name}: ${p.reason}`));
      openPanel({ problems, note: 'もう一度押すとそのまま進みます', autoJump: true });
      return false;
    }
  }

  passedAt.set(scope, now);
  if (settings.restoreInput) saveDraft(scope);
  if (settings.errorHelper) watchForRejection();
  return true;
}

/** Catch an error the page shows in the next few seconds, and name its fields. */
function watchForRejection(): void {
  stopWatching?.();
  if (!document.body) return;
  const baseline = errorSignals();
  let debounce: number | undefined;

  const check = (): void => {
    const fresh = Array.from(errorSignals()).some((el) => !baseline.has(el));
    if (!fresh) return;
    const problems = collectProblems();
    if (problems.length === 0) return;
    stop();
    debug('late rejection:', problems.map((p) => `${p.name}: ${p.reason}`));
    openPanel({ problems, autoJump: true });
  };

  const observer = new MutationObserver(() => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(check, DEBOUNCE_MS);
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'aria-invalid', 'style', 'hidden'],
  });
  const timer = window.setTimeout(() => stop(), WATCH_MS);

  function stop(): void {
    observer.disconnect();
    window.clearTimeout(timer);
    window.clearTimeout(debounce);
    if (stopWatching === stop) stopWatching = null;
  }
  stopWatching = stop;
}

function onClick(event: MouseEvent): void {
  if (event.button !== 0) return;
  const button = (event.target as Element | null)?.closest?.(PROCEED_SELECTOR);
  if (!button || !isProceedText(buttonText(button))) return;
  const scope = scopeFor(button);
  if (scope) attempt(scope, event, false);
}

/** The capture-phase submit listener's handler. Width conversion always runs. */
export function onSubmit(event: SubmitEvent): void {
  const form = event.target;
  if (form instanceof HTMLFormElement) attempt(form, event, true);
}

let pageChecked = false;

/**
 * A page that arrives showing errors is a rejection: name the fields and jump.
 * Also offers back a form the site wiped, when restoring is switched on.
 */
export function checkPage(): void {
  const settings = currentSettings();
  if (pageChecked || !settings?.enabled || isPanelOpen()) return;
  const offer = settings.restoreInput ? restoreOffer() : null;
  const problems = settings.errorHelper && errorSignals().size > 0 ? collectProblems() : [];
  if (problems.length === 0 && !offer) return;
  pageChecked = true;
  debug('page shows errors:', problems.map((p) => `${p.name}: ${p.reason}`), offer ? `restore ${offer.count}` : '');
  openPanel({
    problems,
    autoJump: problems.length > 0,
    action: offer
      ? { label: `前回の入力を復元（${offer.count}項目）`, run: offer.restore, dismiss: offer.dismiss }
      : undefined,
  });
}

/** Listen for proceed presses. Window capture runs before the page's own handlers. */
export function bindProceed(): () => void {
  window.addEventListener('click', onClick, true);
  return () => {
    window.removeEventListener('click', onClick, true);
    stopWatching?.();
    pageChecked = false;
  };
}
