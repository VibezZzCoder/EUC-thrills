/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * The held paused view's wiring in `Game.ts` — performance pass 2026-10-17
 * (idle-audio A; the cross-design critique's E3).
 *
 * `Game.ts` cannot be imported headlessly (invariant 1's other half: it owns
 * the DOM and three), so this is a source census in the style of
 * `data/liveTuning.test.ts` and `app/couch.test.ts`. A held picture goes stale
 * only if something changes it without releasing the hold, and the census is
 * the guard on every door:
 *
 *  1. **The choke points.** Tuning, options, state, pose, camera, step,
 *     visibility, reduced-motion, context restore and layout each invalidate.
 *  2. **The held branch** sits after every CPU-side side effect of `render`
 *     and before the only GPU submission, and its predicate keeps every
 *     exclusion the design names.
 *  3. **The QA bridge.** Every public member of `Game` is classified: it
 *     reads, it is neutral (audio, profiler, DOM overlays, input that only a
 *     step consumes, boot/teardown), it forces its own draw, or its body's
 *     **first statement** is `this.pausedView.invalidate(…)` — unconditional,
 *     with no `if`, block, early return or write before it. A new public member
 *     fails here until it is classified — the census the critique asked for,
 *     so a new presentation writer cannot bypass the gate silently. "Public"
 *     is every declaration form the class allows (the `public` keyword,
 *     `static`/`async`/`override`, generators, accessors, arrow and function
 *     fields typed or not, one-liners); a public field typed as a function,
 *     whose body lives elsewhere, must be classified too. A **read** must be
 *     read-only all the way down: no write, no invalidation, no call into a
 *     public non-read, every private helper it reaches read-only in turn, and
 *     no mutator-named method (`set…`, `apply…`, `push`, …) called on one of
 *     Game's objects. The few exceptions are listed with their reasons.
 *
 * Every check is a pure function of the source text, and the last tests run
 * them against deliberately broken copies (negative controls).
 *
 * Out of the census, by design: writes made straight to an exposed object
 * (`game.renderer.*`, `game.targets`) while paused. A spec that does that
 * draws for itself (`renderer.render()`) or calls `advance(0)`. Also out of
 * reach of a source census: writes through a local alias or a callback
 * parameter (`const r = this.renderer; r.x = 1`, `seats.map((s) => s.rig.apply())`),
 * and a mutator whose name is not a mutator verb.
 */

const GAME_SOURCE = readFileSync(new URL('./Game.ts', import.meta.url), 'utf8');

/** Public members that answer a question and write no field (checked below). */
const READ = new Set([
  'controller', 'launchPadState', 'populationState', 'barkState', 'pausedViewState', 'buildLevel',
  'seatCount', 'sampleGround', 'snapshot', 'snapshotFor', 'optionsPersist', 'copController', 'copBrain',
  'copCurrent', 'copPaddle', 'chaseAvailable', 'paddleEquipped', 'paddleEquippedFor', 'couchSession',
  'raceFrozen', 'matchFrozen', 'startFrozen', 'chaseFrozen', 'contactLive', 'audioSnapshot', 'audioLevel',
  'audioSpectrum', 'resources', 'profile', 'claimedDevices',
]);

/** Public members that write, but nothing a paused frame draws — and why. */
const NEUTRAL = new Map<string, string>([
  ['create', 'boot: builds the game before any frame'],
  ['start', 'boot: hands over to the loop at the title (not a paused state)'],
  ['setLoadingScreen', 'boot wiring; the cover itself makes frames non-holdable while busy'],
  ['preloadOptionalAudio', 'audio'],
  ['setActionsFor', 'input: read only by a step, and every step invalidates'],
  ['setActions', 'input: read only by a step, and every step invalidates'],
  ['clearActions', 'input: read only by a step, and every step invalidates'],
  ['armAudio', 'audio'],
  ['setVolumes', 'audio'],
  ['setMuted', 'audio'],
  ['profileBegin', 'profiler'],
  ['setOverlayVisible', 'DOM overlay (F3)'],
  ['setTuningPanelVisible', 'DOM panel (F4); its sliders write through applyTuning'],
  ['dispose', 'teardown: the loop stops and nothing draws again'],
]);

/** Public members that draw their own synthetic frame (never holdable). */
const FORCED = new Map<string, string>([
  ['prepareFirstFrame', 'this.render(0, true)'],
]);

/** Public writers whose invalidation comes after their own synthetic draw, on purpose. */
const INVALIDATES_AFTER_DRAW = new Map<string, string>([
  ['advance', 'the synthetic draw always submits; the invalidation after it is ordered by the choke-point census'],
]);

/** Private helpers a read may reach that write only state no frame draws — and why. */
const READ_HELPER_WRITES = new Map<string, string>([
  ['refreshRoomPanes', 'chase-return bookkeeping (panes, widestPaneHalfAngle): never drawn, and every return calls refreshPane before it judges, so a snapshot\'s refresh is overwritten before any use'],
]);

/** Methods on Game's objects that a read may call although the name starts with a mutator verb. */
const READ_CALLS = new Map<string, string>([
  ['claimList', 'InputRouter: a copy of the seat claims'],
]);

/** Private choke points that must invalidate, with the reason they pass. */
const CHOKE_POINTS = new Map<string, string>([
  ['applyTuning', "invalidate('tuning')"],
  ['applyOptions', "invalidate('options')"],
  ['enterState', "invalidate('state')"],
  ['syncSeatPose', "invalidate('pose')"],
  ['syncCamera', "invalidate('pose')"],
  ['step', "invalidate('step')"],
  ['onReducedMotionChange', "invalidate('reduced-motion')"],
  ['onVisibilityChange', "if (!hidden) this.pausedView.invalidate('visible')"],
  ['handleContextRestored', "invalidate('context')"],
  ['advance', "invalidate('advance')"],
  ['beforeFrame', "if (change.layoutChanged) this.pausedView.invalidate('layout')"],
]);

/** Every term of the holdable predicate and of the frame description. */
const PREDICATE_TERMS = [
  '!synthetic',
  "this.appState.current === 'paused'",
  '!this.loop.isRunning()',
  '!this.contextLost',
  '!this.pageHidden',
  'this.loadingScreen?.busy !== true',
  '!this.finishLoadingAfterPoll',
  'this.pendingQuality === null',
  'this.qualitySettleFrames === 0',
  'this.pendingSessionState === null',
  'this.sessionSettleFrames === 0',
  'this.pendingWorldSwap === null',
  'this.worldSettleFrames === 0',
  'this.pendingRoute === null',
  "this.renderer.effectiveTier() !== 'ultra'",
  '!this.renderer.perfQuadArmed',
  // Review repair (2026-10-18): a rig still easing a call-counted channel.
  '!this.anyRigSettling()',
  'frame.bufferWidth = three.domElement.width',
  'frame.bufferHeight = three.domElement.height',
  'frame.pixelRatio = three.getPixelRatio()',
  'frame.views = this.renderer.viewCount',
  'frame.seats = this.seats.length',
  'this.levelPlan !== this.pausedViewPlan',
  'this.population !== this.pausedViewPopulation',
  'this.options.current !== this.pausedViewOptions',
  'return this.pausedView.admit(frame)',
];

/**
 * One member of `Game`, from its first line at class indentation. `kind` is
 * what the census can read: a method or accessor body, a function-valued field
 * (an arrow or function expression, typed or not), or a data field.
 */
interface Member {
  readonly name: string;
  readonly line: number;
  readonly body: string;
  readonly isPublic: boolean;
  readonly kind: 'method' | 'accessor' | 'function' | 'field';
  /** A data field whose declared type is a function: its body is assigned elsewhere, out of the census's sight. */
  readonly functionTyped: boolean;
}

function classBounds(source: string): { lines: string[]; start: number; end: number } {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line.startsWith('export class Game {'));
  assert.ok(start >= 0, 'Game.ts no longer declares `export class Game {`');
  const end = lines.findIndex((line, index) => index > start && line === '}');
  assert.ok(end > start, 'the Game class has no closing brace at column 0');
  return { lines, start, end };
}

