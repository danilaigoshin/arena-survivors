/**
 * Pixel-art sprites authored as text grids, baked to offscreen canvases.
 * '.' / ' ' = transparent, any other char looks up the sprite's palette.
 * Art faces right by default; pass flip to face left.
 * A sprite is a list of FRAMES (same size); frame 0 = idle.
 */
interface SpriteDef {
  frames: string[][];
  palette: Record<string, string>;
}

const OUT = '#1a1220'; // shared dark outline

/** [base, ...variants] where each variant replaces the LAST N rows of base. */
function anim(base: string[], ...variants: string[][]): string[][] {
  return [base, ...variants.map((v) => [...base.slice(0, base.length - v.length), ...v])];
}

export const SPRITES: Record<string, SpriteDef> = {
  // ── heroes: 14×16, frames [idle, walkA, walkB] ────────────
  potato: {
    palette: { o: OUT, b: '#c98f4e', l: '#e8bd80', d: '#9c6a34', w: '#ffffff', k: '#22181c', m: '#8a5a28', r: '#e0857a' },
    frames: anim(
      [
        '.....oooo.....',
        '...oolllloo...',
        '..ollllllbo...',
        '.olllbbbbbbo..',
        '.olbbbbbbbbdo.',
        'olbwkbbbwkbbdo',
        'olbwkbbbwkbbdo',
        'olbbbbbbbbbbdo',
        'obbrbbbbbbrbdo',
        'obbbbmmmbbbbdo',
        '.obbbbbbbbbdo.',
        '.obbbbbbbbbdo.',
        '..obbbbbbbdo..',
        '...oobbbboo...',
        '....odd.odd...',
        '....ooo.ooo...',
      ],
      ['...odd..odd...', '...ooo...oo...'],
      ['.....odd.dd...', '.....oo..oo...'],
      ['....odd..odd..', '....oo...ooo..'],
      ['..odd....odd..', '..ooo.....oo..'],
    ),
  },
  knight: {
    palette: { o: OUT, s: '#c2ccdc', d: '#8894ac', k: '#2a3040', r: '#d84a54', c: '#4f9cf0', g: '#7a8498' },
    frames: anim(
      [
        '.....rrrr.....',
        '....orrrro....',
        '...osssssso...',
        '..osssssssso..',
        '..oskkskkso...',
        '..ossssssso...',
        '...odddddo....',
        '..osssssssso..',
        '.ogsscccssgo..',
        '.ogsscccssgo..',
        '.ogssssssssgo.',
        '..osssssssso..',
        '..odssssssdo..',
        '...oddddddo...',
        '...okk..kko...',
        '...oo....oo...',
      ],
      ['..okk...kko...', '..oo.....oo...'],
      ['....okk.kko...', '....oo...oo...'],
      ['...okk...kko..', '...oo.....oo..'],
      ['..okk....kko..', '..oo......oo..'],
    ),
  },
  ranger: {
    palette: { o: OUT, g: '#5da05a', d: '#3f7440', s: '#eec39a', k: '#22181c', h: '#8a5a3a', b: '#445566' },
    frames: anim(
      [
        '....oooooo....',
        '...oggggggo...',
        '..oggggggggo..',
        '..odddddddoo..',
        '..osssssssso..',
        '..osksssskso..',
        '..osssssssso..',
        '...osssssso...',
        '..oggggggggo..',
        '.oggggggggggo.',
        'obggggggggggbo',
        '.oggggggggggo.',
        '..obbbbbbbbo..',
        '...oggggggo...',
        '...ohh..hho...',
        '...oo....oo...',
      ],
      ['..ohh...hho...', '..oo.....oo...'],
      ['....ohh.hho...', '....oo...oo...'],
      ['...ohh...hho..', '...oo.....oo..'],
      ['..ohh....hho..', '..oo......oo..'],
    ),
  },
  mage: {
    palette: { o: OUT, p: '#8f5adf', d: '#6a3cae', s: '#eec39a', k: '#22181c', y: '#ffd23e', w: '#cfd6ff' },
    frames: anim(
      [
        '......oo......',
        '.....oppo.....',
        '....oppppo....',
        '...oppppppo...',
        '..oppypppppo..',
        'oooooooooooooo',
        '..osssssssso..',
        '..osksssskso..',
        '..osssssssso..',
        '...oddddddo...',
        '..odppppppdo..',
        '.oydppppppdyo.',
        '..odppppppdo..',
        '..oddddddddo..',
        '..oddddddddo..',
        '...oo....oo...',
      ],
      ['..odddddddo...', '..oo.....oo...'],
      ['..oddddddddo..', '....oo..oo....'],
      ['...odddddddo..', '...oo.....oo..'],
      ['.odddddddddo..', '..oo......oo..'],
    ),
  },

  // shop keeper: hooded trader with an apron and a coin pouch
  merchant: {
    palette: { o: OUT, p: '#7a4a9c', d: '#5a3474', s: '#eec39a', k: '#22181c', a: '#8a5a3a', g: '#ffd23e', w: '#ffffff' },
    frames: anim(
      [
        '.....oooo.....',
        '....oppppo....',
        '...oppppppo...',
        '..oppppppppo..',
        '..odssssssdo..',
        '..osksssksso..',
        '..osswwwsso...',
        '...ossssso.oo.',
        '..oappppaooggo',
        '..oappppppoggo',
        '..oaappppppoo.',
        '..oaaaaaaaapo.',
        '..oaaaaaaaao..',
        '...oaaaaaao...',
        '...odd..ddo...',
        '...oo....oo...',
      ],
      [
        '...ossssso....',
        '..oappppppao..',
        '..oappppppao..',
        '..oaaaaaaaaogg',
        '..oaaaaaaaao.g',
        '..oaaaaaaaao..',
        '...oaaaaaao...',
        '...odd..ddo...',
        '...oo....oo...',
      ],
      [
        '..odd....ddo..',
        '..oo......oo..',
      ],
    ),
  },

  // ── held weapon sprites (point right) ─────────────────────
  w_pistol: {
    palette: { o: OUT, g: '#3fae57', d: '#2c7c3e', k: '#33334a' },
    frames: [[
      '..ooooooooo.',
      '.ogggggggggo',
      '.ogggdddgggo',
      '..ookggoo...',
      '...okko.....',
      '...oo.......',
    ]],
  },
  w_smg: {
    palette: { o: OUT, b: '#556', d: '#334', k: '#33334a' },
    frames: [[
      '.oooooooooo.',
      'obbbbbbbbbbo',
      'obbdddddbbbo',
      '.ooobbooo...',
      '..okko.oko..',
      '...oo...oo..',
    ]],
  },
  w_sword: {
    palette: { o: OUT, w: '#e8f0ff', s: '#b8c4d8', g: '#d8a832', h: '#6e4a2c' },
    frames: [[
      '...owwwwwwwo..',
      '.ogssssssssso.',
      'ohgooooooooo..',
    ]],
  },
  w_crossbow: {
    palette: { o: OUT, c: '#8a5a3a', s: '#d8d0c0', t: '#6e4a2c' },
    frames: [[
      '.oc.....co.',
      '..oc...co..',
      '...ossso...',
      'ottttttttto',
      '...ossso...',
      '..oc...co..',
      '.oc.....co.',
    ]],
  },
  w_railgun: {
    palette: { o: OUT, c: '#4f9cf0', w: '#c8ecff', k: '#33334a' },
    frames: [[
      '.oooooooooooo.',
      'occwwccwwccwwo',
      'occcccccccccwo',
      '.ooo.okko.....',
      '.....oko......',
    ]],
  },
  w_stormgun: {
    palette: { o: OUT, b: '#557', d: '#8be9fd', k: '#33334a' },
    frames: [[
      '.oooooooooo.',
      'obbbdddbbbbo',
      '.oooooooooo.',
      'obbbdddbbbbo',
      '.ooookkooo..',
      '.....oo.....',
    ]],
  },
  w_stormblade: {
    palette: { o: OUT, c: '#6ec8e8', w: '#e0f8ff', g: '#d8a832', h: '#6e4a2c' },
    frames: [[
      '..occccccccco.',
      '.ogccwwwwwcco.',
      'ohgccccccccco.',
      '..occccccco...',
    ]],
  },
  w_staff: {
    palette: { o: OUT, h: '#8a5a3a', g: '#d8a832', c: '#a06ae0', w: '#e0ccff' },
    frames: [[
      '...........oo..',
      '..........occco',
      '.........ocwwco',
      'ohhhhhhhggcccco',
      '.........ocwwco',
      '..........occco',
      '...........oo..',
    ]],
  },
  w_thunderstaff: {
    palette: { o: OUT, h: '#49627a', g: '#d8a832', c: '#6ec8e8', w: '#e8fbff' },
    frames: [[
      '............o....',
      '..........o.c.o..',
      '.........ocwcwco.',
      'ohhhhhhhhggccccco',
      '.........ocwcwco.',
      '..........o.c.o..',
      '............o....',
    ]],
  },
  w_shotgun: {
    palette: { o: OUT, m: '#596575', w: '#aebccc', h: '#7b4f30', g: '#d8a832' },
    frames: [[
      '.......oooooo..',
      '..ooooommmmmo..',
      '.ommmmmmmmmmmoo',
      'ohhhhhgggmmmmoo',
      '..oohh.ooooo...',
      '...ohho........',
      '....oo.........',
    ]],
  },
  w_dragonbreath: {
    palette: { o: OUT, r: '#d54b32', f: '#ff9a45', y: '#ffe06a', h: '#663526' },
    frames: [[
      '........ooyyo...',
      '..ooooorrffyoo..',
      '.orrrrrrrffrrroo',
      'ohhhhhffyrrrrroo',
      '..oohh.oooooo...',
      '...ohho.........',
      '....oo..........',
    ]],
  },
  w_grenade_launcher: {
    palette: { o: OUT, g: '#4f6b55', d: '#304438', m: '#88958e', h: '#6e4a2c' },
    frames: [[
      '..ooooooooooo...',
      '.ogggggggggggo..',
      'ogggddddggggggoo',
      '.oooohhhhoooo...',
      '....ohhhho......',
      '....o....o......',
      '....oo..oo......',
    ]],
  },
  w_cluster_mortar: {
    palette: { o: OUT, c: '#6ec8e8', w: '#e8fbff', m: '#596575', y: '#ffd23e' },
    frames: [[
      '.oo.oo.oo.oo....',
      'ocwocwocwocwo...',
      '.ooooooooooooo..',
      'ommmmmmmmmmmmmoo',
      '.ooomyyyyymoo...',
      '....ommmmmo.....',
      '.....ooooo......',
    ]],
  },
  w_ricochet_rifle: {
    palette: { o: OUT, c: '#4f9cf0', s: '#b9d8ee', k: '#33334a', g: '#d8a832' },
    frames: [[
      '.....o..o.......',
      '.ooooosccsoooo..',
      'occcccccccccccoo',
      '.oooocggcoooo...',
      '.....okko.......',
      '.....o..o.......',
      '................',
    ]],
  },
  w_prism_rifle: {
    palette: { o: OUT, p: '#a06ae0', c: '#6ec8e8', w: '#ffffff', k: '#33334a' },
    frames: [[
      '....o..o..o.......',
      '.oooowpcpwcoooo...',
      'opppcccccccppppoo.',
      '.ooopwcpcwpooo....',
      '.....okkkko.......',
      '......o..o........',
      '..................',
    ]],
  },
  w_daggers: {
    palette: { o: OUT, w: '#e8f0ff', s: '#aeb8cc', g: '#d8a832', h: '#6e4a2c' },
    frames: [[
      '..owwwwwo....',
      '.ogssssso....',
      'ohgooooo.....',
      '.....owwwwwo.',
      '.....ogssssso',
      '.....ohgooooo',
      '.............',
    ]],
  },
  w_shadow_blades: {
    palette: { o: OUT, p: '#7546c8', w: '#eadfff', d: '#342055', g: '#d8a832' },
    frames: [[
      '.opwwwwpo.....',
      'ogppppppo.....',
      '.odooooo......',
      '.....opwwwwpo.',
      '.....ogppppppo',
      '......odooooo.',
      '..............',
    ]],
  },
  w_warhammer: {
    palette: { o: OUT, m: '#687080', s: '#aeb8c8', h: '#724a2f', g: '#d8a832' },
    frames: [[
      '.....oooooooo..',
      '....omssssssmo.',
      '....ommmmmmmmo.',
      'ohhhhhhhggoooo.',
      '.........ommo..',
      '.........oooo..',
      '...............',
    ]],
  },
  w_titan_hammer: {
    palette: { o: OUT, g: '#d8a832', y: '#ffe9a0', m: '#687080', r: '#b84432', h: '#724a2f' },
    frames: [[
      '....oooyyyooo...',
      '...ogggggggggo..',
      '..ogymmmmmmyggo.',
      'ohhhhhhhggrrrrro',
      '........ogggggo.',
      '.........ooooo..',
      '................',
    ]],
  },
  w_spear: {
    palette: { o: OUT, w: '#e8f0ff', s: '#aeb8c8', h: '#7b4f30', g: '#d8a832' },
    frames: [[
      '.............owwo',
      'ohhhhhhhhhggsswwo',
      '.............owwo',
    ]],
  },
  w_gungnir: {
    palette: { o: OUT, c: '#6ec8e8', w: '#ffffff', h: '#49627a', g: '#ffd23e' },
    frames: [[
      '............ocwwo.',
      'ohhhhhhhhggccwwwwo',
      '............ocwwo.',
    ]],
  },
  w_chakram: {
    palette: { o: OUT, m: '#9aa8b8', w: '#e8f0ff', g: '#d8a832' },
    frames: [[
      '...ooooo...',
      '.oommmmmoo.',
      'omww...wwmo',
      'omw..g..wmo',
      'omww...wwmo',
      '.oommmmmoo.',
      '...ooooo...',
    ]],
  },
  w_solar_disc: {
    palette: { o: OUT, y: '#ffe06a', f: '#ff9a45', w: '#ffffff' },
    frames: [[
      '....oyyo....',
      '..oyffffyo..',
      '.oyfw..wfyo.',
      'oyfw.oo.wfyo',
      '.oyfw..wfyo.',
      '..oyffffyo..',
      '....oyyo....',
    ]],
  },
  w_fire_wand: {
    palette: { o: OUT, h: '#7b4f30', r: '#d54b32', f: '#ff9a45', y: '#ffe06a', g: '#d8a832' },
    frames: [[
      '..........oyyo.',
      '.........ofyyfo',
      '........orfyfro',
      'ohhhhhhhggrrrro',
      '.........orfyro',
      '..........offo.',
      '...........oo..',
    ]],
  },
  w_armageddon: {
    palette: { o: OUT, r: '#c83c2c', f: '#ff7030', y: '#ffe06a', k: '#4a2020' },
    frames: [[
      '.......oyyo......',
      '.....ooffffoo....',
      '...oorrfyyfrroo..',
      'okkkkkrrffrrkkkko',
      '...oorrfyyfrroo..',
      '.....ooffffoo....',
      '.......oyyo......',
    ]],
  },
  w_ice_tome: {
    palette: { o: OUT, b: '#4f9cf0', c: '#bfe8ff', w: '#ffffff', d: '#315e9a' },
    frames: [[
      '..ooooooooo..',
      '.obbbbbbbbbo.',
      'obbcwwcbbbbo.',
      'obbcwcwbbbbo.',
      'obbcwwcbbbbo.',
      '.odddddddddo.',
      '..ooooooooo..',
    ]],
  },
  w_absolute_zero: {
    palette: { o: OUT, c: '#6ec8e8', w: '#ffffff', b: '#4f9cf0', d: '#315e9a' },
    frames: [[
      '....owwo....',
      '..ooccccoo..',
      'occbwwbcccco',
      'ocwwccwwccco',
      'occbwwbcccco',
      '..ooddddoo..',
      '....oooo....',
    ]],
  },
  w_runestone: {
    palette: { o: OUT, s: '#777180', p: '#a06ae0', w: '#e8dcff', d: '#4a4055' },
    frames: [[
      '...ooooo...',
      '..ossssso..',
      '.osspwssso.',
      'osspwpwssso',
      '.osspwssso.',
      '..odddddo..',
      '...ooooo...',
    ]],
  },
  w_void_seal: {
    palette: { o: OUT, p: '#7546c8', w: '#eadfff', d: '#25183e', c: '#6ec8e8' },
    frames: [[
      '....oppo....',
      '..oppwwppo..',
      '.opwddddwpo.',
      'opwdoccodwpo',
      '.opwddddwpo.',
      '..oppwwppo..',
      '....oppo....',
    ]],
  },
  w_soul_lantern: {
    palette: { o: OUT, m: '#596575', p: '#a06ae0', w: '#eadfff', g: '#d8a832' },
    frames: [[
      '....oggo....',
      '...oommoo...',
      '..omppppmo..',
      '..ompwwpmo..',
      '..omppppmo..',
      '...ommmmo...',
      '....oooo....',
    ]],
  },
  w_soul_legion: {
    palette: { o: OUT, p: '#7546c8', w: '#ffffff', c: '#6ec8e8', g: '#ffd23e' },
    frames: [[
      '..o..oggo..o...',
      '.opooopppooopo.',
      'opwppcwcwppwpo.',
      '.opooopppooopo.',
      '..o..opppo..o..',
      '.....ocwco.....',
      '......ooo......',
    ]],
  },

  // battlefield chest
  chest: {
    palette: { o: OUT, w: '#c89c66', b: '#8a5f38', y: '#ffd23e', d: '#6e4a2c' },
    frames: [[
      '..oooooooo..',
      '.owwwwwwwwo.',
      'owwwwwwwwwwo',
      'oyyyyyyyyyyo',
      'obbbbyybbbbo',
      'obbbbyybbbbo',
      'obbbbbbbbbbo',
      'odbbbbbbbbdo',
      '.oooooooooo.',
    ]],
  },

  // ── UI icons (pixel replacements for emoji) ──────────────
  i_gem: {
    palette: { o: OUT, c: '#4fc3f0', w: '#c8f0ff', d: '#2a8ab8' },
    frames: [['..oooooo..', '.owwcccco.', 'owccccccdo', '.occccddo.', '..occddo..', '...occo...', '....oo....']],
  },
  i_shard: {
    palette: { o: OUT, c: '#a06ae0', w: '#e0ccff', d: '#6a3cae' },
    frames: [['..oooooo..', '.owwcccco.', 'owccccccdo', '.occccddo.', '..occddo..', '...occo...', '....oo....']],
  },
  i_grimoire: {
    palette: { o: OUT, p: '#6a3cae', d: '#3e246f', c: '#e8dcc8', w: '#8be9fd', g: '#d8a832' },
    frames: [[
      '..ooooooo..',
      '.opppppppo.',
      'opppcccpppo',
      'opppcwcpppo',
      'opppcccpppo',
      'opppgggpppo',
      '.odddddddo.',
      '..ooooooo..',
    ]],
  },
  i_skull: {
    palette: { o: OUT, w: '#d8d4c4', k: '#2a2420' },
    frames: [['..oooooo..', '.owwwwwwo.', 'owwkwwkwwo', 'owwwwwwwwo', '.owwkkwwo.', '..owwwwo..', '...w..w...']],
  },
  i_heart: {
    palette: { o: OUT, r: '#e04858', l: '#ff8898' },
    frames: [['..oo..oo..', '.orroorro.', 'orrlrrrrro', 'orrrrrrrro', '.orrrrrro.', '..orrrro..', '...orro...', '....oo....']],
  },
  i_heartbig: {
    palette: { o: OUT, r: '#f070a8', l: '#ffb8d8' },
    frames: [['..oo..oo..', '.orroorro.', 'orrlrrrrro', 'orrrrrrrro', '.orrrrrro.', '..orrrro..', '...orro...', '....oo....']],
  },
  i_regen: {
    palette: { o: OUT, g: '#4ac860', w: '#ffffff' },
    frames: [['..oo..oo..', '.oggooggo.', 'ogggwwgggo', 'ogwwwwwwgo', '.oggwwggo.', '..oggggo..', '...oggo...', '....oo....']],
  },
  i_sword: {
    palette: { o: OUT, s: '#b8c4d8', w: '#e8f0ff', g: '#d8a832', h: '#6e4a2c' },
    frames: [['....oo....', '...owso...', '...owso...', '...owso...', '...owso...', '..oggggo..', '...ohho...', '....oo....']],
  },
  i_aspd: {
    palette: { o: OUT, y: '#ffd23e' },
    frames: [['...oyyy...', '..oyyo....', '.oyyyyyo..', '...oyyo...', '..oyyo....', '..oyo.....', '..oo......']],
  },
  i_speed: {
    palette: { o: OUT, b: '#4f9cf0', d: '#2a6ab8' },
    frames: [['..oooo....', '..obbo....', '..obbo....', '..obbboo..', '..obbbbbo.', '..odddddo.', '...ooooo..']],
  },
  i_armor: {
    palette: { o: OUT, s: '#8894ac', w: '#c2ccdc' },
    frames: [['.oooooooo.', 'osswwwssso', 'ossswwssso', 'osssssssso', '.osssssso.', '..osssso..', '...osso...', '....oo....']],
  },
  i_crit: {
    palette: { o: OUT, r: '#e04858', w: '#ffffff', k: '#22181c' },
    frames: [['..oooooo..', '.orwwwwro.', 'orwrrrrwro', 'orwrkkrwro', 'orwrkkrwro', 'orwrrrrwro', '.orwwwwro.', '..oooooo..']],
  },
  i_magnet: {
    palette: { o: OUT, r: '#e04858', w: '#e8e8f0' },
    frames: [['.oo....oo.', 'owwo..owwo', 'orro..orro', 'orro..orro', '.orrrrrro.', '..oooooo..']],
  },
  i_luck: {
    palette: { o: OUT, g: '#4ac860', d: '#2c8a40' },
    frames: [['..oo.oo...', '.oggoggo..', '.ogggggo..', '..ogggo...', '....og....', '....og....']],
  },
  i_orb: {
    palette: { o: OUT, p: '#8f5adf', w: '#e0ccff', d: '#6a3cae' },
    frames: [['...oooo...', '..owwppo..', '.owpppppo.', '.opppppdo.', '..oppddo..', '...oooo...']],
  },
  i_soul: {
    palette: { o: OUT, p: '#a06ae0', w: '#ffffff', c: '#6ec8e8' },
    frames: [['...oooo...', '..oppppo..', '.opwpwppo.', '.oppppppo.', '..opccpo..', '...occo...', '....oo....']],
  },
  i_planet: {
    palette: { o: OUT, p: '#c88a4a', y: '#ffd23e', d: '#8a5a2c' },
    frames: [['...oooo...', '..oppppo..', 'oyoppppoyo', '.oyyyyyyo.', '..opddpo..', '...oooo...']],
  },
  i_flail: {
    palette: { o: OUT, g: '#8a8a98', d: '#5e5e6c' },
    frames: [['.oo.......', '..oo......', '...oo.....', '...ogggo..', '..ogggggo.', '..ogggdgo.', '...ogddo..', '....ooo...']],
  },
  i_apple: {
    palette: { o: OUT, r: '#e04848', l: '#ff9088', t: '#6e4a2c' },
    frames: [['....ot....', '..oooooo..', '.orrrlrro.', '.orrrrrro.', '.orrrrrro.', '..orrrro..', '...oooo...']],
  },
  i_stone: {
    palette: { o: OUT, g: '#8a8a98', l: '#b4b4c2', d: '#5e5e6c' },
    frames: [['..oooooo..', '.ollggggo.', 'olggggggdo', '.ogggdddo.', '..oooooo..']],
  },
  i_coffee: {
    palette: { o: OUT, b: '#7a5230', w: '#e8e0d0', s: '#b0a890' },
    frames: [['..s..s....', '.oooooo...', 'owwwwwwo..', 'obbbbbboo.', 'obbbbbbo..', '.oooooo...']],
  },
  i_bandage: {
    palette: { o: OUT, w: '#e8e4d8', r: '#e04858' },
    frames: [['.oooooo...', 'owwwwwwo..', 'owwrrwwo..', 'owwwwwwo..', '.oooooo...']],
  },
  i_scope: {
    palette: { o: OUT, b: '#556a8a', w: '#c8ecff' },
    frames: [['......oo..', '.....owbo.', '....obbo..', '...obbo...', '..obbo....', '..oo......']],
  },
  i_steak: {
    palette: { o: OUT, r: '#c04848', m: '#f0e0d0' },
    frames: [['..oooooo..', '.orrrrrmo.', 'orrrmmrrro', '.orrrrrro.', '..oooooo..']],
  },
  i_rage: {
    palette: { o: OUT, r: '#d84040', k: '#22181c' },
    frames: [['..oooooo..', '.orrrrrro.', 'orkrrrrkro', 'orrrrrrrro', '.orkkkkro.', '..oooooo..']],
  },
  i_battery: {
    palette: { o: OUT, g: '#4ac860', y: '#ffd23e', d: '#2c8a40' },
    frames: [['...oo.....', '.oooooo...', '.oggggo...', '.ogyygo...', '.ogyygo...', '.odddgo...', '.oooooo...']],
  },
  i_crown: {
    palette: { o: OUT, y: '#ffd23e', r: '#e04858', d: '#c89a20' },
    frames: [['oy..yy..yo', 'oyy.yy.yyo', 'oyyyyyyyyo', 'oyryyyyryo', 'oddddddddo']],
  },
  i_potion: {
    palette: { o: OUT, w: '#c8ecff', p: '#b13be0', t: '#6e4a2c' },
    frames: [['...ot.....', '...owo....', '..owwwo...', '.owpppwo..', '.owpppwo..', '..ooooo...']],
  },
  i_star: {
    palette: { o: OUT, y: '#ffd23e', l: '#ffe9a0' },
    frames: [['....oo....', '...oyyo...', 'oooyylyooo', '.oyyyyyyo.', '..oyyyyo..', '.oyo..oyo.']],
  },
  i_trophy: {
    palette: { o: OUT, y: '#ffd23e', d: '#c89a20' },
    frames: [['.oooooooo.', 'ooyyyyyyoo', 'o.oyyyyo.o', '...oyyo...', '...oddo...', '..oyyyyo..', '..oooooo..']],
  },
  i_lock: {
    palette: { o: OUT, g: '#8a8a98', y: '#ffd23e', k: '#22181c' },
    frames: [['...oooo...', '..og..go..', '..og..go..', '.oyyyyyyo.', '.oyykkyyo.', '.oyyyyyyo.', '..oooooo..']],
  },
  i_wave: {
    palette: { o: OUT, c: '#4fc3f0', w: '#c8f0ff' },
    frames: [['..ooo.ooo.', '.occo.occo', 'occcooccco', 'owcccwccco', '.oooooooo.']],
  },
  i_sound: {
    palette: { o: OUT, s: '#c2ccdc', w: '#8be9fd' },
    frames: [['....os....', '..ooss.w..', '.ossss..w.', '.ossss..w.', '..ooss.w..', '....os....']],
  },
  i_music: {
    palette: { o: OUT, y: '#ffd23e' },
    frames: [['...oyyyy..', '...oy..y..', '...oy..y..', '.oyy..oyy.', '.oyy..oyy.']],
  },
  i_dice: {
    palette: { o: OUT, w: '#e8e4d8', k: '#22181c' },
    frames: [['.ooooooo..', 'owwwwwwwo.', 'owkwwwkwo.', 'owwwkwwwo.', 'owkwwwkwo.', '.ooooooo..']],
  },

  // ── floor decals (small, no heavy outline — they stay subtle) ──
  i_lang: {
    palette: { o: OUT, b: '#4f9cf0', g: '#6faa5e', w: '#d8ecff' },
    frames: [[
      '...oooooo...',
      '..obbwbbbo..',
      '.obbwbbgbbo.',
      'obbwbbbggbbo',
      'obwbbbbbgbbo',
      'obwbggbbbbbo',
      'obwbgggbbbbo',
      'obbwbggbbbbo',
      'obbwbbbbgbbo',
      '.obbwbbggbo.',
      '..obbwbbbo..',
      '...oooooo...',
    ]],
  },
  flower: {
    palette: { o: OUT, p: '#d88ab8', y: '#ffd23e', g: '#3f7440' },
    frames: [['..oppo..', '.opyypo.', '.opyypo.', '..oppo..', '...og...', '...og...']],
  },
  grass: {
    palette: { g: '#33502f', l: '#4a7040' },
    frames: [['..l..g..', '.gl..g.l', '.gl.gg.l', '.glggg.l']],
  },
  bone: {
    palette: { w: '#c9c4b4', d: '#8e8a7c' },
    frames: [['ww....ww', '.wwwwww.', 'wd....dw']],
  },
  skull_d: {
    palette: { w: '#b4b0a0', k: '#2a2420' },
    frames: [['.wwwww..', 'wwkwwkw.', '.wwwww..', '.w.w.w..']],
  },
  mushroom: {
    palette: { r: '#b04a4a', w: '#e8d8c8', s: '#c8b498' },
    frames: [['..rrrr..', '.rwrrwr.', 'rrrrrrrr', '...ss...', '...ss...']],
  },
  stump: {
    palette: { t: '#6e4a2c', l: '#9a7048', d: '#4a3220' },
    frames: [['.tttttt.', 'tllttllt', 'tttttttt', '.dddddd.']],
  },
  iceshard: {
    palette: { c: '#5aa8cc', w: '#c8ecff', d: '#38708c' },
    frames: [['...cc...', '..wccc..', '.wccccc.', 'wccccccd', '.ccccdd.']],
  },
  reed: {
    palette: { g: '#4a6a3a', b: '#8a6a42' },
    frames: [['.b..b...', '.g..b..b', '.g..g..g', 'g..gg..g', 'g..g.g.g']],
  },

  // ── obstacles ─────────────────────────────────────────────
  rock: {
    palette: { o: OUT, g: '#8a8a98', l: '#b4b4c2', d: '#5e5e6c' },
    frames: [[
      '....oooo....',
      '..oolllloo..',
      '.olllggggo..',
      '.olggggggo..',
      'olgggggggdo.',
      'ogggggggddo.',
      'oggggddddddo',
      '.odddddddo..',
      '..ooddddoo..',
      '....oooo....',
    ]],
  },
  tree: {
    palette: { o: OUT, g: '#3f7c46', l: '#5da05a', d: '#2c5a34', t: '#6e4a2c' },
    frames: [[
      '....oooo....',
      '..oolllloo..',
      '.ollggggllo.',
      'olgggggggglo',
      'oggggggggggo',
      'ogggdgggdggo',
      'oggggggggggo',
      '.oggggggggo.',
      '..oogggoo...',
      '....otto....',
      '....otto....',
      '...otttto...',
      '...oooooo...',
    ]],
  },
  pillar: {
    palette: { o: OUT, m: '#c8c4b8', l: '#e8e4d8', d: '#8e8a80' },
    frames: [[
      '.oooooooooo.',
      'olmmmmmmmmlo',
      '.oommmmmmoo.',
      '..ommmmmdo..',
      '..ommmmmdo..',
      '..ommmmmdo..',
      '..ommmmmdo..',
      '..ommmmmdo..',
      '..ommmmmdo..',
      '..ommmmmdo..',
      '.oommmmmmoo.',
      'olmmmmmmmmlo',
      '.oooooooooo.',
    ]],
  },
  crystal: {
    palette: { o: OUT, c: '#6ec8e8', w: '#d8f4ff', d: '#3a86ac' },
    frames: [[
      '.....oo.....',
      '....occo....',
      '....occo....',
      '...owccco...',
      '...owccco...',
      '..owccccco..',
      '..owccccco..',
      '.owccccccco.',
      '.owccccccco.',
      'owccccccccco',
      'occcccccccdo',
      '.oooooooooo.',
    ]],
  },
  tombstone: {
    palette: { o: OUT, s: '#9a9aac', d: '#5e5e70', m: '#4d7c42' },
    frames: [[
      '...oooooo...',
      '..osssssso..',
      '.osssssssso.',
      '.osssddssso.',
      '.ossddddsso.',
      '.osssddssso.',
      '.osssddssso.',
      '.osssssssso.',
      '.osssssssso.',
      'omssssssssmo',
      'oooooooooooo',
    ]],
  },
  crate: {
    palette: { o: OUT, w: '#a87c4a', l: '#c89c66', d: '#7c5830' },
    frames: [[
      'oooooooooooo',
      'olwwwwwwwwlo',
      'owwdwwwwdwwo',
      'owwwdwwdwwwo',
      'owwwwddwwwwo',
      'owwwwddwwwwo',
      'owwwdwwdwwwo',
      'owwdwwwwdwwo',
      'olwwwwwwwwlo',
      'oooooooooooo',
    ]],
  },

  // ── enemies: frames [walkA, walkB] ────────────────────────
  chaser: {
    palette: { o: OUT, g: '#6faa5e', d: '#4d7c42', k: '#2a1a1a', r: '#c04040', t: '#5a4632' },
    frames: anim(
      [
        '...oooooo...',
        '..oggggggo..',
        '.oggggggggo.',
        '.okrggggkro.',
        '.oggggggggo.',
        '.ogddddddgo.',
        '..oggggggo..',
        '.oottttttoo.',
        'ogttttttttgo',
        'ogttttttttgo',
        '.otttttttto.',
        '..odd..ddo..',
        '..oo....oo..',
      ],
      ['..odd..ddo..', '...oo..oo...'],
      ['...odd.ddo..', '...oo...oo..'],
      ['.odd....ddo.', '.oo......oo.'],
    ),
  },
  runner: {
    palette: { o: OUT, p: '#9a6ad0', d: '#6e48a0', k: '#1a1022', w: '#e8e0f8' },
    frames: [
      [
        'oo........oo',
        'opoo....oopo',
        'oppoo..ooppo',
        '.opppoopppo.',
        '.oppppppppo.',
        '..opkppkpo..',
        '..oppppppo..',
        '..opwwwwpo..',
        '...oppppo...',
        '....oppo....',
        '.....oo.....',
      ],
      [
        '............',
        'oo........oo',
        'opoo....oopo',
        '.opppoopppo.',
        '.oppppppppo.',
        '..opkppkpo..',
        '..oppppppo..',
        '..opwwwwpo..',
        '...oppppo...',
        '....oppo....',
        '.....oo.....',
      ],
      [
        '............',
        '............',
        'oo........oo',
        'oppo....oppo',
        '.oppppppppo.',
        '..opkppkpo..',
        '..oppppppo..',
        '..opwwwwpo..',
        '...oppppo...',
        '....oppo....',
        '.....oo.....',
      ],
      [
        '............',
        'oo........oo',
        'opoo....oopo',
        '.opppoopppo.',
        '.oppppppppo.',
        '..opkppkpo..',
        '..oppppppo..',
        '..opwwwwpo..',
        '...oppppo...',
        '....oppo....',
        '.....oo.....',
      ],
    ],
  },
  tank: {
    palette: { o: OUT, b: '#9a6a42', d: '#6e4a2c', l: '#c09060', k: '#241610', w: '#e8dcc8', p: '#e090a0' },
    frames: anim(
      [
        '..oo....oo..',
        '.owwo..owwo.',
        '.owwoooowwo.',
        '.obbbbbbbbo.',
        'olbbbbbbbblo',
        'olbkbbbbkblo',
        'obbbbbbbbbbo',
        'obbppbbppbbo',
        'obbbddddbbbo',
        'obbbbbbbbbbo',
        '.obbbbbbbbo.',
        '.odd.oo.ddo.',
        '.odd....ddo.',
      ],
      ['.odd.oo.ddo.', '..dd.....dd.'],
      ['.odd.oo.ddo.', '.dd......dd.'],
    ),
  },
  shooter: {
    palette: { o: OUT, r: '#c04858', d: '#8e3040', s: '#d8c8b0', k: '#201018', y: '#ffd23e' },
    frames: anim(
      [
        '.....oo.....',
        '....orro....',
        '...orrrro...',
        '..orrrrrro..',
        '.orrrrrrrro.',
        '.oooooooooo.',
        '.osssssssso.',
        '.osksssksso.',
        '..osssssso..',
        '.odrrrrrrdo.',
        'oydrrrrrrdyo',
        '.odrrrrrrdo.',
        '..oo....oo..',
      ],
      ['...oo..oo...'],
      ['.oo......oo.'],
    ),
  },
  // splitter: fat green slime, frames [rest, squished]
  splitter: {
    palette: { o: OUT, g: '#5fae4a', l: '#8ad06a', d: '#3d7c30', k: '#1c2e14' },
    frames: [
      [
        '....oooo....',
        '..oolllloo..',
        '.olggggggo..',
        '.ogkgggkggo.',
        'oggggggggggo',
        'oggggggggggo',
        'odgggggggddo',
        '.odddddddo..',
        '..oooooooo..',
      ],
      [
        '............',
        '....oooo....',
        '..oolllloo..',
        '.olgkggkggo.',
        'oggggggggggo',
        'oggggggggggo',
        'odggggggggdo',
        'oddddddddddo',
        '.oooooooooo.',
      ],
      [
        '....oooo....',
        '..oolllloo..',
        '.olggggggo..',
        '.ogkgggkggo.',
        'oggggggggggo',
        'oggggggggggo',
        'odgggggggddo',
        '.oddddddddo.',
        '..ooooooo...',
      ],
    ],
  },
  // slimelet: tiny bouncy blob
  slimelet: {
    palette: { o: OUT, g: '#6fc858', l: '#9ae07a', k: '#1c2e14' },
    frames: [
      ['..oooo..', '.olgggo.', 'ogkggkgo', 'oggggggo', '.oooooo.'],
      ['..oooo..', '.okggko.', 'olgggggo', 'oggggggo', '.oooooo.'],
      ['........', '..oooo..', '.okggko.', 'olgggggo', '.oooooo.'],
      ['..oooo..', '.okggko.', 'olgggggo', 'oggggggo', '.oooooo.'],
    ],
  },
  // hopper: green frog, frames [crouch, leap]
  hopper: {
    palette: { o: OUT, g: '#4a9a48', l: '#72c060', d: '#2e6a2c', k: '#18240f', w: '#e8e8d0' },
    frames: [
      [
        '.oo......oo.',
        'owko....okwo',
        'ogggoooogggo',
        '.oggggggggo.',
        '.oggggggggo.',
        'oggogggggggo',
        'oggogggggggo',
        '.ooggggggo..',
        '..oo...oo...',
      ],
      [
        '.oo......oo.',
        'owko....okwo',
        'ogggoooogggo',
        '.oggggggggo.',
        '.oggggggggo.',
        'oggogggggggo',
        'oggogggggggo',
        '..ooggggoo..',
        '...oo..oo...',
      ],
      [
        '.oo......oo.',
        'owko....okwo',
        'ogggoooogggo',
        '.oggggggggo.',
        'oggggggggggo',
        'ogg.gggg.ggo',
        'ogg.gggg.ggo',
        '.o..gggg..o.',
        '....oooo....',
      ],
      [
        '.oo......oo.',
        'owko....okwo',
        'ogggoooogggo',
        '.oggggggggo.',
        '.oggggggggo.',
        'oggogggggggo',
        'oggogggggggo',
        '..ooggggoo..',
        '...oo..oo...',
      ],
    ],
  },
  // frost: drifting ice wisp
  frost: {
    palette: { o: OUT, c: '#7ec8e8', w: '#d8f4ff', d: '#3a86ac', k: '#102030' },
    frames: [
      [
        '....oooo....',
        '..oowwwwoo..',
        '.owccccccwo.',
        '.ockccckcco.',
        'owccccccccwo',
        '.occcccccco.',
        '..occcccco..',
        '..oc.cc.co..',
        '...o.oo.o...',
      ],
      [
        '....oooo....',
        '..oowwwwoo..',
        '.owccccccwo.',
        '.ockccckcco.',
        'owccccccccwo',
        '.occcccccco.',
        '..occcccco..',
        '...c.oo.c...',
        '....o..o....',
      ],
      [
        '....oooo....',
        '..oowwwwoo..',
        '.owccccccwo.',
        '.ockccckcco.',
        'owccccccccwo',
        '.occcccccco.',
        '..occcccco..',
        '..c..cc..c..',
        '....o..o....',
      ],
    ],
  },
  // bomber: round walking bomb with a lit fuse
  bomber: {
    palette: { o: OUT, b: '#33333f', d: '#22222c', y: '#ffd23e', r: '#ff5030', w: '#e8e8f0' },
    frames: anim(
      [
        '.....or.....',
        '.....oy.....',
        '....oooo....',
        '..oobbbboo..',
        '.obbbbbbbbo.',
        '.obwbbbbwbo.',
        'obbbbbbbbbbo',
        'obbbddbbbbbo',
        '.obbbbbbbbo.',
        '..oobbbboo..',
        '..odd..ddo..',
        '..oo....oo..',
      ],
      ['..odd..ddo..', '...oo..oo...'],
      ['.odd....ddo.', '.oo......oo.'],
    ),
  },
  // shieldbearer: squat warrior hiding behind a tower shield
  shieldbearer: {
    palette: { o: OUT, s: '#8894ac', w: '#c2ccdc', g: '#6faa5e', d: '#4d7c42', k: '#22181c' },
    frames: anim(
      [
        '....oooo....',
        '...oggggo...',
        '...okggko...',
        'ooooggggo...',
        'owwsoggggo..',
        'owssogggggo.',
        'owssogggggo.',
        'owssogggggo.',
        'owssoggggo..',
        'owwsoggggo..',
        'ooooogggo...',
        '..odd..ddo..',
        '..oo....oo..',
      ],
      ['..odd..ddo..', '...oo..oo...'],
      ['.odd....ddo.', '.oo......oo.'],
    ),
  },
  // summoner: hooded cultist with a glowing orb staff
  summoner: {
    palette: { o: OUT, p: '#5a3a80', d: '#40285e', s: '#d8c8b0', k: '#201028', g: '#b18cff' },
    frames: anim(
      [
        '.....oo.....',
        '....oppo....',
        '...oppppo..g',
        '..oppppppo.g',
        '.oskpskpso.o',
        '.osssssssoog',
        '..oppppppog.',
        '.oppppppppo.',
        '.odppppppdo.',
        'oodppppppdoo',
        '.oddddddddo.',
        '..odd..ddo..',
        '..oo....oo..',
      ],
      ['..odd..ddo..', '...oo..oo...'],
      ['.odd....ddo.', '.oo......oo.'],
    ),
  },
  // sprinter: a lean pouncing cat, frames [runA, runB]
  sprinter: {
    palette: { o: OUT, y: '#e0b040', d: '#a07828', k: '#22181c' },
    frames: anim(
      [
        '..........oo',
        '.oo....ooyyo',
        '..oo.oyyyyko',
        '...oyyyydyyo',
        '..oyyydyyyo.',
        '..oyyyyyyo..',
        '..oy..oy....',
        '..oo..oo....',
      ],
      ['...oy..oy...', '...oo..oo...'],
      ['.oy...oy....', '.oo...oo....'],
      ['....oy..oy..', '....oo..oo..'],
    ),
  },
  // wave-5 mid-boss: a crimson war-boar (tank silhouette, menacing palette)
  brute: {
    palette: { o: OUT, b: '#a04038', d: '#702820', l: '#c86050', k: '#241010', w: '#f0e0c8', p: '#e09090' },
    frames: anim(
      [
        '..oo....oo..',
        '.owwo..owwo.',
        '.owwoooowwo.',
        '.obbbbbbbbo.',
        'olbbbbbbbblo',
        'olbkbbbbkblo',
        'obbbbbbbbbbo',
        'obbppbbppbbo',
        'obbbddddbbbo',
        'obbbbbbbbbbo',
        '.obbbbbbbbo.',
        '.odd.oo.ddo.',
        '.odd....ddo.',
      ],
      ['.odd.oo.ddo.', '..dd.....dd.'],
      ['.odd.oo.ddo.', '.dd......dd.'],
      ['obbbbbbbbbbo', 'odd..oo..ddo', 'odd......ddo'],
    ),
  },
  // wave-15 boss: hooded reaper with glowing eyes, frames [idle, wide-eyes]
  reaper: {
    palette: { o: OUT, c: '#3a3348', d: '#262032', g: '#b18cff', k: '#14101c' },
    frames: [
      [
        '.......oooooo.......',
        '.....ooccccccoo.....',
        '....occcccccccco....',
        '...occcccccccccco...',
        '...occkgccccgkco....',
        '...occcccccccccco...',
        '..occcdcccccdccco...',
        '..occccccccccccco...',
        '..odcccccccccccdo...',
        '..odcccccccccccdo...',
        '.odcccccccccccccdo..',
        '.odcccccccccccccdo..',
        '.oddcccccccccccddo..',
        '..oddcccccccccddo...',
        '..od.dcccccccd.do...',
        '...o..odcccdo...o...',
        '.......oddo.........',
        '........oo..........',
      ],
      [
        '.......oooooo.......',
        '.....ooccccccoo.....',
        '....occcccccccco....',
        '...occcccccccccco...',
        '...occkgccccgkco....',
        '...occcccccccccco...',
        '..occcdcccccdccco...',
        '..occccccccccccco...',
        '..odcccccccccccdo...',
        '..odcccccccccccdo...',
        '.odcccccccccccccdo..',
        '.odcccccccccccccdo..',
        '.oddcccccccccccddo..',
        '..oddcccccccccddo...',
        '..od.dcccccccd.do...',
        '...o.odcccdo....o...',
        '......oddo..........',
        '.......oo...........',
      ],
      [
        '.......oooooo.......',
        '.....ooccccccoo.....',
        '....occcccccccco....',
        '...occcccccccccco...',
        '...occkgccccgkco....',
        '...occcccccccccco...',
        '..occcdcccccdccco...',
        '..occccccccccccco...',
        '..odcccccccccccdo...',
        '..odcccccccccccdo...',
        '.odcccccccccccccdo..',
        '.odcccccccccccccdo..',
        '.oddcccccccccccddo..',
        '..oddcccccccccddo...',
        '..od.dcccccccd.do...',
        '...o...odcccdo..o...',
        '........oddo........',
        '.........oo.........',
      ],
      [
        '.......oooooo.......',
        '.....ooccccccoo.....',
        '....occcccccccco....',
        '...occcccccccccco...',
        '...ockggccccggkco...',
        '...occcccccccccco...',
        '..occcdcccccdccco...',
        '..occccccccccccco...',
        '..odcccccccccccdo...',
        '..odcccccccccccdo...',
        '.odcccccccccccccdo..',
        '.odcccccccccccccdo..',
        '.oddcccccccccccddo..',
        '..oddcccccccccddo...',
        '..od.dcccccccd.do...',
        '...o..odcccdo...o...',
        '.......oddo.........',
        '........oo..........',
      ],
    ],
  },
  // wave-20 final boss: crowned violet demon overlord, frames [idle, roar]
  overlord: {
    palette: { o: OUT, r: '#8a2be0', d: '#5a1c98', l: '#a85af0', k: '#180c24', y: '#ffd23e', w: '#f0e8d8' },
    frames: [
      [
        '..oy..yy..yy..yo....',
        '..oyy.yy..yy.yyo....',
        '..oyyyyyyyyyyyyo....',
        '...orrrrrrrrrro.....',
        '..orrrrrrrrrrrro....',
        '.orlrrrrrrrrrlrro...',
        '.orkyyrrrrrrkyyro...',
        '.orkyyrrrrrrkyyro...',
        'oorrrrrrrrrrrrrroo..',
        'odrrrrkkkkkkrrrrdo..',
        'odrrrkwwwwwwkrrrdo..',
        'odrrkwkwwwwkwkrrdo..',
        '.odrkwwwwwwwwkrdo...',
        '.odrrkkkkkkkkrrdo...',
        '..odrrrrrrrrrrdo....',
        '..oddrrrrrrrrddo....',
        '...oddddddddddo.....',
        '....ooooooooo.......',
      ],
      [
        '..oy..yy..yy..yo....',
        '..oyy.yy..yy.yyo....',
        '..oyyyyyyyyyyyyo....',
        '...orrrrrrrrrro.....',
        '..orrrrrrrrrrrro....',
        '.orlrrrrrrrrrlrro...',
        '.orkyyrrrrrrkyyro...',
        '.orkyyrrrrrrkyyro...',
        'oorrrrrrrrrrrrrroo..',
        'odrrrrkkkkkkrrrrdo..',
        'odrrrkwwwwwwkrrrdo..',
        'odrrkwkwwwwkwkrrdo..',
        '.odrkwwwwwwwwkrdo...',
        '.odrrkkkkkkkkrrdo...',
        '.odrrrrrrrrrrdo.....',
        '.oddrrrrrrrrddo.....',
        '..oddddddddddo......',
        '...ooooooooo........',
      ],
      [
        '..oy..yy..yy..yo....',
        '..oyy.yy..yy.yyo....',
        '..oyyyyyyyyyyyyo....',
        '...orrrrrrrrrro.....',
        '..orrrrrrrrrrrro....',
        '.orlrrrrrrrrrlrro...',
        '.orkyyrrrrrrkyyro...',
        '.orkyyrrrrrrkyyro...',
        'oorrrrrrrrrrrrrroo..',
        'odrrrrkkkkkkrrrrdo..',
        'odrrrkwwwwwwkrrrdo..',
        'odrrkwkwwwwkwkrrdo..',
        '.odrkwwwwwwwwkrdo...',
        '.odrrkkkkkkkkrrdo...',
        '...odrrrrrrrrrrdo...',
        '...oddrrrrrrrrddo...',
        '....oddddddddddo....',
        '.....ooooooooo......',
      ],
      [
        '..oy..yy..yy..yo....',
        '..oyy.yy..yy.yyo....',
        '..oyyyyyyyyyyyyo....',
        '...orrrrrrrrrro.....',
        '..orrrrrrrrrrrro....',
        '.orlrrrrrrrrrlrro...',
        '.orkyyrrrrrrkyyro...',
        '.orkyyrrrrrrkyyro...',
        'oorrrrrrrrrrrrrroo..',
        'odrrrkkkkkkkkrrrdo..',
        'odrrkwwwwwwwwkrrdo..',
        'odrkwkwwwwwwkwkrdo..',
        '.odkwwwwwwwwwwkdo...',
        '.odrkkkkkkkkkkrdo...',
        '..odrrrrrrrrrrdo....',
        '..oddrrrrrrrrddo....',
        '...oddddddddddo.....',
        '....ooooooooo.......',
      ],
    ],
  },
  boss: {
    palette: { o: OUT, r: '#c43844', d: '#8e2430', l: '#e05a62', k: '#180c10', y: '#ffd23e', w: '#f0e8d8', h: '#5a2430' },
    frames: [
      [
        '..oo............oo..',
        '.ohho..........ohho.',
        '.ohho..........ohho.',
        '..ohhoooooooooohho..',
        '..orrrrrrrrrrrrrro..',
        '.orrrrrrrrrrrrrrrro.',
        '.orlrrrrrrrrrrrlrro.',
        '.orkyyrrrrrrrrkyyro.',
        '.orkyyrrrrrrrrkyyro.',
        'oorrrrrrrrrrrrrrrroo',
        'odrrrrrkkkkkkrrrrrdo',
        'odrrrrkwwwwwwkrrrrdo',
        'odrrrkwkwwwwkwkrrrdo',
        '.odrrkwwwwwwwwkrrdo.',
        '.odrrrkkkkkkkkrrrdo.',
        '..odrrrrrrrrrrrrdo..',
        '..oddrrrrrrrrrrddo..',
        '...oddddddddddddo...',
        '....ooooooooooo.....',
      ],
      [
        '..oo............oo..',
        '.ohho..........ohho.',
        '.ohho..........ohho.',
        '..ohhoooooooooohho..',
        '..orrrrrrrrrrrrrro..',
        '.orrrrrrrrrrrrrrrro.',
        '.orlrrrrrrrrrrrlrro.',
        '.orkyyrrrrrrrrkyyro.',
        '.orkyyrrrrrrrrkyyro.',
        'oorrrrrrrrrrrrrrrroo',
        'odrrrrrkkkkkkrrrrrdo',
        'odrrrrkwwwwwwkrrrrdo',
        'odrrrkwkwwwwkwkrrrdo',
        '.odrrkwwwwwwwwkrrdo.',
        '.odrrrkkkkkkkkrrrdo.',
        '.odrrrrrrrrrrrrdo...',
        '.oddrrrrrrrrrrddo...',
        '..oddddddddddddo....',
        '...ooooooooooo......',
      ],
      [
        '..oo............oo..',
        '.ohho..........ohho.',
        '.ohho..........ohho.',
        '..ohhoooooooooohho..',
        '..orrrrrrrrrrrrrro..',
        '.orrrrrrrrrrrrrrrro.',
        '.orlrrrrrrrrrrrlrro.',
        '.orkyyrrrrrrrrkyyro.',
        '.orkyyrrrrrrrrkyyro.',
        'oorrrrrrrrrrrrrrrroo',
        'odrrrrrkkkkkkrrrrrdo',
        'odrrrrkwwwwwwkrrrrdo',
        'odrrrkwkwwwwkwkrrrdo',
        '.odrrkwwwwwwwwkrrdo.',
        '.odrrrkkkkkkkkrrrdo.',
        '...odrrrrrrrrrrrrdo.',
        '...oddrrrrrrrrrrddo.',
        '....oddddddddddddo..',
        '.....ooooooooooo....',
      ],
      [
        '..oo............oo..',
        '.ohho..........ohho.',
        '.ohho..........ohho.',
        '..ohhoooooooooohho..',
        '..orrrrrrrrrrrrrro..',
        '.orrrrrrrrrrrrrrrro.',
        '.orlrrrrrrrrrrrlrro.',
        '.orkyyrrrrrrrrkyyro.',
        '.orkyyrrrrrrrrkyyro.',
        'oorrrrrrrrrrrrrrrroo',
        'odrrrrrrrrrrrrrrrrdo',
        'odrrrrkkkkkkkkrrrrdo',
        'odrrrkwwwwwwwwkrrrdo',
        '.odrrrkkkkkkkkrrrdo.',
        '.odrrrrrrrrrrrrrrdo.',
        '..odrrrrrrrrrrrrdo..',
        '..oddrrrrrrrrrrddo..',
        '...oddddddddddddo...',
        '....ooooooooooo.....',
      ],
    ],
  },
};

