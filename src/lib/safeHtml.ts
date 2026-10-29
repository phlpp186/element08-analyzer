/**
 * safeHtml — ECharts writes tooltip strings with innerHTML, and our tooltip
 * formatters build that HTML from labels that come out of the loaded file (a
 * tag, a location, a pivot key) or from the assistant's answer. A crafted
 * .e08backup could otherwise run script on this origin, where the Supabase
 * session lives in localStorage.
 *
 * Two layers: escapeHtml() around every data-derived label where a formatter
 * builds its string, and sanitizeTooltipHtml() on every formatter's output
 * (wired in chartStyle, so a formatter written later is covered too).
 */

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/** The markup our formatters actually use. Anything else is unwrapped to its text. */
const TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'SMALL', 'SPAN', 'DIV', 'BR', 'HR', 'SUB', 'SUP', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);
/** Elements whose content is never shown, so it goes with them. */
const DROP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'NOSCRIPT', 'TITLE', 'TEXTAREA']);
/** A style that could fetch or execute something: url(), image-set(), legacy expression(), @import. */
const RISKY_CSS = /url\s*\(|image-set|expression|@import|\\/i;

function clean(node: Node): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.remove();
      continue;
    }
    const el = child as Element;
    // SVG/MathML children keep lowercase names, so compare upper-cased.
    const tag = el.tagName.toUpperCase();
    if (DROP.has(tag)) {
      el.remove();
      continue;
    }
    clean(el);
    if (!TAGS.has(tag)) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const keep = attr.name === 'style' && !RISKY_CSS.test(attr.value);
      if (!keep) el.removeAttribute(attr.name);
    }
  }
}

export function sanitizeTooltipHtml(html: string): string {
  // Plain text (most axis tooltips) needs no parse.
  if (!/[<&]/.test(html)) return html;
  // A <template>'s content is inert: nothing in it loads or runs while we walk it.
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  clean(tpl.content);
  return tpl.innerHTML;
}