/** Index of the bracket closing the one at `open` (round, square, curly; quoted text skipped), or -1 if not on this text. */
function closingBracket(text: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const stack: string[] = [];
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === "'" || char === '"' || char === '`') {
      const close = text.indexOf(char, index + 1);
      if (close < 0) return -1;
      index = close;
    } else if (char in pairs) stack.push(pairs[char]);
    else if (char === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return index;
    }
  }
  return -1;
}

/** Round, square and curly brackets balance on this line (quoted text skipped). */
function balanced(line: string): boolean {
  let depth = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "'" || char === '"' || char === '`') {
      const close = line.indexOf(char, index + 1);
      if (close < 0) return false;
      index = close;
    } else if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
  }
  return depth === 0;
}

/**
 * The member starting at `index`: one line when its brackets balance and it
 * ends there (`;` or `}`), else up to the class-indent closer that ends it
 * (`  }`, `  };`, `  ];`, `  }));` …), or up to the next line at class
 * indentation, whichever comes first — so a one-line arrow field without a
 * brace never swallows the members after it.
 */
function bodyAt(lines: string[], index: number, end: number): string {
  const first = lines[index];
  if (balanced(first) && /[;}]\s*$/.test(first)) return first;
  for (let k = index + 1; k < end; k += 1) {
    if (/^ {2}[}\])]+;?\s*$/.test(lines[k])) return lines.slice(index, k + 1).join('\n');
    if (/^ {2}[^\s})\]]/.test(lines[k])) return lines.slice(index, k).join('\n');
  }
  throw new Error(`no end found for the member at Game.ts:${index + 1}`);
}

