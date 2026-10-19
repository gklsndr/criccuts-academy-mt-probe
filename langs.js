// The tables score.js judges a machine translation with, per language: the script's letters and digits, the English
// words that have an everyday sense, how "not" is written, and each language's renderings. A new language is an entry
// in LANGS (and in SCRIPTS if its script is new); check its negation pattern with calibrate.js before trusting it.

// Each script's letters, and the code point of its digit zero.
const SCRIPTS = {
  DEVANAGARI: { letters: /[ऀ-ॿ]/, zero: 0x0966 },
  TAMIL: { letters: /[஀-௿]/, zero: 0x0be6 },
};

// ── cricket and physics words that have an everyday sense ───────────────────────────────────────────────────────────
// The English triggers are shared; each language gives its renderings. A term is judged only where the reviewed line
// uses its cricket rendering (`when`), so "swing" of a bat or "off the pitch" isn't counted as a miss. `ok` is the
// reviewed pack's word; `wrong` lists only senses that would MISLEAD a student (a playground swing, switching off, a
// sweet taste). A plain synonym — a stitch word for "seam", "the ball turns" for "turn" — is neither: it counts as
// "cricket word missing", which is a style difference, not an error.
const TERM_EN = {
  'off (side)': /\b(off[- ]?(side|stump|break|spin|spinner|cutter)s?|to off|outside off|towards? off|from off)\b/i,
  'leg (side)': /\b(leg[- ]?(side|stump|break|spin|spinner|cutter)s?|to leg|towards? leg|down leg|from leg)\b/i,
  seam: /\bseams?\b/i,
  swing: /\bswing/i,
  bat: /\bbats?\b/i,
  batter: /\bbatters?\b/i,
  bowler: /\bbowlers?\b/i,
  pitch: /\bpitch(es|ed|ing)?\b/i,
  stumps: /\bstumps?\b/i,
  length: /\blength\b/i,
  turn: /\bturn(s|ed|ing)?\b/i,
  drift: /\bdrift/i,
  dip: /\bdip/i,
  'sweet spot': /\bsweet spot/i,
  'boundary (rope)': /\bboundar(y|ies)\b/i,
  wake: /\bwake\b/i,
  lift: /\blift\b/i,
  delivery: /\bdeliver(y|ies)\b/i,
};

// A `wrong` entry is a word, or {word, unless}: the word is only wrong when the English line doesn't match `unless` —
// Tamil "இழுவை" is drag, so it's wrong for "drift" unless the English also talks about drag. The entries marked "seen" were
// added on 2026-09-29 after reading the ML Kit output's short labels; each is a sense a reader would take literally.
const BODY_LEG = /\b(front|back|bent|straight|braced|stiff) legs?\b|\bfoot\b|\bfeet\b|\bknees?\b|\bquarter/i;
const CHANGE = /\bchang|\bswitch|\bswap/i;

// A lost "not" is judged where the English and the reviewed line both negate, and the machine line doesn't.
const enNegation = /\b(not|no|never|cannot|without|nothing|neither|nor|none)\b|n't\b/i;

