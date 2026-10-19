// Checks a language's "not" pattern (langs.js) against its REVIEWED pack, before score.js trusts it on machine output.
//
//   node docs/tools/academy-mt-probe/calibrate.js <code>        (after prepare.js <code>)
//
// Coverage: of the English lines that negate, how many reviewed lines does the pattern see a negation in? A miss means
// score.js can't judge that line. Then, per alternative in the pattern, how often it fires on reviewed lines whose
// English does NOT negate, with the words it fired on. Some are real (a language may say "can't miss" for "always"), but
// a word fired on in the wrong sense is a pattern bug.
const fs = require('fs');
const path = require('path');
const { enNegation, LANGS } = require('./langs');

const code = process.argv[2];
const lang = LANGS[code];
if (!lang) {
  console.error('usage: node calibrate.js <code>   (a code with a LANGS entry)');
  process.exit(2);
}
const entries = JSON.parse(fs.readFileSync(path.join(__dirname, 'work', `${code}-entries.json`), 'utf8'));
const negating = entries.filter((e) => enNegation.test(e.en));
const plain = entries.filter((e) => !enNegation.test(e.en));
const seen = negating.filter((e) => lang.negation.test(e.reviewed));
console.log(`${code}: ${seen.length} of ${negating.length} negating lines have a negation the pattern sees`);
negating
  .filter((e) => !lang.negation.test(e.reviewed))
  .forEach((e) => console.log(`  missed  EN: ${e.en.slice(0, 100)}\n          ${code}: ${e.reviewed.slice(0, 110)}`));

// Split the pattern back into its alternatives: top-level "|" only, not inside a group or a [...] class.
const alternatives = [];
const source = lang.negation.source;
let depth = 0;
let inClass = false;
let current = '';
for (let i = 0; i < source.length; i++) {
  const ch = source[i];
  if (ch === '\\') {
    current += ch + source[++i];
    continue;
  }
  if (inClass) {
    if (ch === ']') inClass = false;
  } else if (ch === '[') inClass = true;
  else if (ch === '(') depth++;
  else if (ch === ')') depth--;
  else if (ch === '|' && depth === 0) {
    alternatives.push(current);
    current = '';
    continue;
  }
  current += ch;
}
alternatives.push(current);

console.log(`\nfires on lines whose English doesn't negate (of ${plain.length}):`);
for (const alt of alternatives) {
  const word = new RegExp(`\\S*(?:${alt})\\S*`);
  const hits = plain.filter((e) => new RegExp(alt).test(e.reviewed));
  if (!hits.length) continue;
  const words = [...new Set(hits.map((e) => e.reviewed.match(word)[0]))].slice(0, 6);
  console.log(`  ${alt.padEnd(24)} ${String(hits.length).padStart(3)}  ${words.join(' · ')}`);
}
