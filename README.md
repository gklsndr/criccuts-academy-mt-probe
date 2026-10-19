# Can a phone translate a cricket lesson? An on-device MT probe, with the data

We asked whether Google ML Kit's on-device translator could put a cricket and physics course into any language a
phone supports, so no hand-made language packs would be needed. We ran it over all 1,102 strings of the
[CricCuts](https://criccuts.com) Science Lab (lessons, explanations, figure words and simulator controls), into Hindi
and Tamil, on a phone, and scored every line. This repo has the harness, the inputs, the phone's raw output and our
scored reports.

**The short answer: it's fast and small enough, but it isn't accurate enough.** The write-up is on the CricCuts blog:
[The batter became thunder](https://criccuts.com/the-batter-became-thunder.html). It also covers what the app does
instead (English first, the student's language one tap away, the English word kept beside the Indian-language one),
and what we've learned since.

## Results

Google ML Kit Translate 17.0.3, Xiaomi Pad 7 (Snapdragon SM7675, Android 16), English to Hindi and Tamil, 1,102
strings each, run on 29 September 2026.

| | Hindi | Tamil |
|---|---|---|
| model download | 45 MB | 43 MB |
| the whole course | 23 s | 23 s |
| median per string | 14 ms | 14 ms |
| lines with any flag (`score.js`) | 208 (18.9%) | 372 (33.8%) |
| a cricket word in its everyday sense | 133 lines | 253 lines |
| "not" lost (read and confirmed) | 8 | 12 |
| a number changed | 6 | 7 |
| a sentence cut short | 10 | 24 |
| 35 lines read in full: wrong / garbled | 11 / 4 | 16 / 2 |

The app would also carry 16.4 MB of native library (arm64) for every user.

A few lines, with what the translation says back in English:

| English | Machine translation | It says |
|---|---|---|
| away from the batter | இடி இருந்து (ta) | from the thunder |
| turn off the pitch | சுருதி அணைக்க (ta) · पिच को बंद करें (hi) | switch off the (musical) pitch |
| Top-spin (axis across the pitch) makes it dip. | … அது முக்குவதில்லை (ta) | … it does not dip |
| Choose the bat you can swing fastest and most accurately, not the heaviest you can lift. | … सबसे भारी आप उठा सकते हैं (hi) | … the heaviest you can lift |
| No single change adds more than half a metre | कोई भी परिवर्तन आधे मीटर से अधिक जोड़ता है (hi) | Any change adds more than half a metre |
| sweet spot | இனிப்பு ஸ்பாட் (ta) · मीठा स्थान (hi) | a spot that tastes sweet |
| off stump | बंद स्टंप (hi) | the switched-off stump |
| seam | மடிப்பு (ta) | a fold (70 Tamil lines) |

## What's here

```
prepare.js        makes the translation jobs from a language pack's English
score.js          scores a model's output against the pack and flags each line
calibrate.js      checks a language's "not" pattern against the pack before you trust it
langs.js          per language: the cricket words, the everyday senses that mislead, how it writes "not"
src/, *.gradle.kts the probe app (com.criccuts.mtprobe): translates every job on the phone, timing each string
packs/hi, ta      the answer key: our Hindi and Tamil Science Lab packs as they were when the probe ran
                  ({"English": "translation"} per area)
work/             the prepared jobs and entries (prepare.js output), and the 35 line ids read by hand
results/xiaomi-pad-7/  ML Kit's raw output (<code>-1-raw.json, <code>-2-slots.json) and our reports (report-<code>.json)
tanglish/         the next step we're testing: one lesson in a teacher's voice in English, Tanglish and Hinglish,
                  and the lines we play through the phone's Tamil and Hindi voices
```

Each row of `report-<code>.json` has the English, our pack's line, the machine's line, the time it took, its chrF
score and its flags.

## Score another model

`score.js` reads any output in the probe's format, so a model run on a PC can be scored without the phone:

```
node score.js ta results/my-model
```

`results/my-model/ta-1-raw.json` needs only `{"items": [{"id": 0, "out": "…"}, …]}`, one item per entry in
`work/ta-entries.json`. The timing and device fields are optional. Add `ta-2-slots.json` in the same shape to score
the slot test (`work/assets/jobs/ta-2-slots.json`, where `{0}`-style slots are swapped for numbers).

## Rerun it on a phone

1. `node prepare.js hi` (and `ta`) writes the jobs into `work/`.
2. Build the probe with Gradle 8.13 or later and the Android SDK (API 36): `gradle assembleDebug`, or open the folder in
   Android Studio. The APK bundles the jobs.
3. `adb install -r build/outputs/apk/debug/academy-mt-probe-debug.apk`, then
   `adb shell am start -n com.criccuts.mtprobe/.MainActivity`. It downloads the model once, translates everything, and
   logs under `MtProbe` until `ALL_DONE`.
4. Pull the output: `adb exec-out run-as com.criccuts.mtprobe cat files/out/hi-1-raw.json > results/<device>/hi-1-raw.json`,
   and the same for `hi-2-slots.json`.
5. `node score.js hi results/<device>`.

**Another language, without a rebuild:** push its two job files into the app's `files/in/` (`adb push` to
`/data/local/tmp/`, then `run-as com.criccuts.mtprobe cp …`) and restart the app with `am start -S`. It skips jobs it
has already done. A language needs a pack in `packs/<code>/` (the answer key) and an entry in `langs.js`; run
`node calibrate.js <code>` first.

## Read this before you quote a number

- **The answer key is our own draft, not a gold standard.** The Hindi and Tamil packs were drafted by Claude (an AI
  model) from the same English, and they still await review by a teacher who teaches in each language. chrF against
  them is a trend, not a grade (it sits near 37 to 38 for both). The flags are the findings.
- **The flags are pattern checks.** A cricket word is matched against lists of its cricket and everyday renderings
  (`langs.js`). The "not" check only sees a negation that disappeared; a line that keeps a negative word but reverses
  the sense ("never" for "not always") passes it. So read a sample of the lines it passes too.
- **The 35 lines read in full were read by an AI assistant** against the English, not by a native-speaker panel. They
  were picked at random, a few from each area, from the lines that passed every Hindi check (9 of them were flagged in
  Tamil), so they show what the checks miss. The ids are in `work/sample-ids.json`, so you can read the same lines and
  disagree with us.
- **One phone, one model version, two languages.** The speed figures are for a recent mid-range Snapdragon chip.
- **This is a cricket and physics course.** Its words (batter, pitch, seam, swing, off, leg) are exactly the ones a
  general-purpose translator reads in their everyday sense. Don't read these numbers as ML Kit's quality on everyday
  text.

Corrections, and runs of other models or languages, are welcome as issues or pull requests.

## Help us check the translations

Our packs are drafts, and the only way to fix that is people who teach in these languages reading them. If you teach in
Hindi, Marathi, Tamil or Kannada, the language check on our website shows the key words and lines we're least sure of,
and takes about 15 minutes. You don't need the app:
[Hindi](https://criccuts.com/check?from=github#hindi) · [Marathi](https://criccuts.com/check?from=github#marathi) ·
[Tamil](https://criccuts.com/check?from=github#tamil) · [Kannada](https://criccuts.com/check?from=github#kannada).
Teachers, doctors and umpires can check the rest of the Academy there too: [criccuts.com/check](https://criccuts.com/check?from=github).

## Licence

The code (`*.js`, `src/`, the Gradle files) is under the [MIT licence](LICENSE). The data (`packs/`, `work/`,
`results/`, `tanglish/`) is under [CC BY 4.0](LICENSE-DATA.md): credit "CricCuts". The machine translations in
`results/` were produced by Google ML Kit's on-device translator. They're included unchanged so the scoring can be
checked, and we don't claim them (see [LICENSE-DATA.md](LICENSE-DATA.md)).
