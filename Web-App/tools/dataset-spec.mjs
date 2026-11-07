// Hand-written source material for the synthetic review set. Every brand, product and code is
// invented. Labels are derived from this structure, so each review's ground truth is known.

export const PRODUCTS = [
  { id: 'stride', name: 'Vantro Stride', category: 'earbuds', sku: 'VS-2210', facets: ['fit', 'noise', 'battery', 'comfort'] },
  { id: 'pulse', name: 'Kelvra Pulse', category: 'earbuds', sku: 'KP-3150', facets: ['fit', 'noise', 'battery'] },
  { id: 'trailhead', name: 'Orvane Trailhead', category: 'backpack', sku: 'OT-0428', facets: ['water', 'durable', 'comfort'] },
  { id: 'daypack', name: 'Zentiq Daypack', category: 'backpack', sku: 'ZD-1120', facets: ['durable', 'comfort', 'value'] },
  { id: 'lamp', name: 'Lumara Arc', category: 'desk lamp', sku: 'LA-7704', facets: ['eyes', 'setup', 'value'] },
  { id: 'blender', name: 'Brevio Blend', category: 'blender', sku: 'BB-5560', facets: ['clean', 'quiet', 'durable'] },
  { id: 'shell', name: 'Nimbra Shell', category: 'rain jacket', sku: 'NR-8812', facets: ['water', 'comfort', 'value'] },
  { id: 'shoe', name: 'Fenlow Glide', category: 'running shoes', sku: 'FG-6630', facets: ['fit', 'comfort', 'durable'] },
  { id: 'watch', name: 'Tessor Band', category: 'smartwatch', sku: 'TB-9041', facets: ['battery', 'water', 'setup', 'fit'] },
  { id: 'case', name: 'Quillo Guard', category: 'phone case', sku: 'QG-1178', facets: ['durable', 'water', 'value'] },
  { id: 'fryer', name: 'Hearthly Crisp', category: 'air fryer', sku: 'HC-2290', facets: ['clean', 'quiet', 'setup', 'heat'] },
  { id: 'bank', name: 'Solvia Cell', category: 'power bank', sku: 'SC-4410', facets: ['battery', 'heat', 'durable'] },
];

export const COLOURS = ['black', 'slate', 'olive', 'sand', 'navy', 'coral'];