// evolved held weapons: same frames as the base weapon, swapped palette
SPRITES.w_deathsting = { frames: SPRITES.w_crossbow.frames, palette: { o: OUT, c: '#6a2a8a', s: '#e8c8ff', t: '#4a1a66' } };
SPRITES.w_annihilator = { frames: SPRITES.w_railgun.frames, palette: { o: OUT, c: '#e04040', w: '#ffd8a0', k: '#33334a' } };
SPRITES.w_hurricane = { frames: SPRITES.w_stormgun.frames, palette: { o: OUT, b: '#3a6a8a', d: '#c8f4ff', k: '#33334a' } };

/** Sprites whose LAST frame is an attack-telegraph pose, excluded from the walk cycle. */
const POSE_SPRITES = new Set(['brute', 'reaper', 'overlord', 'boss']);

/** Number of frames that belong to the walk cycle (total minus a reserved pose frame). */
export function walkFrames(name: string): number {
  const n = SPRITES[name]?.frames.length ?? 1;
  return POSE_SPRITES.has(name) ? Math.max(1, n - 1) : n;
}

const cache = new Map<string, HTMLCanvasElement>();

export interface BakeOpts {
  flip?: boolean;
  white?: boolean;
  frame?: number;
  /** flat color overlay baked over the sprite pixels (keep the tint set small — each grows the cache) */
  tint?: string;
  tintAlpha?: number;
}

