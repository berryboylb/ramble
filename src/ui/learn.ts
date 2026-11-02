import type { Learn } from '../core/types.ts';

// Part of the boot script (tier 0), so it must stay very small. The app sends learn content with
// the `ramble:learn` event instead of importing this file.

export const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderLearn(root: HTMLElement, name: string, learn: Learn): void {
  const tips = (learn.tips ?? []).map((tip) => `<li>${escapeHtml(tip)}</li>`).join('');
  root.innerHTML =
    `<h2>${escapeHtml(name)}</h2><p>${escapeHtml(learn.summary)}</p>` +
    (learn.formula ? `<code>${escapeHtml(learn.formula)}</code>` : '') +
    (tips ? `<ul>${tips}</ul>` : '');
}