// pos / neg sentences per facet. `sarcastic` lines praise on the surface and complain underneath.
export const FACETS = {
  fit: {
    pos: [
      '{p} never budged during my morning runs.',
      'Even on hard sprints the {p} stayed exactly where I put it.',
      'I got through a full spin class without touching the {p} once.',
      'The {p} locks in place, even when I jump rope.',
      'Hill repeats, burpees, box jumps: the {p} held on the whole time.',
    ],
    neg: [
      'The {p} slid out of position every few minutes on my run.',
      'I kept pushing the {p} back into place at the gym.',
      'The {p} worked loose twice during a light jog.',
      'The {p} does not stay put once I start to sweat.',
    ],
    sarcastic: ['Love chasing the {p} down the pavement every single time I jog.'],
  },
  noise: {
    pos: [
      'On the subway the {p} turned the rumble into silence.',
      'The {p} shuts out the whole open-plan office.',
      'Lawnmowers, barking dogs, airplane engines: the {p} erases them all.',
      'Once the {p} is on, the coffee shop simply disappears.',
    ],
    neg: [
      'The {p} lets every conversation on the bus straight through.',
      'Noise cancelling on the {p} does almost nothing against engine hum.',
      'With the {p} on I could still hear every keyboard in the office.',
    ],
    sarcastic: ['Fantastic if you want to hear your whole commute in perfect detail through the {p}.'],
  },
  battery: {
    pos: [
      'I charge the {p} maybe once a week.',
      'The {p} still had juice after a long-haul flight and a whole conference.',
      'A single top-up of the {p} carries me from Monday to Friday.',
      'After a five-day camping trip the {p} was still showing power.',
    ],
    neg: [
      'The {p} is dead by lunchtime, every single day.',
      'The battery on the {p} does not even survive one afternoon.',
      'I have to plug the {p} in twice a day now.',
    ],
    sarcastic: ['Great battery on the {p}, as long as you only need it for about an hour.'],
  },
  water: {
    pos: [
      'Walked an hour through a storm and the {p} let in not a single drop.',
      'The {p} is genuinely waterproof, everything stayed bone dry.',
      'I dropped the {p} in a lake and it came out unharmed by the water.',
      'Torrential rain just beads up and rolls off the {p}.',
    ],
    neg: [
      'The {p} is not waterproof at all, I was soaked in ten minutes.',
      'Rain went straight through the {p} and ruined what was inside.',
      'Despite the claims the {p} does not keep water out.',
    ],
    sarcastic: ['Superb waterproofing on the {p}, if your goal is to end up drenched.'],
  },
  durable: {
    pos: [
      'Three years of daily abuse and the {p} still looks new.',
      'I have dropped the {p} on concrete many times without a mark.',
      'Everything on the {p} feels overbuilt and solid.',
      'The {p} has outlived two of its cheaper predecessors.',
    ],
    neg: [
      'The {p} fell apart within a month of normal use.',
      'A seam on the {p} tore the first week I owned it.',
      'Sadly the {p} cracked after one small drop.',
    ],
    sarcastic: [
      'Wonderful build quality on the {p}, if you enjoy it falling apart in a week.',
      'Great, the {p} broke within a week. Exactly what I hoped for.',
    ],
  },
  comfort: {
    pos: [
      'I wore the {p} for a twelve-hour shift and forgot it was there.',
      'The {p} feels like nothing at all, even on all-day hikes.',
      'After a full day with the {p} I had no sore spots anywhere.',
      'The padding on the {p} is soft and it never rubs.',
    ],
    neg: [
      'After an hour the {p} left me with painful pressure points.',
      'The {p} rubbed me raw on the first long day out.',
      'I could not wear the {p} for more than twenty minutes without aching.',
    ],
    sarcastic: ['Nothing says relaxing like the blisters the {p} gave me on day one.'],
  },
  clean: {
    pos: [
      'A quick rinse under the tap and the {p} is spotless.',
      'Everything on the {p} goes straight in the dishwasher.',
      'Nothing sticks to the {p}, so washing up takes under a minute.',
      'Tidying the {p} after dinner is effortless.',
    ],
    neg: [
      'Food gets stuck in every corner of the {p} and needs an old toothbrush.',
      'Cleaning the {p} takes longer than the cooking does.',
      'Grease stays baked onto the {p} no matter how long I scrub.',
    ],
    sarcastic: ['If you love spending your evening scrubbing, the {p} is perfect.'],
  },
  quiet: {
    pos: [
      'The {p} hums so softly that nobody in the next room notices.',
      'I can run the {p} at 6am and the family stays asleep.',
      'For the power it has, the {p} barely makes a sound.',
    ],
    neg: [
      'The {p} roars like a jet engine and wakes the whole house.',
      'You cannot hold a conversation anywhere near the {p} when it runs.',
      'The racket from the {p} made my dog leave the room.',
    ],
    sarcastic: ['My neighbours now know exactly when I use the {p}. Lovely.'],
  },
  eyes: {
    pos: [
      'The {p} gives an even, soft light with no glare on my screen.',
      'Long evenings of reading under the {p} no longer strain my eyes.',
      'The warm setting on the {p} is restful after a day of spreadsheets.',
    ],
    neg: [
      'The {p} flickers and gave me a headache within the hour.',
      'The light from the {p} is harsh and throws glare across the desk.',
      'My eyes felt tired after only a short time under the {p}.',
    ],
    sarcastic: ['If you have always wanted to interrogate your homework, the {p} is ideal.'],
  },
  setup: {
    pos: [
      'The {p} was ready to go in about two minutes, no manual needed.',
      'Pairing the {p} with the app worked first time.',
      'Out of the box and working before my tea had brewed, the {p} impressed me.',
    ],
    neg: [
      'It took me a whole evening and three support articles to get the {p} going.',
      'The app for the {p} refuses to connect, and the manual is useless.',
      'Getting the {p} running was a confusing mess of steps.',
    ],
    sarcastic: ['Nothing beats a four-hour puzzle just to switch on the {p}.'],
  },
  heat: {
    pos: [
      'The {p} stays cool to the touch, even under a heavy load.',
      'I left the {p} running for hours and the outside never warmed up.',
    ],
    neg: [
      'The {p} became too hot to touch after only a few minutes.',
      'The casing of the {p} gets scorching and smells of burning plastic.',
      'I had to unplug the {p} because it was almost burning my hand.',
    ],
    sarcastic: ['The {p} doubles as a hand warmer, whether you want one or not.'],
  },
  value: {
    pos: [
      'For what I paid, the {p} feels like a steal.',
      'The {p} performs like gear costing twice as much.',
      'Hard to find a better bargain than the {p}.',
    ],
    neg: [
      'The {p} is seriously overpriced for what you get.',
      'You are paying for the logo, the {p} is not worth the money.',
      'I expected far more from the {p} at this price.',
    ],
    sarcastic: ['What a bargain, paying premium money for the {p} and getting bargain-bin quality.'],
  },
};

