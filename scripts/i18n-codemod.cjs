// Wraps Russian UI strings in _t() / _tj() so the app can speak English.
// node scripts/i18n-codemod.cjs extract  -> writes scripts/i18n-keys.json (all keys + auto pairs)
// node scripts/i18n-codemod.cjs apply    -> rewrites files in src/
// Re-runnable: strings already inside _t()/_tj() are left alone.
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const SKIP = new Set(['i18n.ts', 'en.ts', 'course/a1.ts', 'course/tr.ts', 'components/Admin.tsx', 'components/AdminCourses.tsx']);
const CYR = /[А-Яа-яЁё]/;
// Callees whose arguments are already bilingual or must stay as is.
const SKIP_CALLEES = new Set(['_t', '_tj', 't', 'nw', 'tr', 'RegExp', 'require']);

function files(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** JSX text as React sees it. */
function jsxValue(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  let last = -1;
  lines.forEach((l, i) => { if (/[^ \t]/.test(l)) last = i; });
  let s = '';
  lines.forEach((l, i) => {
    let x = l.replace(/\t/g, ' ');
    if (i !== 0) x = x.replace(/^ +/, '');
    if (i !== lines.length - 1) x = x.replace(/ +$/, '');
    if (x) { s += x; if (i !== last) s += ' '; }
  });
  return decode(s);
}
const ENT = { nbsp: ' ', mdash: '—', ndash: '–', laquo: '«', raquo: '»', hellip: '…', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", middot: '·', times: '×', rarr: '→', larr: '←' };
const decode = (s) => s.replace(/&([a-z]+);/g, (m, e) => ENT[e] ?? m).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));

const keys = new Map(); // key -> Set(files)
const pairs = {}; // ru -> en, from code that already has both
const addKey = (k, file) => {
  const core = k.trim();
  if (!CYR.test(core)) return;
  if (!keys.has(core)) keys.set(core, new Set());
  keys.get(core).add(file);
};

function calleeName(call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return '';
}

function excluded(node) {
  const p = node.parent;
  if (!p) return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || ts.isExternalModuleReference(p)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isEnumMember(p)) && p.name === node) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && SKIP_CALLEES.has(calleeName(p))) return true;
  // inside an array passed to nw(...)
  if (ts.isArrayLiteralExpression(p) && p.parent && ts.isCallExpression(p.parent) && SKIP_CALLEES.has(calleeName(p.parent))) return true;
  return false;
}

const hasJsx = (n) => {
  let f = false;
  const v = (x) => { if (f) return; if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) f = true; else ts.forEachChild(x, v); };
  v(n);
  return f;
};

