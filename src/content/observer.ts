/**
 * Finds form fields, now and as the page changes.
 *
 * Single-page apps mount forms long after load and often re-render them, so a
 * one-shot scan misses most real fields. Mutation batches are coalesced into
 * one debounced pass to keep this cheap on busy pages.
 */
import { isEditableField, type EditableField } from './describe.js';

const SELECTOR = 'input, textarea';
const DEBOUNCE_MS = 150;

/** Collect fields under a root, descending into open shadow roots. */
export function collectFields(root: ParentNode): EditableField[] {
  const out: EditableField[] = [];

  const visit = (node: ParentNode) => {
    let matches: Element[];
    try {
      matches = Array.from(node.querySelectorAll(SELECTOR));
    } catch {
      return;
    }
    for (const el of matches) {
      if (isEditableField(el)) out.push(el);
    }
    // Web components keep their fields inside a shadow root, invisible to the
    // querySelectorAll above. Only open roots are reachable.
    let hosts: Element[];
    try {
      hosts = Array.from(node.querySelectorAll('*'));
    } catch {
      return;
    }
    for (const host of hosts) {
      const shadow = (host as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
      if (shadow) visit(shadow);
    }
  };

  visit(root);
  if (isEditableField(root)) out.push(root);
  return out;
}

export interface Observer {
  disconnect(): void;
  rescan(): void;
}

export function observeFields(onField: (el: EditableField) => void): Observer {
  const scan = (root: ParentNode) => {
    for (const el of collectFields(root)) onField(el);
  };

  scan(document);

  let timer: number | undefined;
  const pending = new Set<ParentNode>();

  const flush = () => {
    timer = undefined;
    const roots = Array.from(pending);
    pending.clear();
    for (const root of roots) scan(root);
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of Array.from(record.addedNodes)) {
          if (node.nodeType === Node.ELEMENT_NODE) pending.add(node as Element);
        }
      } else if (record.type === 'attributes' && record.target.nodeType === Node.ELEMENT_NODE) {
        // An attribute change can turn a field convertible (a pattern or a
        // label appearing after validation), so re-examine the target.
        pending.add(record.target as Element);
      }
    }
    if (pending.size && timer === undefined) {
      timer = window.setTimeout(flush, DEBOUNCE_MS);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['pattern', 'placeholder', 'aria-label', 'aria-describedby', 'type', 'name', 'autocomplete'],
  });

  return {
    disconnect() {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
    },
    rescan() {
      scan(document);
    },
  };
}