// Neutral sentences that add realistic noise without carrying a facet.
export const FILLER = [
  'I picked the {c} one.',
  'It arrived a day earlier than promised.',
  'Bought this as a birthday gift for myself.',
  'A friend at work recommended it.',
  'The box was smaller than I expected.',
  'I have had it for a few months now.',
  'Ordered during the spring sale.',
  'My partner uses it as well.',
];

// Unrelated storytelling for long reviews. These push the key fact past the token limit.
export const RAMBLE = [
  'Let me start with some background, because I read a great many reviews before ordering anything.',
  'I spent most of last winter comparing options in the evenings after the kids had gone to bed.',
  'My sister has been telling me for years to stop buying the cheapest thing on the shelf.',
  'The website had plenty of photographs, and the description seemed honest enough to me.',
  'When the parcel finally came I left it in the hallway for two days because work was so busy.',
  'My neighbour happened to drop by that weekend and we opened it together over a cup of coffee.',
  'First impressions matter to me, and the packaging was tidy without being wasteful or excessive.',
  'We had a family holiday coming up, so I wanted to get used to it well before we travelled.',
  'During the first few weeks I mostly used it around the house and on the short trip to the shops.',
  'I also compared notes with a colleague who bought something similar from a different company.',
  'The colour is slightly different from the photo, although that hardly bothers me in the end.',
  'I wrote down a few thoughts at the time, since I like to keep track of what I buy each year.',
  'My teenage son borrowed it for a school trip and brought it back in one piece, which was a surprise.',
  'Then the holidays came around and it spent a while sitting in a cupboard with everything else.',
  'I would describe myself as a fairly ordinary user with no special requirements or expertise at all.',
  'After reading the warranty leaflet twice, I filed it away with the receipts in the kitchen drawer.',
  'Friends often ask me what I think about this sort of thing, so I decided to write it all up properly.',
  'Everything went smoothly for a good while, and I had almost stopped thinking about it altogether.',
  'I was on the fence about whether to leave a review at all, because I rarely bother with them.',
  'There is one more thing worth mentioning, though, and it is the main reason I am writing this today.',
];

// Each fact appears only at the end of a long review. Queries use different words from the fact.
export const LONG_FACTS = [
  { id: 'zip', product: 'trailhead', fact: 'The main zipper pull snapped clean off on a mountain path.' },
  { id: 'hinge', product: 'fryer', fact: 'The hinge on the basket door cracked in two after a dozen meals.' },
  { id: 'strap', product: 'watch', fact: 'The wrist strap gave my skin an itchy red rash.' },
  { id: 'blade', product: 'blender', fact: 'The blade assembly started leaking smoothie onto the worktop.' },
  { id: 'usb', product: 'bank', fact: 'The USB port wobbled loose and stopped delivering power to my phone.' },
  { id: 'dimmer', product: 'lamp', fact: 'The dimmer knob jammed and now the brightness can never be changed.' },
  { id: 'hood', product: 'shell', fact: 'The hood drawcord vanished inside its channel and cannot be pulled out.' },
  { id: 'sole', product: 'shoe', fact: 'The outsole peeled away from the toe on a wet pavement.' },
];

// Same pair, both directions: the words are almost identical, the meaning is opposite.
export const COMPARISON_PAIRS = [
  { id: 'buds', a: 'Vantro Stride', b: 'Kelvra Pulse' },
  { id: 'packs', a: 'Orvane Trailhead', b: 'Zentiq Daypack' },
  { id: 'banks', a: 'Solvia Cell', b: 'Dynaro Volt' },
  { id: 'fryers', a: 'Hearthly Crisp', b: 'Cookwell Turbo' },
];

