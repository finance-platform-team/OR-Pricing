/**
 * CSP-safe replacement for inline event handlers.
 *
 * Code apps run with `script-src 'self'`, so inline attributes such as
 * onclick="goTab(2)" are blocked. The markup keeps the same handler code in
 * data-onclick / data-onchange / data-oninput / data-onfocus attributes and this
 * bridge runs it without eval: each handler is a `;`-separated list of calls
 * like fn('a', 2, this.value, event) or event.stopPropagation().
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fn = (...args: any[]) => unknown;
type Arg = (el: HTMLElement, ev: Event) => unknown;
type Call = { fn: string; args: Arg[] };

const cache = new Map<string, Call[]>();

function splitTopLevel(src: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') {
        cur += ch + src[++i];
        continue;
      }
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === sep && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseArg(src: string, scope: Record<string, unknown>): Arg {
  if (/^-?\d+(\.\d+)?$/.test(src)) {
    const n = Number(src);
    return () => n;
  }
  const str = src.match(/^(['"])(.*)\1$/s);
  if (str) {
    const s = str[2].replace(/\\(.)/g, '$1');
    return () => s;
  }
  if (src === 'true' || src === 'false') return () => src === 'true';
  if (src === 'null') return () => null;
  if (src === 'this') return (el) => el;
  if (src === 'event') return (_el, ev) => ev;
  const thisProp = src.match(/^this\.(\w+)$/);
  if (thisProp) return (el) => (el as any)[thisProp[1]];
  if (/^[A-Za-z_$][\w$]*$/.test(src)) return () => scope[src];
  throw new Error(`Unsupported handler argument: ${src}`);
}

function parse(code: string, scope: Record<string, unknown>): Call[] {
  let calls = cache.get(code);
  if (calls) return calls;
  calls = splitTopLevel(code, ';').map((stmt) => {
    const m = stmt.match(/^([\w$.]+)\s*\((.*)\)$/s);
    if (!m) throw new Error(`Unsupported handler: ${stmt}`);
    return { fn: m[1], args: splitTopLevel(m[2], ',').map((a) => parseArg(a, scope)) };
  });
  cache.set(code, calls);
  return calls;
}

export function installHandlerBridge(handlers: Record<string, Fn>, scope: Record<string, unknown> = {}): void {
  const run = (el: HTMLElement, code: string, ev: Event): boolean => {
    let stopped = false;
    try {
      for (const call of parse(code, scope)) {
        if (call.fn === 'event.stopPropagation') {
          stopped = true;
          continue;
        }
        const fn = handlers[call.fn];
        if (!fn) throw new Error(`Unknown handler function: ${call.fn}`);
        const ret = fn.apply(el, call.args.map((a) => a(el, ev)));
        if (ret instanceof Promise) ret.catch((e) => console.error(`[HANDLER] ${call.fn}`, e));
      }
    } catch (e) {
      console.error('[HANDLER]', code, e);
    }
    return stopped;
  };

  // click / change / input bubble: run every matching handler from target up,
  // honouring event.stopPropagation() like inline handlers would.
  for (const type of ['click', 'change', 'input']) {
    document.addEventListener(type, (ev) => {
      for (let el = ev.target as HTMLElement | null; el && el.nodeType === 1; el = el.parentElement) {
        const code = el.getAttribute(`data-on${type}`);
        if (code && run(el, code, ev)) {
          ev.stopImmediatePropagation();
          return;
        }
      }
    });
  }

  // focus doesn't bubble — only the focused element's own handler runs.
  document.addEventListener('focusin', (ev) => {
    const el = ev.target as HTMLElement;
    const code = el?.getAttribute?.('data-onfocus');
    if (code) run(el, code, ev);
  });
}