/** Bakes a sprite frame scaled so its height ≈ targetH (integer pixel scale, min 1). */
export function bakeSprite(name: string, targetH: number, opts: BakeOpts = {}): HTMLCanvasElement {
  const def = SPRITES[name];
  if (!def) throw new Error(`unknown sprite ${name}`);
  const flip = opts.flip ?? false;
  const white = opts.white ?? false;
  const f = (opts.frame ?? 0) % def.frames.length;
  const key = `${name}|${targetH}|${flip ? 1 : 0}|${white ? 1 : 0}|${f}|${opts.tint ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const grid = def.frames[f];
  const rows = grid.length;
  const cols = Math.max(...grid.map((r) => r.length));
  const ps = Math.max(1, Math.round(targetH / rows));
  const c = document.createElement('canvas');
  c.width = cols * ps;
  c.height = rows * ps;
  const g = c.getContext('2d')!;
  for (let y = 0; y < rows; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const color = def.palette[ch];
      if (!color) continue;
      g.fillStyle = white ? '#ffffff' : color;
      const px = flip ? cols - 1 - x : x;
      g.fillRect(px * ps, y * ps, ps, ps);
    }
  }
  if (opts.tint && !white) {
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = opts.tintAlpha ?? 0.45;
    g.fillStyle = opts.tint;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
  cache.set(key, c);
  return c;
}

export function frameCount(name: string): number {
  return SPRITES[name]?.frames.length ?? 1;
}

export interface DrawSpriteOpts {
  flip?: boolean;
  white?: boolean;
  /** vertical squash-and-stretch, 0 = none */
  squash?: number;
  alpha?: number;
  frame?: number;
  /** radians, rotates around the sprite center */
  rotate?: number;
  /** uniform extra scale (spawn/death animations) */
  scale?: number;
  /** horizontal-only extra scale, multiplies with scale (stretch effects) */
  scaleX?: number;
  /** baked flat-color overlay (elite gold etc.) */
  tint?: string;
  tintAlpha?: number;
}

/** Draws sprite centered at (x, y) with height ≈ h. */
export function drawSprite(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, h: number, opts: DrawSpriteOpts = {}): void {
  const img = bakeSprite(name, h, { flip: opts.flip, white: opts.white, frame: opts.frame, tint: opts.tint, tintAlpha: opts.tintAlpha });
  const sq = opts.squash ?? 0;
  const sc = opts.scale ?? 1;
  const w = img.width * (1 - sq * 0.6) * sc * (opts.scaleX ?? 1);
  const hh = img.height * (1 + sq) * sc;
  const needsTransform = opts.rotate !== undefined;
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (needsTransform) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(opts.rotate!);
    ctx.drawImage(img, -w / 2, -hh / 2, w, hh);
    ctx.restore();
  } else {
    ctx.drawImage(img, x - w / 2, y - hh / 2, w, hh);
  }
  if (opts.alpha !== undefined) ctx.globalAlpha = 1;
}

export function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y, w / 2, w / 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Dev-time sanity check: consistent row widths and known palette chars, across all frames. */
export function validateSprites(): string[] {
  const problems: string[] = [];
  for (const [name, def] of Object.entries(SPRITES)) {
    const h = def.frames[0].length;
    const w = def.frames[0][0].length;
    def.frames.forEach((grid, fi) => {
      if (grid.length !== h) problems.push(`${name}[${fi}]: ${grid.length} rows != ${h}`);
      grid.forEach((row, i) => {
        if (row.length !== w) problems.push(`${name}[${fi}]: row ${i} width ${row.length} != ${w}`);
        for (const ch of row) {
          if (ch !== '.' && ch !== ' ' && !def.palette[ch]) problems.push(`${name}[${fi}]: row ${i} unknown char "${ch}"`);
        }
      });
    });
  }
  return problems;
}