export const COMPARISON_TEMPLATES = [
  'I own both, and the {w} is clearly better than the {l}.',
  'I returned the {l} because the {w} beats it in every way.',
  'Switched from the {l} to the {w} and I am never going back.',
];

// Part numbers that only a few reviews mention.
export const CODES = [
  { code: 'VS-2210', product: 'stride' }, { code: 'OT-0428', product: 'trailhead' },
  { code: 'FG-6630', product: 'shoe' }, { code: 'ET-4471', product: 'pulse', label: 'replacement ear tips' },
  { code: 'KP-3150', product: 'pulse' }, { code: 'NR-8812', product: 'shell' },
  { code: 'BB-5560', product: 'blender' }, { code: 'CB-2093', product: 'fryer', label: 'spare basket' },
];

// Facet/polarity cells that get syndicated copies across colour variants.
export const DUPLICATE_CELLS = [
  { facet: 'eyes', pol: 'pos' }, { facet: 'setup', pol: 'pos' },
  { facet: 'quiet', pol: 'pos' }, { facet: 'heat', pol: 'neg' },
];

// `match` is resolved to graded labels. family = the trap this query belongs to.
export const QUERIES = {
  dev: [
    { family: 'vocabulary', text: 'stays secure during a workout', match: { facet: 'fit', pol: 'pos' } },
    { family: 'vocabulary', text: 'blocks out people talking around me', match: { facet: 'noise', pol: 'pos' } },
    { family: 'vocabulary', text: 'goes for days between recharges', match: { facet: 'battery', pol: 'pos' } },
    { family: 'vocabulary', text: 'wearable all day without any discomfort', match: { facet: 'comfort', pol: 'pos' } },
    { family: 'vocabulary', text: 'simple to wash after cooking', match: { facet: 'clean', pol: 'pos' } },
    { family: 'vocabulary', text: 'overheating problems', match: { facet: 'heat', pol: 'neg' } },
    { family: 'vocabulary', text: 'not good value for money', match: { facet: 'value', pol: 'neg' } },
    { family: 'vocabulary', text: 'lamp that is easy on tired eyes', match: { facet: 'eyes', pol: 'pos' } },
    { family: 'identifier', text: 'VS-2210', match: { code: 'VS-2210' } },
    { family: 'identifier', text: 'ET-4471', match: { code: 'ET-4471' } },
    { family: 'identifier', text: 'reviews mentioning OT-0428', match: { code: 'OT-0428' } },
    { family: 'identifier', text: 'FG-6630 feedback', match: { code: 'FG-6630' } },
    { family: 'comparison', text: 'the Vantro Stride is better than the Kelvra Pulse', match: { pair: 'buds', winner: 'a' } },
    { family: 'comparison', text: 'the Kelvra Pulse is better than the Vantro Stride', match: { pair: 'buds', winner: 'b' } },
    { family: 'comparison', text: 'prefers the Orvane Trailhead over the Zentiq Daypack', match: { pair: 'packs', winner: 'a' } },
    { family: 'comparison', text: 'prefers the Zentiq Daypack over the Orvane Trailhead', match: { pair: 'packs', winner: 'b' } },
    { family: 'negation', text: 'gear that is actually waterproof', match: { facet: 'water', pol: 'pos' } },
    { family: 'negation', text: 'items that do not keep water out', match: { facet: 'water', pol: 'neg' } },
    { family: 'negation', text: 'stays put during exercise', match: { facet: 'fit', pol: 'pos' } },
    { family: 'negation', text: 'does not last a full day on one charge', match: { facet: 'battery', pol: 'neg' } },
    { family: 'sarcasm', text: 'great build quality that lasts', match: { facet: 'durable', pol: 'pos' } },
    { family: 'sarcasm', text: 'a real bargain', match: { facet: 'value', pol: 'pos' } },
    { family: 'sarcasm', text: 'broke almost immediately', match: { facet: 'durable', pol: 'neg' } },
    { family: 'duplicates', text: 'soft light that does not cause glare', match: { facet: 'eyes', pol: 'pos' } },
    { family: 'duplicates', text: 'quick and painless to get started', match: { facet: 'setup', pol: 'pos' } },
    { family: 'long', text: 'zip broke off the bag', match: { fact: 'zip' } },
    { family: 'long', text: 'skin irritation from wearing the watch', match: { fact: 'strap' } },
    { family: 'long', text: 'liquid dripping out of the bottom of the jug', match: { fact: 'blade' } },
    { family: 'long', text: 'lid mechanism snapped', match: { fact: 'hinge' } },
    { family: 'multi', text: 'tough and comfortable backpack', match: { all: ['durable', 'comfort'], pol: 'pos' } },
  ],
  heldout: [
    { family: 'vocabulary', text: 'holds steady while I exercise hard', match: { facet: 'fit', pol: 'pos' } },
    { family: 'vocabulary', text: 'silences a noisy commute', match: { facet: 'noise', pol: 'pos' } },
    { family: 'vocabulary', text: 'goes a long time without needing power', match: { facet: 'battery', pol: 'pos' } },
    { family: 'vocabulary', text: 'pleasant to wear for hours on end', match: { facet: 'comfort', pol: 'pos' } },
    { family: 'vocabulary', text: 'no scrubbing needed after use', match: { facet: 'clean', pol: 'pos' } },
    { family: 'vocabulary', text: 'quiet enough to use while the baby sleeps', match: { facet: 'quiet', pol: 'pos' } },
    { family: 'vocabulary', text: 'loud and disturbs the household', match: { facet: 'quiet', pol: 'neg' } },
    { family: 'vocabulary', text: 'worth every cent', match: { facet: 'value', pol: 'pos' } },
    { family: 'identifier', text: 'KP-3150', match: { code: 'KP-3150' } },
    { family: 'identifier', text: 'NR-8812', match: { code: 'NR-8812' } },
    { family: 'identifier', text: 'reviews mentioning BB-5560', match: { code: 'BB-5560' } },
    { family: 'identifier', text: 'CB-2093 feedback', match: { code: 'CB-2093' } },
    { family: 'comparison', text: 'the Solvia Cell is better than the Dynaro Volt', match: { pair: 'banks', winner: 'a' } },
    { family: 'comparison', text: 'the Dynaro Volt is better than the Solvia Cell', match: { pair: 'banks', winner: 'b' } },
    { family: 'comparison', text: 'prefers the Hearthly Crisp over the Cookwell Turbo', match: { pair: 'fryers', winner: 'a' } },
    { family: 'comparison', text: 'prefers the Cookwell Turbo over the Hearthly Crisp', match: { pair: 'fryers', winner: 'b' } },
    { family: 'negation', text: 'truly waterproof in heavy rain', match: { facet: 'water', pol: 'pos' } },
    { family: 'negation', text: 'does not stay in place when moving', match: { facet: 'fit', pol: 'neg' } },
    { family: 'negation', text: 'not comfortable to wear for long', match: { facet: 'comfort', pol: 'neg' } },
    { family: 'negation', text: 'battery that does last', match: { facet: 'battery', pol: 'pos' } },
    { family: 'sarcasm', text: 'wonderful durable product', match: { facet: 'durable', pol: 'pos' } },
    { family: 'sarcasm', text: 'superb waterproofing', match: { facet: 'water', pol: 'pos' } },
    { family: 'sarcasm', text: 'fell apart quickly', match: { facet: 'durable', pol: 'neg' } },
    { family: 'duplicates', text: 'runs without waking anyone', match: { facet: 'quiet', pol: 'pos' } },
    { family: 'duplicates', text: 'too hot to hold', match: { facet: 'heat', pol: 'neg' } },
    { family: 'long', text: 'the charging socket came loose', match: { fact: 'usb' } },
    { family: 'long', text: 'brightness control got stuck', match: { fact: 'dimmer' } },
    { family: 'long', text: 'lost the cord in the jacket hood', match: { fact: 'hood' } },
    { family: 'long', text: 'bottom of the shoe came unglued', match: { fact: 'sole' } },
    { family: 'multi', text: 'comfortable shoes built to last', match: { all: ['durable', 'comfort'], pol: 'pos' } },
  ],
};

// A few dev labels are deliberately wrong. Candidates who inspect failures can catch them.
// Held-out labels are never altered.
export const NOISY_DEV_QUERIES = ['stays secure during a workout', 'simple to wash after cooking', 'a real bargain'];