const MEMBER_HEAD = /^ {2}((?:(?:public|private|protected|static|async|readonly|override|declare|abstract|accessor)\s+)*)(?:(get|set)\s+(?=[#*A-Za-z_$]))?(?:\*\s*)?(#?[A-Za-z_$][\w$]*)\s*[?!]?\s*(.*)$/;

/** Whether a field initializer is a function: `function`, `x =>`, `(…) =>`, `<T>(…) =>`, each optionally async. */
function functionInitializer(text: string): boolean {
  const init = text.replace(/^\s*(?:async\s+)?/, '');
  if (/^function\b/.test(init) || /^[A-Za-z_$][\w$]*\s*=>/.test(init)) return true;
  const open = init.startsWith('<') ? init.indexOf('(') : init.startsWith('(') ? 0 : -1;
  if (open < 0) return false;
  const close = closingBracket(init, open);
  // A parameter list running past this line: only a function opens one here.
  if (close < 0) return true;
  return /^\s*(?::[^;]*?)?=>/.test(init.slice(close + 1));
}

/** A typed field's declared type and initializer: split at the first top-level `=` (not `=>`, `==`). */
function typedField(text: string): { type: string; initializer: string | null } {
  let depth = 0;
  for (let index = 1; index < text.length; index += 1) {
    const char = text[index], next = text[index + 1];
    if (char === '=' && next === '>') { index += 1; continue; }
    if ('([{<'.includes(char)) depth += 1;
    else if (')]}>'.includes(char)) depth -= 1;
    else if (char === '=' && depth === 0 && next !== '=') return { type: text.slice(1, index), initializer: text.slice(index + 1) };
    else if (char === ';' && depth === 0) return { type: text.slice(1, index), initializer: null };
  }
  return { type: text.slice(1), initializer: null };
}

/** Every member of `Game` — public and private, methods, accessors, function fields and data fields. */
function members(source: string): Member[] {
  const { lines, start, end } = classBounds(source);
  const out: Member[] = [];
  for (let index = start + 1; index < end; index += 1) {
    const match = MEMBER_HEAD.exec(lines[index]);
    if (match === null || match[3] === 'constructor') continue;
    const [, modifiers, accessor, name, rest] = match;
    const isPublic = !/\b(?:private|protected)\b/.test(modifiers) && !name.startsWith('#');
    let kind: Member['kind'];
    let functionTyped = false;
    if (rest.startsWith('(') || rest.startsWith('<')) kind = accessor === undefined ? 'method' : 'accessor';
    else if (accessor !== undefined) continue;
    else if (rest.startsWith('=') && !rest.startsWith('==')) kind = functionInitializer(rest.slice(1)) ? 'function' : 'field';
    else if (rest.startsWith(':')) {
      const { type, initializer } = typedField(rest);
      kind = initializer !== null && functionInitializer(initializer) ? 'function' : 'field';
      functionTyped = kind === 'field' && type.includes('=>');
    } else if (rest.startsWith(';') || rest === '') kind = 'field';
    else continue;
    const body = bodyAt(lines, index, end);
    // A bodiless overload signature writes nothing; its implementation follows.
    if (kind === 'method' && !body.includes('{') && /\)\s*(?::[^;{]*)?;\s*$/.test(body)) continue;
    out.push({ name, line: index + 1, body, isPublic, kind, functionTyped });
  }
  return out;
}

/** Every public method, accessor and function-valued field of `Game` (data fields stay out: see the header). */
function publicMembers(source: string): Member[] {
  return members(source).filter((member) => member.isPublic && (member.kind !== 'field' || member.functionTyped));
}

/** One named member of `Game`, public or private, method, accessor or function field. */
function memberBody(source: string, name: string): string | null {
  return members(source).find((member) => member.name === name && member.kind !== 'field')?.body ?? null;
}

const INVALIDATES = 'this.pausedView.invalidate(';

/** Census 1: the private choke points. */
function chokePointProblems(source: string): string[] {
  const problems: string[] = [];
  for (const [name, needle] of CHOKE_POINTS) {
    const body = memberBody(source, name);
    if (body === null) { problems.push(`${name}: not found in Game.ts`); continue; }
    if (!body.includes(needle)) problems.push(`${name}: must call ${needle}`);
  }
  const frame = memberBody(source, 'beforeFrame');
  if (frame !== null) {
    const invalidate = frame.indexOf("if (change.layoutChanged) this.pausedView.invalidate('layout')");
    const early = frame.indexOf('if (!change.layoutChanged) return;');
    if (early < 0) problems.push('beforeFrame: the layout early return moved; re-check E3');
    else if (invalidate < 0 || invalidate > early) problems.push('beforeFrame: the layout invalidation must come before the early return (E3)');
  }
  const advance = memberBody(source, 'advance');
  if (advance !== null && advance.indexOf(INVALIDATES) < advance.indexOf('this.loop.advance(steps)')) {
    problems.push('advance: invalidate after the synthetic draw, not before it');
  }
  return problems;
}

/** Census 2: the held branch and its predicate. */
function heldBranchProblems(source: string): string[] {
  const problems: string[] = [];
  const render = memberBody(source, 'render');
  if (render === null) return ['render: not found'];
  if (!/private readonly render = \(alpha: number, synthetic = false\): void =>/.test(render)) {
    problems.push('render: the arrow must take (alpha, synthetic = false) from the loop');
  }
  const barks = render.indexOf('this.updateBarks(');
  const held = render.indexOf('if (!this.admitPausedView(synthetic)) {');
  const begin = render.indexOf('this.renderer.beginFrame();');
  const views = render.indexOf('this.renderer.renderView(view);');
  if (held < 0) problems.push('render: the held branch is missing');
  if (barks < 0 || held < barks) problems.push('render: the held branch must follow every CPU-side side effect (after updateBarks)');
  if (begin < 0 || held > begin) problems.push('render: the held branch must come before beginFrame');
  if (views < 0 || views < begin) problems.push('render: renderView must stay inside the drawn branch');
  if (held >= 0) {
    const branch = render.slice(held, render.indexOf('return;', held) + 'return;'.length);
    if (!branch.includes('this.presentBarks(view)')) problems.push('render: a held frame must still re-project the barks');
  }
  const submissions = source.split('this.renderer.beginFrame()').length - 1;
  if (submissions !== 1) problems.push(`Game.ts: ${submissions} beginFrame calls; the held branch guards exactly one`);
  const admit = memberBody(source, 'admitPausedView');
  if (admit === null) problems.push('admitPausedView: not found');
  else for (const term of PREDICATE_TERMS) if (!admit.includes(term)) problems.push(`admitPausedView: missing ${term}`);
  if (!source.includes('new PausedViewGate(RENDER.pausedViewSettleFrames)')) {
    problems.push('the gate must be built from RENDER.pausedViewSettleFrames');
  }
  // The rig term asks every seat's rig and the shown pack (review repair,
  // 2026-10-18): a Knockabout pause puts the paddle down over twelve calls.
  const rigs = memberBody(source, 'anyRigSettling');
  if (rigs === null) problems.push('anyRigSettling: not found');
  else {
    if (!/for \(let index = 0; index < this\.seats\.length; index \+= 1\)/.test(rigs)) {
      problems.push('anyRigSettling: must loop over every seat (allocation-free)');
    }
    if (!rigs.includes('this.seats[index].rig.settling')) problems.push('anyRigSettling: must ask each seat rig');
    if (!rigs.includes('this.renderer.packSettling')) problems.push('anyRigSettling: must ask the shown pack');
  }
  const forced = memberBody(source, 'prepareFirstFrame');
  if (forced === null || !forced.includes(FORCED.get('prepareFirstFrame')!)) {
    problems.push('prepareFirstFrame: must draw a forced (synthetic) frame');
  }
  return problems;
}

/** The first statement of a bridge writer: unconditional, at the body's top level. */
const FIRST_INVALIDATION = /^ {4}this\.pausedView\.invalidate\('[\w-]+'\);\s*$/;

/**
 * Whether the member's body opens with an unconditional invalidation — its
 * first statement, at the body's own indentation, so no `if`, block, early
 * return or earlier write can come before it.
 */
function invalidatesFirst(body: string): boolean {
  const lines = body.split('\n');
  if (lines.length === 1) {
    return /(?:\)|=>)\s*(?::\s*[^{=]+)?\{\s*this\.pausedView\.invalidate\('[\w-]+'\);/.test(lines[0]);
  }
  const open = lines.findIndex((line) => /^ {2}\S/.test(line) && /\{\s*$/.test(line));
  if (open < 0) return false;
  for (let k = open + 1; k < lines.length; k += 1) {
    const line = lines[k].trim();
    if (line === '' || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;
    return FIRST_INVALIDATION.test(lines[k]);
  }
  return false;
}

/** Direct writes: any assignment operator, `++`/`--` either side, or `delete`, on a `this.` path. */
const WRITE = /\bthis(?:\??\.[#\w$]+|\[[^\]]*\])+\s*(?:(?:[-+*/%&|^]|\*\*|<<|>>>?|&&|\|\||\?\?)?=(?![=>])|\+\+|--)|(?:\+\+|--)\s*this\.|\bdelete\s+this\./g;
/** Every `this.` chain, and whether it is called. */
const REFERENCE = /\bthis((?:\??\.[#\w$]+|\[[^\]]*\])+)(\s*(?:\?\.)?\()?/g;
/**
 * Method names that change their receiver — called on one of Game's objects
 * from a read, they are a write the assignment scan cannot see. A list of verbs
 * is a net, not a proof: a read that must call one of these is not a read.
 */
const MUTATOR = /^(?:set|reset|apply|place|spawn|despawn|push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin|clear|add|remove|delete|invalidate|sync|update|start|stop|end|enter|exit|install|uninstall|dispose|swap|arm|disarm|begin|record|write|mark|toggle|show|hide|load|unload|attach|detach|release|claim|unclaim|play|pause|resume|mute|unmute|step|advance|render|draw|present|prepare|restore|trim|demote|promote|rebuild|flush|emit|assign|enable|disable|open|close|focus|select|move|rotate|translate|lookAt|copy|normalize|multiply|premultiply|compose|decompose)(?=[A-Z0-9_]|$)/;

/**
 * Why `body` is not read-only, following every call into another Game member:
 * a private helper must itself be read-only (recursively), a public one must be
 * a READ (checked on its own), and a method called on one of Game's objects
 * must not be a mutator.
 */
function readOnlyProblems(label: string, body: string, table: ReadonlyMap<string, readonly Member[]>, seen: Set<string>): string[] {
  const problems: string[] = [];
  if (body.includes(INVALIDATES)) problems.push(`${label}: invalidates`);
  const writes = body.match(WRITE);
  if (writes !== null) problems.push(`${label}: writes ${writes.join(', ')}`);
  for (const [, chain, called] of body.matchAll(REFERENCE)) {
    const names = chain.match(/[#\w$]+(?=\??\.|\[|$)|(?<=\.)[#\w$]+/g) ?? [];
    const first = names[0];
    if (first === undefined) continue;
    const targets = (table.get(first) ?? []).filter((member) => member.kind !== 'field');
    if (targets.length > 0) {
      if (READ.has(first)) continue;
      if (targets.some((member) => member.isPublic)) {
        problems.push(`${label}: uses ${first}, which is not a read`);
        continue;
      }
      if (seen.has(first) || READ_HELPER_WRITES.has(first)) continue;
      seen.add(first);
      for (const target of targets) problems.push(...readOnlyProblems(`${label} → ${first}`, target.body, table, seen));
      continue;
    }
    const method = names[names.length - 1];
    if (called !== undefined && names.length > 1 && MUTATOR.test(method) && !READ_CALLS.has(method)) {
      problems.push(`${label}: calls this${chain}()`);
    }
  }
  return problems;
}

/** Census 3: every public member of Game is classified. */
function bridgeProblems(source: string): string[] {
  const problems: string[] = [];
  const all = members(source);
  const table = new Map<string, Member[]>();
  for (const member of all) table.set(member.name, [...(table.get(member.name) ?? []), member]);
  const seen = new Set<string>();
  for (const member of publicMembers(source)) {
    seen.add(member.name);
    const lists = [READ.has(member.name), NEUTRAL.has(member.name), FORCED.has(member.name)].filter(Boolean).length;
    if (lists > 1) problems.push(`${member.name}: classified twice`);
    const at = `${member.name} (Game.ts:${member.line})`;
    if (member.functionTyped) {
      if (!NEUTRAL.has(member.name) && !FORCED.has(member.name)) {
        problems.push(`${at}: a public function-typed field the census cannot read; declare it as a method or an arrow field, or classify it with the reason`);
      }
      continue;
    }
    if (READ.has(member.name)) {
      for (const problem of readOnlyProblems(at, member.body, table, new Set([member.name]))) {
        problems.push(`${problem} — listed as a read; move it out of READ`);
      }
      continue;
    }
    if (NEUTRAL.has(member.name) || FORCED.has(member.name)) continue;
    if (!member.body.includes(INVALIDATES)) {
      problems.push(
        `${at}: a public Game member that neither reads nor invalidates. `
        + 'If it can change what a paused frame draws, call this.pausedView.invalidate(\'bridge\') first; '
        + 'otherwise classify it in pausedViewWiring.test.ts with the reason.',
      );
    } else if (!invalidatesFirst(member.body) && !INVALIDATES_AFTER_DRAW.has(member.name)) {
      problems.push(`${at}: its invalidation must be the body's first statement, unconditional (no if, block, early return or write before it)`);
    }
  }
  for (const name of [...READ, ...NEUTRAL.keys(), ...FORCED.keys(), ...INVALIDATES_AFTER_DRAW.keys()]) {
    if (!seen.has(name)) problems.push(`${name}: classified here but no longer a public Game member — drop it`);
  }
  for (const name of READ_HELPER_WRITES.keys()) {
    if (!(table.get(name) ?? []).some((member) => !member.isPublic && member.kind !== 'field')) {
      problems.push(`${name}: listed as a read helper's write but no longer a private Game member — drop it`);
    }
  }
  return problems;
}

test('the census reads the class it means to: dozens of public members, each with a body', () => {
  const members = publicMembers(GAME_SOURCE);
  assert.ok(members.length >= 70, `${members.length} public members is not the QA bridge`);
  for (const name of ['advance', 'placeRider', 'setOptions', 'spawnRider', 'snapshot', 'pausedViewState']) {
    assert.ok(members.some((member) => member.name === name), `${name} was not found`);
  }
  // Private members never enter the census.
  assert.ok(!members.some((member) => member.name === 'applyTuning' || member.name === 'render'));
});

test('every choke point that can change the paused picture invalidates the held view', () => {
  assert.deepEqual(chokePointProblems(GAME_SOURCE), []);
});

test('the held branch follows every CPU-side side effect, guards the only submission, and keeps every exclusion', () => {
  assert.deepEqual(heldBranchProblems(GAME_SOURCE), []);
});

test('every public Game member (the QA bridge) reads, is neutral, forces a draw, or invalidates', () => {
  assert.deepEqual(bridgeProblems(GAME_SOURCE), []);
});

// --- Negative controls: each census fails on a copy with one door removed. --

function without(source: string, needle: string): string {
  assert.equal(source.split(needle).length - 1 >= 1, true, `the control's needle is gone: ${needle}`);
  return source.replace(needle, '');
}

test('negative control: removing any one choke-point invalidation fails the census', () => {
  // Removed inside the named member only: the same call can appear elsewhere
  // (the identity checks in `admitPausedView` also invalidate 'options').
  for (const [name, needle] of CHOKE_POINTS) {
    const body = memberBody(GAME_SOURCE, name)!;
    const call = needle.startsWith('if (') ? needle : `this.pausedView.${needle}`;
    assert.ok(body.includes(call), `the control's needle is gone from ${name}: ${call}`);
    const broken = GAME_SOURCE.replace(body, body.replace(call, ''));
    assert.notEqual(broken, GAME_SOURCE);
    assert.notDeepEqual(chokePointProblems(broken), [], `undetected: ${name} without ${call}`);
  }
});

test('negative control: the layout invalidation after the early return is caught (E3)', () => {
  const moved = GAME_SOURCE.replace(
    "    if (change.layoutChanged) this.pausedView.invalidate('layout');\n    if (!change.layoutChanged) return;\n",
    "    if (!change.layoutChanged) return;\n    if (change.layoutChanged) this.pausedView.invalidate('layout');\n",
  );
  assert.notEqual(moved, GAME_SOURCE, 'the control could not move the line');
  assert.notDeepEqual(chokePointProblems(moved), []);
});

test('negative control: a held branch after beginFrame, or a predicate missing a term, is caught', () => {
  const render = memberBody(GAME_SOURCE, 'render')!;
  const branchStart = render.indexOf('    if (!this.admitPausedView(synthetic)) {');
  const branchEnd = render.indexOf('    }\n', branchStart) + '    }\n'.length;
  const branch = render.slice(branchStart, branchEnd);
  const late = render.replace(branch, '').replace(
    '    this.renderer.beginFrame();\n',
    `    this.renderer.beginFrame();\n${branch}`,
  );
  assert.notDeepEqual(heldBranchProblems(GAME_SOURCE.replace(render, late)), [], 'a branch after beginFrame went undetected');
  for (const term of [
    "\n      && this.renderer.effectiveTier() !== 'ultra' && !this.renderer.perfQuadArmed",
    '!synthetic && ',
    '\n      && !this.anyRigSettling()',
  ]) {
    assert.notDeepEqual(heldBranchProblems(without(GAME_SOURCE, term)), [], `undetected predicate loss: ${term.trim()}`);
  }
  // The rig term's body: dropping the pack, or one seat's question, is caught.
  for (const term of ['    return this.renderer.packSettling;\n', 'this.seats[index].rig.settling']) {
    const body = memberBody(GAME_SOURCE, 'anyRigSettling')!;
    assert.ok(body.includes(term), `the control's needle is gone from anyRigSettling: ${term.trim()}`);
    const broken = GAME_SOURCE.replace(body, body.replace(term, term.startsWith('    return') ? '    return false;\n' : 'false'));
    assert.notDeepEqual(heldBranchProblems(broken), [], `undetected rig-term loss: ${term.trim()}`);
  }
});

test('negative control: a bridge writer without an invalidation, a new unclassified member, or a writing "read" is caught', () => {
  // 1. An existing writer loses its invalidation.
  const occlusion = memberBody(GAME_SOURCE, 'setOcclusion')!;
  const silent = GAME_SOURCE.replace(occlusion, occlusion.replace("this.pausedView.invalidate('bridge');", ''));
  assert.ok(bridgeProblems(silent).some((problem) => problem.startsWith('setOcclusion')), 'setOcclusion went undetected');
  // 2. A new public presentation writer nobody classified.
  const added = GAME_SOURCE.replace(
    '  pausedViewState(): PausedViewStats {',
    '  setSkyTint(tint: number): void {\n    this.skyTint = tint;\n  }\n\n  pausedViewState(): PausedViewStats {',
  );
  assert.ok(bridgeProblems(added).some((problem) => problem.startsWith('setSkyTint')), 'a new writer went undetected');
  // 3. A member listed as a read that starts writing.
  const snapshot = memberBody(GAME_SOURCE, 'snapshot')!;
  const writing = GAME_SOURCE.replace(snapshot, snapshot.replace('{\n', '{\n    this.layoutChanges += 1;\n'));
  assert.ok(bridgeProblems(writing).some((problem) => problem.startsWith('snapshot')), 'a writing read went undetected');
  // 4. A classified name that no longer exists (a stale list) is reported.
  const renamed = GAME_SOURCE.replace('  setMuted(muted: boolean): void {', '  setSilenced(muted: boolean): void {');
  const problems = bridgeProblems(renamed);
  assert.ok(problems.some((problem) => problem.startsWith('setMuted')), 'a stale classification went unreported');
  assert.ok(problems.some((problem) => problem.startsWith('setSilenced')), 'the renamed member went unclassified');
});

test('negative control: the bypasses a reviewer found — public keyword, typed or one-line arrow fields, conditional invalidation, writes through calls in a read — are caught', () => {
  const caught = (source: string, name: string, why: string): void => {
    assert.ok(bridgeProblems(source).some((problem) => problem.startsWith(name)), `undetected: ${why}`);
  };
  const before = (anchor: string, inserted: string): string => {
    assert.equal(GAME_SOURCE.split(anchor).length - 1, 1, `the control's anchor is not unique: ${anchor.trim()}`);
    return GAME_SOURCE.replace(anchor, `${inserted}${anchor}`);
  };
  const OCCLUSION = '  setOcclusion(distance: number | null): void {\n';
  // 1. New presentation writers in every declaration form the class allows.
  // Each is inserted just before a writer that does invalidate, so a body that
  // ran on into the next member would wrongly pass.
  const forms: [string, string][] = [
    ['public keyword', '  public setSkyTint(tint: number): void {\n    this.skyTint = tint;\n  }\n\n'],
    ['public static async', '  public static async setSkyTint(game: Game): Promise<void> {\n    game.skyTint = 1;\n  }\n\n'],
    ['override modifier', '  override setSkyTint(tint: number): void {\n    this.skyTint = tint;\n  }\n\n'],
    ['generator method', '  *setSkyTint(): Generator<number> {\n    yield (this.skyTint = 1);\n  }\n\n'],
    ['typed arrow field', '  readonly setSkyTint: (tint: number) => void = (tint) => {\n    this.skyTint = tint;\n  };\n\n'],
    ['typed arrow field, generic type', '  setSkyTint: Setter<number> = (tint: number): void => {\n    this.skyTint = tint;\n  };\n\n'],
    ['async arrow without parentheses', '  setSkyTint = async tint => {\n    this.skyTint = tint;\n  };\n\n'],
    ['function expression field', '  setSkyTint = function (this: Game, tint: number): void {\n    this.skyTint = tint;\n  };\n\n'],
    ['one-line arrow field without braces', '  readonly setSkyTint = (tint: number): void => this.applySkyTint(tint);\n'],
    ['one-line method', '  setSkyTint(tint: number): void { this.skyTint = tint; }\n'],
    ['function-typed field assigned elsewhere', '  readonly setSkyTint: (tint: number) => void;\n'],
  ];
  for (const [form, inserted] of forms) caught(before(OCCLUSION, inserted), 'setSkyTint', form);
  // ... while a new one-line read, or a writer that invalidates first, passes.
  const cleanRead = before(OCCLUSION, '  readonly skyTintValue = (): number => this.skyTint;\n');
  assert.ok(bridgeProblems(cleanRead).some((problem) => problem.startsWith('skyTintValue')), 'an unclassified read is still reported');
  assert.ok(!bridgeProblems(cleanRead).some((problem) => problem.startsWith('setOcclusion')), 'the next member was misread');
  const goodWriter = before(OCCLUSION, "  setSkyTint = (tint: number): void => {\n    this.pausedView.invalidate('bridge');\n    this.skyTint = tint;\n  };\n\n");
  assert.deepEqual(bridgeProblems(goodWriter), [], 'a writer that invalidates first is accepted in arrow form');

  // 2. A conditional, nested or late invalidation is not an invalidation.
  const occlusion = memberBody(GAME_SOURCE, 'setOcclusion')!;
  const first = "    this.pausedView.invalidate('bridge');\n";
  assert.ok(occlusion.includes(first));
  const variants: [string, string][] = [
    ['an if guard', "    if (distance !== null) this.pausedView.invalidate('bridge');\n"],
    ['a block', "    if (distance !== null) {\n      this.pausedView.invalidate('bridge');\n    }\n"],
    ['a short-circuit', "    distance !== null && this.pausedView.invalidate('bridge');\n"],
    ['an early return before it', "    if (distance === 0) return;\n    this.pausedView.invalidate('bridge');\n"],
    ['a write before it', "    this.scriptedOcclusion = distance;\n    this.pausedView.invalidate('bridge');\n"],
  ];
  for (const [why, replacement] of variants) {
    caught(GAME_SOURCE.replace(occlusion, occlusion.replace(first, replacement)), 'setOcclusion', `invalidation behind ${why}`);
  }

  // 3. A read that writes through a call, directly or through a helper.
  const snapshot = memberBody(GAME_SOURCE, 'snapshot')!;
  const reads: [string, string][] = [
    ['a mutator on a Game object', '    this.renderer.setOcclusion(4);\n'],
    ['a mutator on an indexed object', '    this.seats[0].rig.apply(this.seats[0].currentPose);\n'],
    ['an optional-chained mutator', '    this.population?.prepareView(this.renderer.camera);\n'],
    ['a public writer', '    this.setOptions({});\n'],
    ['a private choke point', '    this.applyOptions(this.options.current);\n'],
    ['a compound assignment', '    this.layoutChanges ||= 1;\n'],
    ['an increment on the right', '    ++this.layoutChanges;\n'],
    ['a delete', '    delete this.debugLabels;\n'],
  ];
  for (const [why, line] of reads) {
    caught(GAME_SOURCE.replace(snapshot, snapshot.replace('{\n', `{\n${line}`)), 'snapshot', `a read that writes through ${why}`);
  }
  // A private helper two calls down (snapshot → snapshotFor → requireSeat) that starts writing.
  const helper = memberBody(GAME_SOURCE, 'requireSeat')!;
  caught(GAME_SOURCE.replace(helper, helper.replace('{\n', '{\n    this.layoutChanges += 1;\n')), 'snapshot', 'a writing helper two calls below a read');
  // The listed exceptions are narrow: a read helper's write is excused only for that helper.
  const panes = memberBody(GAME_SOURCE, 'chaseRoomSnapshot')!;
  caught(GAME_SOURCE.replace(panes, panes.replace('{\n', '{\n    this.widestPaneHalfAngle = 0;\n')), 'snapshotFor', 'the same write outside the excused helper');
});
