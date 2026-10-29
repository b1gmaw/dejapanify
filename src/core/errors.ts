/**
 * Form errors: reading what a page says is wrong, and deciding what is
 * certainly wrong before the page is asked.
 *
 * These functions read text and attributes only. Which text counts is the DOM
 * layer's decision: error phrases are consulted only inside containers the
 * page itself marked as errors, because the same words appear as ordinary
 * instructions on every form (「※は必須項目です」「半角数字で入力してください」).
 */
import { termMatches } from './keywords.js';

const ERROR_PHRASES: readonly string[] = [
  '入力内容に誤り', '入力エラー', 'エラーがあります', 'エラーが発生', '誤りがあります',
  '入力されていません', '選択されていません', '未入力', '未選択',
  '入力してください', '入力して下さい', '選択してください', '選択して下さい',
  '正しくありません', '正しく入力', '不正な', '無効な', '一致しません', '確認してください',
  '文字以内', '文字以上', '桁で入力', '使用できません', '必須です', '必須項目です',
  'is required', 'required field', 'invalid', 'error',
];

/** Does this text, already known to sit in an error container, describe a problem? */
export function isErrorText(text: string): boolean {
  const lower = text.toLowerCase();
  return ERROR_PHRASES.some((p) => lower.includes(p));
}

/** Does a label or row header mark its field as required? 任意 says it isn't. */
export function isRequiredMarker(text: string): boolean {
  if (/任意|optional/i.test(text)) return false;
  return /必須|\brequired\b/i.test(text) || /(^|\s)[*＊]|[*＊]\s*$/.test(text.trim());
}

const MAX_LABEL = 20;

/** 「お名前（全角）※必須」 -> 「お名前」: the name a person would call the field. */
export function cleanLabel(text: string): string {
  return text
    .replace(/[（(【［[][^）)】］\]]*[）)】］\]]/g, ' ')
    .replace(/必須|任意|※|[*＊:：]/g, ' ')
    .replace(/[\s　]+/g, ' ')
    .trim()
    .slice(0, MAX_LABEL);
}

/**
 * Indices of the labels a summary line names. 「電話番号の形式が正しくありません」
 * with labels [お名前, 電話番号] -> [1]. Longer labels claim their text first,
 * so 名 cannot match inside an お名前 another label already accounts for.
 */
export function labelsInMessage(message: string, labels: readonly string[]): number[] {
  let rest = message;
  const found: number[] = [];
  const order = labels
    .map((label, i) => ({ label, i }))
    .filter(({ label }) => label.length > 0)
    .sort((a, b) => b.label.length - a.label.length);
  for (const { label, i } of order) {
    if (rest.includes(label)) {
      found.push(i);
      rest = rest.split(label).join('\u0000');
    }
  }
  return found.sort((a, b) => a - b);
}

const PROCEED_TERMS: readonly string[] = [
  '確認', '次へ', '進む', '送信', '申し込', '申込', '登録', '購入', '注文', '予約', '確定', '同意して',
  'submit', 'next', 'continue', 'confirm', 'send', 'register', 'sign up', 'apply', 'checkout',
];
const NOT_PROCEED_TERMS: readonly string[] = [
  '戻る', '修正', '訂正', 'クリア', 'リセット', '検索', 'キャンセル', '取り消', '閉じる', '削除',
  'back', 'reset', 'clear', 'search', 'cancel', 'close', 'delete',
];

/** Is this the text of a button that moves a form on: 確認画面へ, 次へ進む, 送信? */
export function isProceedText(text: string): boolean {
  const t = text.replace(/[\s　]+/g, ' ').trim().toLowerCase();
  if (t.length === 0 || t.length > 24) return false;
  const has = (terms: readonly string[]) => terms.some((term) => termMatches(term, t));
  return has(PROCEED_TERMS) && !has(NOT_PROCEED_TERMS);
}

export interface PreflightState {
  required: boolean;
  value: string;
  pattern?: string;
  maxLength?: number;
}

export type PreflightProblem = 'empty' | 'pattern' | 'too-long';

const patternCache = new Map<string, RegExp | null>();

/** Compile a pattern attribute as the browser does; null if it doesn't compile. */
function compilePattern(pattern: string): RegExp | null {
  if (!patternCache.has(pattern)) {
    let re: RegExp | null = null;
    for (const flags of ['v', 'u']) {
      try {
        re = new RegExp(`^(?:${pattern})$`, flags);
        break;
      } catch {
        /* try the next flag set, as older browsers would */
      }
    }
    patternCache.set(pattern, re);
  }
  return patternCache.get(pattern)!;
}

/**
 * What is certainly wrong with a field, by the page's own declarations: a
 * required field left empty, a value its pattern rejects, or one longer than
 * its maxlength. Anything the page didn't declare is not this function's call.
 */
export function preflightProblem(state: PreflightState): PreflightProblem | null {
  const { value } = state;
  if (value.trim() === '') return state.required ? 'empty' : null;
  if (state.pattern) {
    const re = compilePattern(state.pattern);
    if (re && !re.test(value)) return 'pattern';
  }
  if (state.maxLength !== undefined && state.maxLength > 0 && value.length > state.maxLength) {
    return 'too-long';
  }
  return null;
}

/** The reason shown beside a field the page itself didn't explain. */
export const REASON_TEXT: Readonly<Record<PreflightProblem | 'marked', string>> = {
  empty: '未入力',
  pattern: '形式が違います',
  'too-long': '文字数が多すぎます',
  marked: '入力内容を確認',
};
