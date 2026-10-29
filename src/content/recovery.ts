/**
 * Refilling a form the site wiped when it rejected it.
 *
 * Off by default, because it keeps a copy of what the user typed. When it is
 * on, the copy goes in the page's own sessionStorage: one tab, one site, gone
 * when the tab closes, and deleted sooner -- after 30 minutes, once restored or
 * dismissed, or on a page that says the application is complete. It never
 * reaches extension storage and never leaves the browser.
 *
 * The site's own scripts can read sessionStorage, as they can read the form
 * itself. Fields no one should have copied anywhere are never saved:
 * passwords, payment details, one-time codes, CAPTCHAs, マイナンバー.
 */
import { isPaymentField, termMatches } from '../core/keywords.js';
import { setFieldValue } from './applier.js';
import { controlsIn } from './errors.js';
import { displayNameFor, isEditableField, rowHeaderFor, type FormControl } from './describe.js';

const KEY = 'dejapanify:draft';
export const DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_VALUE = 2000;

const SENSITIVE_TERMS: readonly string[] = [
  '暗証', 'ワンタイム', '認証コード', '確認コード', 'セキュリティコード', '画像認証',
  'マイナンバー', '個人番号', '秘密の質問', 'パスワード',
  'pin', 'otp', 'onetime', 'one-time', 'one_time', 'captcha', 'mynumber', 'my_number',
  'token', 'csrf', 'secret', 'password', 'passcode',
];

const COMPLETE = /完了|ありがとうございま|受け付けました|受付けました|受付いたしました/;

interface Draft {
  savedAt: number;
  /** name -> text value, or for choices name + '\u0000' + value -> true. */
  fields: Record<string, string | boolean>;
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isSensitive(el: FormControl): boolean {
  const autocomplete = el.getAttribute('autocomplete') ?? '';
  if (/one-time-code/i.test(autocomplete)) return true;
  // Every name the field goes by, not just the one shown: a sensitive field
  // may say so only in its aria-label or placeholder.
  const haystack = [
    el.name,
    el.id,
    displayNameFor(el),
    rowHeaderFor(el),
    el.getAttribute('aria-label') ?? '',
    el.getAttribute('placeholder') ?? '',
  ].join(' ');
  if (isPaymentField(haystack, autocomplete)) return true;
  const lower = haystack.toLowerCase();
  return SENSITIVE_TERMS.some((t) => termMatches(t, lower));
}

function isChoice(el: FormControl): el is HTMLInputElement {
  return el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox');
}

const keyOf = (el: FormControl): string => el.name || el.id;
const choiceKey = (el: HTMLInputElement): string => `${keyOf(el)}\u0000${el.value}`;

/** The fields a draft may hold, in `scope`. */
function savable(scope: ParentNode): FormControl[] {
  return controlsIn(scope).filter((el) => keyOf(el) !== '' && !isSensitive(el));
}

/** Copy the filled-in fields of `scope` into the tab's session. */
export function saveDraft(scope: ParentNode): void {
  const fields: Draft['fields'] = {};
  let count = 0;
  for (const el of savable(scope)) {
    if (isChoice(el)) {
      if (el.checked) {
        fields[choiceKey(el)] = true;
        count++;
      }
    } else if (el.value !== '' && el.value.length <= MAX_VALUE) {
      fields[keyOf(el)] = el.value;
      count++;
    }
  }
  if (count < 2) return;
  try {
    storage()?.setItem(KEY, JSON.stringify({ savedAt: Date.now(), fields } satisfies Draft));
  } catch {
    /* storage full or blocked: nothing to recover from, which is the old behaviour */
  }
}

export function clearDraft(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* blocked storage holds nothing of ours */
  }
}

function loadDraft(): Draft | null {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as Draft;
    if (typeof draft?.savedAt !== 'number' || typeof draft.fields !== 'object' || draft.fields === null) {
      clearDraft();
      return null;
    }
    if (Date.now() - draft.savedAt > DRAFT_TTL_MS) {
      clearDraft();
      return null;
    }
    return draft;
  } catch {
    clearDraft();
    return null;
  }
}

export interface RestoreOffer {
  /** How many fields would be refilled. */
  count: number;
  restore(): void;
  dismiss(): void;
}

/**
 * If this page holds the form a recent draft came from, and the site has
 * emptied it, offer the draft back. Restoring fills only fields that are
 * empty now, so nothing the user has typed since is overwritten.
 */
export function restoreOffer(scope: ParentNode = document): RestoreOffer | null {
  const draft = loadDraft();
  if (!draft) return null;

  const fields = savable(scope);
  const present = fields.filter((el) =>
    isChoice(el) ? choiceKey(el) in draft.fields : keyOf(el) in draft.fields,
  );
  if (present.length === 0) {
    // A page without the form: if it says the application went through, the
    // draft has served its purpose. A confirmation page keeps it, since
    // 「戻る」 from there often comes back to an empty form.
    const text = document.body?.textContent?.slice(0, 5000) ?? '';
    if (COMPLETE.test(text)) clearDraft();
    return null;
  }

  const wiped = present.filter((el) => {
    if (!isChoice(el)) return el.value === '';
    // A choice is wiped if nothing in its group is checked now.
    const group = fields.filter((f) => isChoice(f) && keyOf(f) === keyOf(el));
    return !group.some((f) => (f as HTMLInputElement).checked);
  });
  if (present.length < 3 || wiped.length < 2) return null;

  return {
    count: wiped.length,
    restore: () => {
      for (const el of wiped) {
        if (isChoice(el)) {
          el.checked = true;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (isEditableField(el)) {
          setFieldValue(el, draft.fields[keyOf(el)] as string);
        } else {
          el.value = draft.fields[keyOf(el)] as string;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      clearDraft();
    },
    dismiss: clearDraft,
  };
}
