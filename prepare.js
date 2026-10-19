// Writes the probe's translation jobs from a reviewed language pack's English keys.
//
//   node docs/tools/academy-mt-probe/prepare.js <code>        e.g. hi
//
// work/<code>-entries.json      every phrasebook entry, in order: {id, area, en, reviewed}; score.js reads it
// work/assets/jobs/<code>-1-raw.json    every English string, as the lab has it
// work/assets/jobs/<code>-2-slots.json  only the strings with {0}-style slots, each slot swapped for a number
//                                       (SLOT_NUMBERS) — does the translator keep a number better than a brace?
// The APK bundles work/assets/, so run this before building the probe.
const fs = require('fs');
const path = require('path');

const code = process.argv[2];
if (!code) {
  console.error('usage: node prepare.js <code>');
  process.exit(2);
}
const here = __dirname;
// The public copy (export-public.js) carries the packs in packs/ beside this file; here they are the app's assets.
const packsRoot = fs.existsSync(path.join(here, 'packs'))
  ? path.join(here, 'packs')
  : path.join(here, '..', '..', '..', 'app', 'src', 'main', 'assets', 'academy', 'i18n');
const packDir = path.join(packsRoot, code);
if (!fs.existsSync(packDir)) {
  console.error(`no pack at ${packDir}`);
  process.exit(2);
}

// Numbers no English string uses, one per slot index; score.js maps them back.
const SLOT_NUMBERS = [731, 842, 953, 164];

const entries = [];
for (const file of fs.readdirSync(packDir).filter((f) => f.endsWith('.json') && f !== 'language.json').sort()) {
  const area = file.replace(/\.json$/, '');
  const book = JSON.parse(fs.readFileSync(path.join(packDir, file), 'utf8'));
  for (const [en, reviewed] of Object.entries(book)) entries.push({ id: entries.length, area, en, reviewed });
}

const allText = entries.map((e) => e.en).join('\n');
SLOT_NUMBERS.forEach((n) => {
  if (allText.includes(String(n))) throw new Error(`slot number ${n} appears in the English; pick another`);
});

const withSlots = entries.filter((e) => /\{\d\}/.test(e.en));
const masked = withSlots.map((e) => ({
  id: e.id,
  text: e.en.replace(/\{(\d)\}/g, (_, d) => String(SLOT_NUMBERS[Number(d)])),
}));

const work = path.join(here, 'work');
const jobs = path.join(work, 'assets', 'jobs');
fs.mkdirSync(jobs, { recursive: true });
fs.writeFileSync(path.join(work, `${code}-entries.json`), JSON.stringify(entries, null, 1), 'utf8');
fs.writeFileSync(
  path.join(jobs, `${code}-1-raw.json`),
  JSON.stringify({ target: code, variant: 'raw', items: entries.map((e) => ({ id: e.id, text: e.en })) }),
  'utf8',
);
fs.writeFileSync(
  path.join(jobs, `${code}-2-slots.json`),
  JSON.stringify({ target: code, variant: 'slots', slotNumbers: SLOT_NUMBERS, items: masked }),
  'utf8',
);
const chars = entries.reduce((a, e) => a + e.en.length, 0);
console.log(`${code}: ${entries.length} entries (${chars} English chars), ${withSlots.length} with slots → ${jobs}`);
