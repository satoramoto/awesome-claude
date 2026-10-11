// Code and Markdown, drawn close to how the engine's own highlighter and
// markdown renderer draw them: tokens coloured simply, a numbered gutter, diff
// hunks with markers and tints; headings, lists, quotes, fences and links.

type Surface = 'desktop' | 'terminal'

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// ---- Code ----

const KEYWORDS = new Set(
  (
    'abstract as async await break case catch class const continue def default del do elif else enum export extends false final finally fn for from func function ' +
    'go if impl import in instanceof interface is lambda let loop match mod module mut new nil none null of or and not package pass private protected pub public raise ' +
    'readonly return self static struct super switch this throw true try type typeof undefined use var void while with yield True False None'
  ).split(' '),
)

const HASH_COMMENTS = /^(py|python|sh|bash|zsh|shell|rb|ruby|yaml|yml|toml|r|perl|pl|make|makefile|dockerfile)$/i

const languageOf = (p: Record<string, any>) => {
  if (p.language) return String(p.language)
  const path = String(p.path ?? '')
  const ext = path.match(/\.([a-z0-9]+)$/i)?.[1]
  if (ext) return ext
  return /^#!.*\b(python|bash|sh|ruby|node)/.exec(String(p.source ?? ''))?.[1] ?? ''
}

/** One line of code as HTML, its tokens wrapped by kind. */
const highlight = (line: string, language: string) => {
  if (!language) return esc(line)
  const comment = HASH_COMMENTS.test(language) ? '#.*$' : '\\/\\/.*$|--\\s.*$'
  const re = new RegExp(`(${comment})|("(?:[^"\\\\]|\\\\.)*"?|'(?:[^'\\\\]|\\\\.)*'?|\`(?:[^\`\\\\]|\\\\.)*\`?)|\\b(\\d[\\d_.]*(?:e[+-]?\\d+)?|0x[\\da-f]+)\\b|([A-Za-z_$][\\w$]*)`, 'gi')
  let out = ''
  let last = 0
  for (const m of line.matchAll(re)) {
    out += esc(line.slice(last, m.index))
    const [all, com, str, num, word] = m
    if (com) out += `<span class="com">${esc(com)}</span>`
    else if (str) out += `<span class="str">${esc(str)}</span>`
    else if (num) out += `<span class="num">${esc(num)}</span>`
    else if (word && KEYWORDS.has(word)) out += `<span class="kw">${esc(word)}</span>`
    else out += esc(all)
    last = m.index! + all.length
  }
  return out + esc(line.slice(last))
}

type DiffLine = { kind: 'add' | 'del' | 'ctx' | 'hunk'; text: string; n?: number }

/** Unified-diff hunks as lines, numbered from their headers; none when the source holds no hunk. */
const parseDiff = (source: string): DiffLine[] => {
  const out: DiffLine[] = []
  let oldN = 0
  let newN = 0
  let inHunk = false
  for (const line of source.split('\n')) {
    const head = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/)
    if (head) {
      oldN = Number(head[1])
      newN = Number(head[2])
      inHunk = true
      out.push({ kind: 'hunk', text: line })
      continue
    }
    if (!inHunk || line.startsWith('\\') || line.startsWith('--- ') || line.startsWith('+++ ')) continue
    if (line.startsWith('+')) out.push({ kind: 'add', text: line.slice(1), n: newN++ })
    else if (line.startsWith('-')) out.push({ kind: 'del', text: line.slice(1), n: oldN++ })
    else if (line.startsWith(' ') || line === '') {
      out.push({ kind: 'ctx', text: line.slice(1), n: newN++ })
      oldN++
    }
  }
  return out.some(l => l.kind !== 'hunk') ? out : []
}

