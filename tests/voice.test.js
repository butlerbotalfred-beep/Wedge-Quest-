const assert = require('assert');
require('../src/voice.js');
const V = globalThis.WQVoice;

let checks = 0;
const eq = (a, b, m) => { checks++; assert.strictEqual(a, b, m); };
const ok = (c, m) => { checks++; assert.ok(c, m); };

// text clean-up
eq(V.speakable('What is 7 × 8?'), 'What is 7 times 8?');
eq(V.speakable('What is 10 − 4?'), 'What is 10 minus 4?');
eq(V.speakable('About 30 km away and 12 kg heavy'), 'About 30 kilometers away and 12 kilograms heavy');
eq(V.speakable('Water boils at 100 °C'), 'Water boils at 100 degrees Celsius');
eq(V.speakable('25% of 80 is 20'), '25 percent of 80 is 20');
eq(V.speakable('x² + 3 = 7'), 'x squared + 3 equals 7');
eq(V.speakable('Fish & chips 🍟 are great'), 'Fish and chips are great');
eq(V.speakable('Cats, e.g. lions'), 'Cats, for example lions');
eq(V.speakable('2 + 3'), '2 plus 3');

// chunking: sentences, and long runs split near commas
let c = V._chunk('One. Two! Three?');
eq(c.length, 3, 'three sentences');
const long = ('word '.repeat(30) + 'end, ').repeat(3).trim();
c = V._chunk(long);
ok(c.length >= 3 && c.every((x) => x.length <= 190), 'long text is split into short chunks: ' + c.map((x) => x.length));

// voice ranking
const v = (name, lang, local = true, uri) => ({ name, lang, localService: local, voiceURI: uri || name });
V._setVoices([
  v('Zarvox', 'en-US'), v('Fred', 'en-US'), v('Alex', 'en-US'), v('Samantha', 'en-US'),
  v('Daniel', 'en-GB'), v('Ava (Premium)', 'en-US'), v('Eddy (English (US))', 'en-US'), v('Amelie', 'fr-CA'),
]);
let top = V.list();
eq(top[0].name, 'Ava (Premium)', 'premium wins on a Mac');
ok(!top.some((x) => /Zarvox|Fred|Eddy|Amelie/.test(x.name)), 'novelty and non-English voices are hidden');
eq(top[0].label, 'Premium');

V._setVoices([
  v('Microsoft David Desktop - English (United States)', 'en-US'),
  v('Microsoft Zira Desktop - English (United States)', 'en-US'),
  v('Microsoft Aria Online (Natural) - English (United States)', 'en-US', false),
  v('Google UK English Female', 'en-GB', false),
]);
top = V.list();
eq(top[0].tier, 'natural', 'natural neural voice wins on Edge');
eq(top[top.length - 1].tier, 'standard');

V._setVoices([v('Google US English', 'en-US', false), v('Samantha', 'en-US')]);
eq(V.list()[0].name, 'Google US English', 'online voice beats standard');

// a saved pick is honoured while installed, then falls back to the best
V.setPref({ uri: 'Samantha' });
eq(V.current().name, 'Samantha');
V.setPref({ uri: 'Gone' });
eq(V.current().name, 'Google US English');

// tip text says something useful and never throws without a browser
ok(typeof V.tip() === 'string' && V.tip().length > 10);
console.log(`All ${checks} voice checks passed`);