const LANGS = {
  hi: {
    // Hindi spellings vary on nukta and on chandrabindu vs anusvara.
    norm: (s) => s.replace(/़/g, '').replace(/ँ/g, 'ं'),
    negation: /नहीं|नही|(^|\s)न(\s|$)|(^|\s)ना(\s|$)|(^|\s)मत(\s|$)|बिना|कोई नहीं|न तो|कभी नहीं/,
    terms: {
      'off (side)': { when: ['ऑफ'], ok: ['ऑफ'], wrong: ['बंद'] },
      'leg (side)': { when: ['लेग'], ok: ['लेग'], wrong: [{ word: 'पैर', unless: BODY_LEG }, { word: 'टांग', unless: BODY_LEG }] },
      seam: { when: ['सीम'], ok: ['सीम'], wrong: [] },
      swing: { when: ['स्विंग'], ok: ['स्विंग'], wrong: ['झूल'] },
      bat: { when: ['बल्ल', 'बैट'], ok: ['बल्ल', 'बैट'], wrong: ['चमगादड'] },
      batter: { when: ['बल्लेबाज', 'बैटर'], ok: ['बल्लेबाज', 'बैटर'], wrong: ['घोल'] },
      bowler: { when: ['गेंदबाज'], ok: ['गेंदबाज', 'बॉलर'], wrong: [] },
      pitch: { when: ['पिच'], ok: ['पिच'], wrong: ['स्वर', 'आवाज'] },
      stumps: { when: ['स्टंप'], ok: ['स्टंप', 'विकेट'], wrong: ['ठूंठ', 'ठूठ'] },
      length: { when: ['लेंथ'], ok: ['लेंथ'], wrong: ['लंबाई'] },
      turn: { when: ['टर्न'], ok: ['टर्न'], wrong: ['बारी', { word: 'बदल', unless: CHANGE }] }, // seen: "turns" → "changes"
      drift: { when: ['ड्रिफ्ट'], ok: ['ड्रिफ्ट'], wrong: ['बहाव', 'बह '] },
      // seen: "dips" → गिरावट, a decline as in prices
      dip: { when: ['डिप'], ok: ['डिप'], wrong: ['डुबकी', 'डुब', { word: 'गिरावट', unless: /\b(drop|fall|decline)/i }] },
      'sweet spot': { when: ['स्वीट'], ok: ['स्वीट'], wrong: ['मीठ'] },
      'boundary (rope)': { when: ['बाउंड्री'], ok: ['बाउंड्री'], wrong: [] },
      wake: { when: ['वेक'], ok: ['वेक'], wrong: ['जाग', 'मद्देनजर'] }, // seen: मद्देनज़र, "in view of"
      lift: { when: ['उत्थापन'], ok: ['उत्थापन'], wrong: [] },
      delivery: { when: [], ok: [], wrong: ['प्रसव', 'वितरण', 'सुपुर्द'] },
    },
  },
  ta: {
    norm: (s) => s,
    // Tamil negates mostly in the verb, so this is a list of endings as much as words. It must not match அல்லது
    // ("or"), the locative -இல் ("in"), எல்லை ("boundary"), எல்லா ("all") or நல்ல ("good").
    //   இல்லை/இல்லா… not, without · -ில்லை: -வில்லை "did not" · அல்ல: is not · இன்றி: without · வேண்டாம்: don't
    //   மாட்டா…: won't · முடியா/இயலா: can't · கூடாது: must not · -ாது: negative future ("won't turn")
    //   -ாமல்/-ாமலே(யே): without doing ·-ாத: non- ("non-spinning") · -ாவிட்டால்: if not · -ாதே/-ாதீர்கள்: don't
    //   அற்ற/-யற்ற/-றற்ற: -less · ஒருபோதும்: never
    negation: new RegExp(
      [
        'இல்லை', 'ில்லை', 'இல்லா', 'ில்லா', 'அல்ல(?!து)', 'இன்றி', 'வேண்டாம்', 'மாட்டா', 'மாட்டே', 'மாட்டோ',
        'முடியா', 'இயலா', 'கூடாது', 'கூடாத', 'ாது(?=$|[\\s.,;:!?)"\'’])', 'ாமல','ாத(?=$|[\\s.,;:!?)])', 'ாதது',
        'ாதவ', 'ாதபோ', 'ாவிட்டா', 'ாதீ', 'ாதே(?=$|[\\s.,;:!?])', 'அற்ற', 'யற்ற', 'றற்ற', 'ஒருபோதும்',
      ].join('|'),
    ),
    terms: {
      'off (side)': { when: ['ஆஃப்'], ok: ['ஆஃப்'], wrong: ['அணை'] },
      'leg (side)': { when: ['லெக்'], ok: ['லெக்'], wrong: [{ word: 'கால்', unless: BODY_LEG }] },
      // seen: மடிப்பு, a fold or crease, for every seam; மடங்கு, "-fold / times"
      seam: { when: ['சீம்'], ok: ['சீம்'], wrong: ['மடிப்பு', { word: 'மடங்கு', unless: /\b(twice|double|times|fold)\b/i }] },
      swing: { when: ['ஸ்விங்'], ok: ['ஸ்விங்'], wrong: ['ஊஞ்சல்', 'ஊசல'] },
      bat: { when: ['மட்டை'], ok: ['மட்டை', 'பேட்'], wrong: ['வௌவால்', 'வவ்வால்'] },
      // seen: இடி, "thunder" (from "to batter"); பாட்டி, "grandmother"; பட்டைகள், "strips"
      batter: {
        when: ['பேட்டர'],
        ok: ['பேட்டர', 'பேட்ஸ்ம', 'மட்டையாள', 'துடுப்பாட்ட'],
        wrong: ['மாவு', 'இடி', 'பாட்டி', { word: 'பட்டை', unless: /\b(band|strip|stripe|belt)/i }],
      },
      bowler: { when: ['பந்துவீச்சாளர'], ok: ['பந்துவீச்சாளர', 'பந்து வீச்சாளர', 'பவுலர', 'பௌலர'], wrong: ['கிண்ண'] },
      // seen: சத்தங்கள், "noises", for "the ball pitches"
      pitch: { when: ['ஆடுகள', 'பிட்ச்'], ok: ['ஆடுகள', 'பிட்ச்', 'பிச்'], wrong: ['சுருதி', 'தொனி', 'கூடார', 'சத்த'] },
      stumps: { when: ['ஸ்டம்ப'], ok: ['ஸ்டம்ப', 'விக்கெட்'], wrong: ['அடிமர', 'அடிக்கட்டை'] },
      length: { when: ['லென்த்'], ok: ['லென்த்', 'லெந்த்', 'லெங்த்'], wrong: ['நீள'] },
      // seen: முறை, "a turn (your turn) / times"; மாறும், "changes"
      turn: {
        when: ['டர்ன்'],
        ok: ['டர்ன்'],
        wrong: [
          { word: 'முறை', unless: /\b(twice|once|times|method|way)\b/i },
          { word: 'மாறும்', unless: CHANGE },
          { word: 'மாறிவிடும்', unless: CHANGE },
        ],
      },
      // seen: இழுவை, which is DRAG (a different force in the same lessons)
      drift: {
        when: ['டிரிஃப்ட்'],
        ok: ['டிரிஃப்ட்', 'ட்ரிஃப்ட்', 'டிரிப்ட்'],
        wrong: ['சறுக்க', 'மிதவை', 'அலைச்ச', { word: 'இழுவை', unless: /\bdrag/i }],
      },
      // seen: தாழ்நிலை, "lowland"; சாய்வு, "slope / tilt" (the lessons' word for axis tilt)
      dip: {
        when: ['டிப்'],
        ok: ['டிப்'],
        wrong: ['முக்கு', 'நனை', 'தோய்', 'மூழ்', 'தாழ்நிலை', { word: 'சாய்வு', unless: /\b(tilt|slope|lean)/i }],
      },
      'sweet spot': { when: ['ஸ்வீட்'], ok: ['ஸ்வீட்'], wrong: ['இனிப்', 'இனிமை', 'இனிய', 'இனிக்'] },
      'boundary (rope)': { when: ['எல்லைக்கோ'], ok: ['எல்லைக்கோ', 'பவுண்டரி', 'பௌண்டரி'], wrong: [] },
      // seen: அடுத்து, "next" (from "in the wake of")
      wake: { when: ['வேக்'], ok: ['வேக்'], wrong: ['விழி', 'எழுந்', 'எழுப்', { word: 'அடுத்து', unless: /\b(next|then|after)\b/i }] },
      lift: { when: ['தூக்கு விசை'], ok: ['தூக்கு'], wrong: ['மின்தூக்கி'] },
      delivery: { when: [], ok: [], wrong: ['பிரசவ', 'விநியோக', 'பட்டுவாடா'] },
    },
  },
};

module.exports = { SCRIPTS, TERM_EN, enNegation, LANGS };