/** A `Code`: source with an optional numbered gutter, or unified-diff hunks. */
export const codeBlock = (p: Record<string, any>, _surface: Surface) => {
  const source = String(p.source ?? p.text ?? '')
  const language = languageOf(p)
  const box = document.createElement('div')
  box.className = `r-code${p.wrap === 'truncate-end' ? ' trunc' : ''}`
  const row = (cls: string, gutter: string | null, gutterWidth: number, mark: string | null, html: string) => {
    const ln = document.createElement('div')
    ln.className = `ln ${cls}`
    if (gutter !== null) ln.innerHTML += `<span class="g" style="width:${gutterWidth + 1}ch">${esc(gutter)}</span>`
    if (mark !== null) ln.innerHTML += `<span class="m">${esc(mark)}</span>`
    ln.innerHTML += `<span class="src">${html || ' '}</span>`
    box.append(ln)
  }
  const diff = p.format === 'diff' ? parseDiff(source) : []
  if (diff.length) {
    const width = String(Math.max(...diff.map(l => l.n ?? 0))).length
    for (const l of diff) {
      if (l.kind === 'hunk') row('hunk', '', width, '', esc(l.text))
      else row(l.kind, String(l.n), width, l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' ', highlight(l.text, language))
    }
    return box
  }
  const lines = source.replace(/\n$/, '').split('\n')
  // A diff that parses as no hunks is drawn as plain code, unnumbered.
  const start = p.format === 'diff' ? undefined : typeof p.startLine === 'number' ? p.startLine : undefined
  const width = start === undefined ? 0 : String(start + lines.length - 1).length
  lines.forEach((l, i) => row('', start === undefined ? null : String(start + i), width, null, highlight(l, p.format === 'diff' ? '' : language)))
  return box
}

// ---- Markdown ----

/** Inline markdown on one escaped run: code, links, bold, italic, strikethrough. */
const inline = (raw: string) => {
  const codes: string[] = []
  let s = raw.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`)
  s = esc(s)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (all, text, href) => {
    // A link not https:, http: or file: draws as text.
    const url = href.replace(/&amp;/g, '&')
    return /^(https?|file):/i.test(url) ? `<a href="${esc(url)}" data-href="${esc(url)}" target="_blank" rel="noreferrer">${text}</a>` : text
  })
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (_, pre, url) => `${pre}<a href="${url}" data-href="${url}" target="_blank" rel="noreferrer">${url}</a>`)
  s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`)
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*|(^|[^_\w])_([^_\s][^_]*)_/g, (_, p1, a, p2, b) => `${p1 ?? p2}<em>${a ?? b}</em>`)
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)]!)}</code>`)
}

/** Markdown to HTML: blocks by line, inline runs escaped first. */
export const markdownHtml = (text: string) => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`)
    para = []
  }
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`)
    list = null
  }
  const flush = () => {
    flushPara()
    flushList()
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)/)
    if (fence) {
      flush()
      const body: string[] = []
      while (++i < lines.length && !lines[i]!.trim().startsWith(fence[1]!)) body.push(lines[i]!)
      out.push(`<pre><code>${body.map(l => highlight(l, fence[2] ?? '')).join('\n')}</code></pre>`)
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (heading) {
      flush()
      out.push(`<h${heading[1]!.length}>${inline(heading[2]!)}</h${heading[1]!.length}>`)
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      out.push('<hr>')
      continue
    }
    const quote = line.match(/^\s*>\s?(.*)$/)
    if (quote) {
      flush()
      const body = [quote[1]!]
      while (i + 1 < lines.length && /^\s*>/.test(lines[i + 1]!)) body.push(lines[++i]!.replace(/^\s*>\s?/, ''))
      out.push(`<blockquote>${body.map(inline).join('<br>')}</blockquote>`)
      continue
    }
    const item = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/)
    if (item) {
      flushPara()
      const tag = /\d/.test(item[1]!) ? 'ol' : 'ul'
      if (list && list.tag !== tag) flushList()
      list ??= { tag, items: [] }
      list.items.push(item[2]!.replace(/^\[( |x)\]\s+/i, (_, x) => (x === ' ' ? '☐ ' : '☑ ')))
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`
      continue
    }
    flushList()
    para.push(line.trim())
  }
  flush()
  return out.join('')
}

/** A `Markdown`: the block, dim on request; with `onLinkPress`, its links (or those listed) are the plugin's to answer. */
export const markdownBlock = (p: Record<string, any>, surface: Surface, press: (fn: () => void) => void) => {
  const box = document.createElement('div')
  box.className = 'r-md'
  box.innerHTML = markdownHtml(String(p.text ?? p.source ?? ''))
  if (p.dimColor) box.style.opacity = '0.6'
  if (typeof p.onLinkPress === 'function') {
    const only: string[] | undefined = Array.isArray(p.pressableLinks) ? p.pressableLinks : undefined
    for (const a of box.querySelectorAll<HTMLAnchorElement>('a[data-href]')) {
      const href = a.dataset.href!
      if (only && !only.includes(href)) continue
      a.onclick = ev => {
        ev.preventDefault()
        press(() => p.onLinkPress({ href, text: a.textContent ?? '' }, { surface, element: p.key }))
      }
    }
  }
  return box
}
