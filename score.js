// Scores the probe's machine translations against the reviewed language pack.
//
//   node docs/tools/academy-mt-probe/score.js <code> <outDir>     e.g. hi work/out/<device>
//
// <outDir> holds the probe's output files as pulled from the phone (<code>-1-raw.json, <code>-2-slots.json).
// Prints a summary and writes <outDir>/report-<code>.json (the summary plus every row with its flags).
//
// The reviewed pack is the answer key, but only a loose one: two good translations can word a sentence differently,
// so chrF (character n-gram overlap) is a trend, not a grade. The flags are what matter — each is a concrete way a
// machine translation would mislead a student: a broken {0} slot, a changed number, a cricket word in its everyday
// sense (swing → a playground swing), a lost "not", or half a sentence gone.
const fs = require('fs');
const path = require('path');
const { SCRIPTS, TERM_EN, enNegation, LANGS } = require('./langs');

const [code, outDirArg] = process.argv.slice(2);
if (!code || !outDirArg) {
  console.error('usage: node score.js <code> <outDir>');
  process.exit(2);
}
const here = __dirname;
const outDir = path.resolve(outDirArg);
const entries = JSON.parse(fs.readFileSync(path.join(here, 'work', `${code}-entries.json`), 'utf8'));
const readOut = (name) => {
  const f = path.join(outDir, `${code}-${name}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};
const raw = readOut('1-raw');
const slotted = readOut('2-slots');
if (!raw) {
  console.error(`no ${code}-1-raw.json in ${outDir}`);
  process.exit(2);
}
// The probe's output doesn't carry the job's slot numbers; the job file does.
const slotJob = path.join(here, 'work', 'assets', 'jobs', `${code}-2-slots.json`);
if (slotted) slotted.slotNumbers = JSON.parse(fs.readFileSync(slotJob, 'utf8')).slotNumbers;
const rawById = new Map(raw.items.map((r) => [r.id, r]));
const slotById = new Map((slotted ? slotted.items : []).map((r) => [r.id, r]));

// ── the zip.js checks ───────────────────────────────────────────────────────────────────────────────────────────────
const slots = (s) => (s.match(/\{\d\}/g) || []).slice().sort().join(' ');
const numbers = (s) => (s.replace(/\{\d\}/g, '').match(/\d+(?:[.,]\d+)*/g) || []).slice().sort().join(' ');

// ── the language's script, named by its pack's language.json ────────────────────────────────────────────────────────
// The public copy (export-public.js) carries the packs in packs/ beside this file; here they are the app's assets.
const packsRoot = fs.existsSync(path.join(here, 'packs'))
  ? path.join(here, 'packs')
  : path.join(here, '..', '..', '..', 'app', 'src', 'main', 'assets', 'academy', 'i18n');
const packFile = path.join(packsRoot, code, 'language.json');
const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
const script = SCRIPTS[pack.script];
if (!script) {
  console.error(`no SCRIPTS entry for ${pack.script}`);
  process.exit(2);
}
const digitRange = `${String.fromCharCode(script.zero)}-${String.fromCharCode(script.zero + 9)}`;
const nativeDigits = new RegExp(`[${digitRange}]`);
const toWestern = (s) => s.replace(new RegExp(`[${digitRange}]`, 'g'), (d) => String(d.charCodeAt(0) - script.zero));

// Undo prepare.js's slot numbers (in either digit set) back into {0}, {1}, …
const unmask = (s, slotNumbers) => {
  let out = toWestern(s);
  slotNumbers.forEach((n, i) => {
    out = out.replace(new RegExp(`(?<![\\d.,])${n}(?![\\d])`, 'g'), `{${i}}`);
  });
  return out;
};

const lang = LANGS[code];
if (!lang) {
  console.error(`no LANGS entry for ${code}`);
  process.exit(2);
}
const norm = (s) => lang.norm(s.normalize('NFC')).replace(/[‌‍]/g, '');
const TERMS = Object.entries(TERM_EN).map(([term, en]) => {
  const t = lang.terms[term] || { when: [], ok: [], wrong: [] };
  const wrong = t.wrong.map((w) => (typeof w === 'string' ? { word: norm(w), unless: null } : { word: norm(w.word), unless: w.unless }));
  return { term, en, when: t.when.map(norm), ok: t.ok.map(norm), wrong };
});
const has = (text, list) => list.some((w) => text.includes(w));
// A wrong word counts unless the English line explains it (see langs.js).
const hasWrong = (text, english, list) => list.some((w) => text.includes(w.word) && !(w.unless && w.unless.test(english)));

// ── chrF (Popović 2015): character n-grams 1..6, whitespace removed, β = 2 ─────────────────────────────────────────
const ngrams = (s, n) => {
  const m = new Map();
  for (let i = 0; i + n <= s.length; i++) {
    const g = s.slice(i, i + n);
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
};
const chrfStats = (hyp, ref) => {
  const h = norm(hyp).replace(/\s+/g, '');
  const r = norm(ref).replace(/\s+/g, '');
  const stats = [];
  for (let n = 1; n <= 6; n++) {
    const hg = ngrams(h, n);
    const rg = ngrams(r, n);
    let match = 0;
    let hTot = 0;
    let rTot = 0;
    hg.forEach((c) => (hTot += c));
    rg.forEach((c) => (rTot += c));
    hg.forEach((c, g) => (match += Math.min(c, rg.get(g) || 0)));
    stats.push({ match, hTot, rTot });
  }
  return stats;
};
const chrfFrom = (stats) => {
  const beta2 = 4;
  let p = 0;
  let r = 0;
  let k = 0;
  stats.forEach(({ match, hTot, rTot }) => {
    if (hTot === 0 || rTot === 0) return;
    p += match / hTot;
    r += match / rTot;
    k++;
  });
  if (k === 0) return 0;
  p /= k;
  r /= k;
  return p + r === 0 ? 0 : (100 * (1 + beta2) * p * r) / (beta2 * p + r);
};

// ── score every row ─────────────────────────────────────────────────────────────────────────────────────────────────
const rows = [];
const corpus = Array.from({ length: 6 }, () => ({ match: 0, hTot: 0, rTot: 0 }));
const termStats = new Map(TERMS.map((t) => [t.term, { judged: 0, ok: 0, wrong: 0, examples: [] }]));
const negation = { english: 0, judged: 0 };
for (const e of entries) {
  const r = rawById.get(e.id);
  const mt = r && typeof r.out === 'string' ? r.out : null;
  const flags = [];
  const row = { id: e.id, area: e.area, en: e.en, reviewed: e.reviewed, mt, ms: r ? r.ms : null, flags };
  rows.push(row);
  if (mt === null) {
    flags.push(`error: ${r ? r.error : 'missing'}`);
    continue;
  }
  if (slots(e.en) !== slots(mt)) flags.push(`slots [${slots(e.en)}] → [${slots(mt)}]`);
  if (numbers(e.en) !== numbers(toWestern(mt))) flags.push(`numbers [${numbers(e.en)}] → [${numbers(toWestern(mt))}]`);
  if (nativeDigits.test(mt)) flags.push('native digits');
  const words = e.en.split(/\s+/).length;
  if (words > 1 && /[a-z]{3,}/i.test(e.en) && !script.letters.test(mt)) flags.push('untranslated');
  if (/(\S+)(\s+\1){3,}/.test(mt)) flags.push('repeats');
  const ratio = mt.length / Math.max(1, e.reviewed.length);
  row.lengthRatio = Number(ratio.toFixed(2));
  if (words >= 6 && ratio < 0.6) flags.push(`short (${row.lengthRatio}× the reviewed)`);
  if (words >= 6 && ratio > 1.7) flags.push(`long (${row.lengthRatio}× the reviewed)`);
  if (enNegation.test(e.en)) {
    negation.english++;
    if (lang.negation.test(e.reviewed)) {
      negation.judged++;
      if (!lang.negation.test(mt)) flags.push('lost "not"');
    }
  }
  const nmt = norm(mt);
  const nrev = norm(e.reviewed);
  for (const t of TERMS) {
    if (!t.en.test(e.en)) continue;
    const s = termStats.get(t.term);
    // An everyday word next to the cricket one is another sense in the same sentence ("जोड़" = sum beside "सीम").
    const wrong = hasWrong(nmt, e.en, t.wrong) && !has(nmt, t.ok);
    if (wrong) {
      s.wrong++;
      flags.push(`${t.term}: everyday sense`);
      if (s.examples.length < 4) s.examples.push({ en: e.en, mt });
    }
    if (t.when.length && has(nrev, t.when)) {
      s.judged++;
      if (has(nmt, t.ok)) s.ok++;
      else if (!wrong) flags.push(`${t.term}: cricket word missing`);
    }
  }
  if (slotById.has(e.id)) {
    const sr = slotById.get(e.id);
    row.mtSlots = typeof sr.out === 'string' ? unmask(sr.out, slotted.slotNumbers) : null;
    row.slotsOkMasked = row.mtSlots !== null && slots(row.mtSlots) === slots(e.en);
  }
  const st = chrfStats(mt, e.reviewed);
  row.chrf = Number(chrfFrom(st).toFixed(1));
  st.forEach((s, i) => {
    corpus[i].match += s.match;
    corpus[i].hTot += s.hTot;
    corpus[i].rTot += s.rTot;
  });
}

// ── summary ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');
const quantile = (xs, q) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};
const ms = rows.map((r) => r.ms).filter((x) => typeof x === 'number');
const chars = entries.reduce((a, e) => a + e.en.length, 0);
const slotRows = rows.filter((r) => /\{\d\}/.test(r.en));
const flagged = rows.filter((r) => r.flags.length);
const flagCounts = {};
rows.forEach((r) =>
  r.flags.forEach((f) => {
    const k = f.replace(/ \[.*$/, '').replace(/ \(\d.*$/, '').replace(/^error: .*/, 'error');
    flagCounts[k] = (flagCounts[k] || 0) + 1;
  }),
);
const byArea = {};
rows.forEach((r) => {
  const a = (byArea[r.area] = byArea[r.area] || { n: 0, flagged: 0, chrf: 0 });
  a.n++;
  if (r.flags.length) a.flagged++;
  a.chrf += r.chrf || 0;
});
Object.values(byArea).forEach((a) => (a.chrf = Number((a.chrf / a.n).toFixed(1))));

const summary = {
  code,
  device: raw.device,
  soc: raw.soc,
  android: raw.android,
  model: {
    alreadyOnPhone: raw.hadModel,
    downloadMs: raw.downloadMs,
    downloadMB: Number((raw.downloadBytes / 1048576).toFixed(1)),
    warmupMs: raw.warmupMs,
  },
  speed: {
    strings: ms.length,
    totalSeconds: Number((raw.totalMs / 1000).toFixed(1)),
    charsPerSecond: Math.round(chars / (raw.totalMs / 1000)),
    msPerString: { mean: Number((ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1)), p50: quantile(ms, 0.5), p90: quantile(ms, 0.9), max: Math.max(...ms) },
  },
  quality: {
    chrfCorpus: Number(chrfFrom(corpus).toFixed(1)),
    chrfMeanSentence: Number((rows.reduce((a, r) => a + (r.chrf || 0), 0) / rows.length).toFixed(1)),
    flaggedRows: `${flagged.length}/${rows.length} (${pct(flagged.length, rows.length)})`,
    flagCounts,
    byArea,
  },
  negation: {
    englishLines: negation.english,
    judged: negation.judged,
    lost: rows.filter((r) => r.flags.includes('lost "not"')).length,
  },
  slots: {
    strings: slotRows.length,
    keptAsBraces: pct(slotRows.filter((r) => r.mt && slots(r.mt) === slots(r.en)).length, slotRows.length),
    keptAsNumbers: slotted ? pct(slotRows.filter((r) => r.slotsOkMasked).length, slotRows.length) : 'not run',
  },
  terms: Object.fromEntries(
    [...termStats].map(([term, s]) => [term, { judged: s.judged, cricketWord: pct(s.ok, s.judged), everydaySense: s.wrong, examples: s.examples }]),
  ),
};

fs.writeFileSync(path.join(outDir, `report-${code}.json`), JSON.stringify({ summary, rows }, null, 1), 'utf8');
const brief = JSON.parse(JSON.stringify(summary));
Object.values(brief.terms).forEach((t) => delete t.examples);
console.log(JSON.stringify(brief, null, 2));
console.log(`\nwrote ${path.join(outDir, `report-${code}.json`)}`);