function processFile(file, mode) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let changed = false;

  // Auto pairs: {ru:'..', en:'..'} and t('ru','en') and words.ts P/A/H/D.
  const collectPairs = (n) => {
    if (ts.isObjectLiteralExpression(n)) {
      const get = (k) => { const p = n.properties.find((x) => ts.isPropertyAssignment(x) && x.name && (x.name.text === k)); return p && (ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer)) ? p.initializer.text : null; };
      const ru = get('ru'), en = get('en');
      if (ru && en && CYR.test(ru)) pairs[ru.trim()] = en.trim();
    }
    if (ts.isCallExpression(n) && n.arguments.length >= 2) {
      const a = n.arguments.map((x) => (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) ? x.text : null));
      const name = calleeName(n);
      if (name === 't' && a[0] && a[1] && CYR.test(a[0]) && !CYR.test(a[1])) pairs[a[0].trim()] = a[1].trim();
      if (rel === 'words.ts') {
        const idx = { P: [4, 5], D: [4, 5], A: [2, 3], H: [2, 3] }[name];
        if (idx && a[idx[0]] && a[idx[1]]) pairs[a[idx[0]].trim()] = a[idx[1]].trim();
      }
    }
    ts.forEachChild(n, collectPairs);
  };
  collectPairs(sf);

  const q = (s) => JSON.stringify(s);

  /** Returns node text with all rewrites applied inside. */
  function emit(node) {
    // String literal
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && CYR.test(node.text) && !excluded(node)) {
      addKey(node.text, rel);
      changed = true;
      const call = `_t(${q(node.text)})`;
      if (ts.isJsxAttribute(node.parent)) return `{${call}}`;
      return call;
    }
    if (ts.isTemplateExpression(node) && !excluded(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      if (parts.some((p) => CYR.test(p))) {
        let key = node.head.text;
        const args = [];
        node.templateSpans.forEach((s, i) => { key += `{${i}}` + s.literal.text; args.push(emit(s.expression)); });
        addKey(key, rel);
        changed = true;
        return `_t(${q(key)}, ${args.join(', ')})`;
      }
    }
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const kids = [...node.children];
      // find runs
      const repl = []; // [start, end, text]
      let i = 0;
      const isSimpleExpr = (c) => ts.isJsxExpression(c) && c.expression && !hasJsx(c.expression);
      while (i < kids.length) {
        if (!(ts.isJsxText(kids[i]) || isSimpleExpr(kids[i]))) { i++; continue; }
        let j = i;
        while (j < kids.length && (ts.isJsxText(kids[j]) || isSimpleExpr(kids[j]))) j++;
        const run = kids.slice(i, j);
        const hasRu = run.some((c) => ts.isJsxText(c) && CYR.test(c.text));
        if (hasRu) {
          let key = '';
          const args = [];
          for (const c of run) {
            if (ts.isJsxText(c)) key += jsxValue(c.text);
            else if (ts.isStringLiteral(c.expression) || ts.isNoSubstitutionTemplateLiteral(c.expression)) key += c.expression.text;
            else { key += `{${args.length}}`; args.push(emit(c.expression)); }
          }
          // keep surrounding blank text outside the call for clean source
          const first = run[0], last = run[run.length - 1];
          const start = ts.isJsxText(first) ? first.pos : first.getStart(sf), end = last.getEnd();
          const lead = ts.isJsxText(first) ? (first.text.match(/^\s*/)[0].includes('\n') ? first.text.match(/^\s*/)[0] : '') : '';
          const trail = ts.isJsxText(last) ? (last.text.match(/\s*$/)[0].includes('\n') ? last.text.match(/\s*$/)[0] : '') : '';
          addKey(key, rel);
          changed = true;
          const fn = args.length ? '_tj' : '_t';
          repl.push([start, end, `${lead}{${fn}(${q(key)}${args.length ? ', ' + args.join(', ') : ''})}${trail}`, run]);
        }
        i = j;
      }
      if (repl.length) {
        // emit with runs replaced and other children emitted recursively
        const covered = new Set(repl.flatMap((r) => r[3]));
        const nstart = node.getStart(sf);
        let out = '';
        let pos = nstart;
        const edits = [];
        for (const c of kids) if (!covered.has(c)) { const t = emit(c); const s = c.getStart(sf); edits.push([s, c.getEnd(), t]); }
        for (const r of repl) edits.push([r[0], r[1], r[2]]);
        // opening/closing tags: emit attributes too
        const open = ts.isJsxElement(node) ? node.openingElement : null;
        if (open) edits.push([open.getStart(sf), open.getEnd(), emit(open)]);
        edits.sort((a, b) => a[0] - b[0]);
        for (const [s, e, t] of edits) { out += src.slice(pos, s) + t; pos = e; }
        out += src.slice(pos, node.getEnd());
        return out;
      }
    }
    // default: copy text, recursing into children
    const start = node.getStart(sf);
    let out = '';
    let pos = start;
    const kids = [];
    ts.forEachChild(node, (c) => { kids.push(c); });
    for (const c of kids) {
      const s = c.getStart(sf);
      if (s < pos) continue;
      const t = emit(c);
      out += src.slice(pos, s) + t;
      pos = c.getEnd();
    }
    out += src.slice(pos, node.getEnd());
    return out;
  }

  // JsxText inside a JsxElement whose run is handled is covered above; a JsxText node alone in default path is copied as is.
  const body = src.slice(0, sf.getStart(sf)) + emit(sf);
  if (mode === 'apply' && changed) {
    let res = body;
    const need = ['_t', '_tj'].filter((x) => new RegExp('\\b' + x + '\\(').test(res));
    let relp = path.relative(path.dirname(file), path.join(ROOT, 'i18n')).replace(/\\/g, '/');
    if (!relp.startsWith('.')) relp = './' + relp;
    const m = res.match(/^import \{([^}]*)\} from ['"]([./]*i18n)['"];/m);
    if (m) {
      const names = new Set(m[1].split(',').map((x) => x.trim()).filter(Boolean));
      need.forEach((x) => names.add(x));
      res = res.replace(m[0], `import { ${[...names].join(', ')} } from '${m[2]}';`);
    } else {
      const lines = res.split('\n');
      let at = 0;
      lines.forEach((l, k) => { if (/^import /.test(l) && k < 80) at = k + 1; });
      while (at > 0 && at < lines.length && !/;\s*$/.test(lines[at - 1])) at++;
      lines.splice(at, 0, `import { ${need.join(', ')} } from '${relp}';`);
      res = lines.join('\n');
    }
    fs.writeFileSync(file, res);
  }
  return changed;
}

const mode = process.argv[2] || 'extract';
let n = 0;
for (const f of files(ROOT)) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (SKIP.has(rel)) continue;
  if (processFile(f, mode)) n++;
}
const out = { keys: [...keys.entries()].map(([k, s]) => [k, [...s]]), pairs };
if (mode === 'extract') fs.writeFileSync(path.join(__dirname, 'i18n-keys.json'), JSON.stringify(out, null, 1));
console.log(mode, 'files', n, 'keys', keys.size, 'pairs', Object.keys(pairs).length);
