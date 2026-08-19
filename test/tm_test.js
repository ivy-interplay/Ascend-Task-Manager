/* Config-consistency tests for the Ascend Task Manager.
 *
 * The bug this suite exists to prevent: the client/family and type lists were
 * hardcoded in FIVE separate places across two files. They drifted, which is
 * why Newman survived in some dropdowns after being retired, and why Escher
 * Trust / KT Ventures / Katz were missing from others.
 *
 *   node test/tm_test.js
 *
 * Runs against live/ (the source), not dist/, so it needs no Supabase key.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const files = {
  index: fs.readFileSync(path.join(ROOT, 'live', 'index.html'), 'utf8'),
  task:  fs.readFileSync(path.join(ROOT, 'live', 'task.html'), 'utf8'),
};

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + msg); if (!cond) fails++; };

// Pull a `const NAME = [ ... ];` array literal of strings out of a source file.
function arrayLiteral(src, name) {
  const m = new RegExp('const\\s+' + name + '\\s*=\\s*\\[([^\\]]*)\\]').exec(src);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1]);
}

const isSortedAZ = arr => arr.every((v, i) =>
  i === 0 || arr[i - 1].localeCompare(v, undefined, { sensitivity: 'base' }) <= 0);

// ── The rosters, as declared in each file ───────────────────────────────────
const rosters = {
  'index FAMILY_OPTIONS':    arrayLiteral(files.index, 'FAMILY_OPTIONS'),
  'task  KV_FAMILY_OPTIONS': arrayLiteral(files.task,  'KV_FAMILY_OPTIONS'),
};
const types = {
  'index TYPE_OPTIONS':        arrayLiteral(files.index, 'TYPE_OPTIONS'),
  'task  KV_FUNCTION_OPTIONS': arrayLiteral(files.task,  'KV_FUNCTION_OPTIONS'),
};
const owners = {
  'index OWNER_SLUGS':   arrayLiteral(files.index, 'OWNER_SLUGS'),
  'task  KV_OWNER_SLUGS': arrayLiteral(files.task, 'KV_OWNER_SLUGS'),
};

console.log('\n── lists are found and non-empty ──');
[rosters, types, owners].forEach(group =>
  Object.entries(group).forEach(([name, list]) =>
    ok(Array.isArray(list) && list.length > 1, name + ' parsed (' + (list ? list.length : 0) + ' entries)')));

console.log('\n── the two files agree (this is the drift guard) ──');
const fam = Object.entries(rosters);
ok(JSON.stringify([...fam[0][1]].sort()) === JSON.stringify([...fam[1][1]].sort()),
   'family roster identical in index.html and task.html');
const typ = Object.entries(types);
ok(JSON.stringify([...typ[0][1]].sort()) === JSON.stringify([...typ[1][1]].sort()),
   'type list identical in index.html and task.html');
const own = Object.entries(owners);
ok(JSON.stringify([...own[0][1]].sort()) === JSON.stringify([...own[1][1]].sort()),
   'owner roster identical in index.html and task.html');

console.log("\n── Andrew's 2026-08-14 feedback ──");
Object.entries(rosters).forEach(([name, list]) => {
  // (c) Newman was never a real family — a Davis alias, retired in Athena
  //     (STATUS_REPORT #52) and confirmed removed by Andrew.
  ok(!list.some(f => /newman/i.test(f)), name + ': Newman absent');
  // (d) + (e)
  ok(list.includes('Escher Trust'), name + ': Escher Trust present');
  ok(list.includes('KT Ventures'),  name + ': KT Ventures present');
  ok(list.includes('Katz'),         name + ': Katz present');
  // (b) dropdowns sorted A to Z
  ok(isSortedAZ(list.filter(Boolean)), name + ': sorted A to Z');
});
Object.entries(types).forEach(([name, list]) => {
  // (a) add compliance and HR
  ok(list.includes('Compliance'), name + ': Compliance present');
  ok(list.includes('HR'),         name + ': HR present');
  ok(isSortedAZ(list.filter(Boolean)), name + ': sorted A to Z');
});
Object.entries(owners).forEach(([name, list]) => {
  // Alec was removed 2026-08-19 along with his one remaining task.
  ok(!list.includes('alec'), name + ': Alec removed');
});
// The real invariant is not "alec is present" but "the two rosters agree and
// nothing references a slug they don't define" — a task assigned to a missing
// slug renders a blank owner dropdown that can silently wipe the owner on save.
// The cross-file equality check above covers the first half; this covers the
// display names, which are a separate object and drifted independently before.
const nameMapKeys = src => {
  const m = /const (?:OWNER_SLUG_TO_NAME|KV_OWNER_NAMES) = \{([^}]*)\}/.exec(src);
  return m ? [...m[1].matchAll(/([a-z]+)\s*:/g)].map(x => x[1]) : [];
};
Object.entries({ index: files.index, task: files.task }).forEach(([f, src]) => {
  const slugs = (f === 'index' ? owners['index OWNER_SLUGS'] : owners['task  KV_OWNER_SLUGS']).filter(Boolean);
  const named = nameMapKeys(src);
  const missing = slugs.filter(sl => !named.includes(sl));
  ok(missing.length === 0, f + ': every owner slug has a display name (' + missing.join(',') + ')');
});

console.log('\n── new fields are wired end to end ──');
// (f) co-owner, (g) recurring, colour legend
// index.html writes the attribute inline; task.html goes through kvSelect(),
// so the field name appears as that helper's argument instead.
const editableInTask = f => new RegExp("kvSelect\\(task,\\s*'" + f + "'").test(files.task);
ok(/data-field="co_owner"/.test(files.index),   'index: co-owner is an editable cell');
ok(editableInTask('co_owner'),                  'task:  co-owner is an editable field');
ok(/data-field="recurrence"/.test(files.index), 'index: recurrence is an editable cell');
ok(editableInTask('recurrence'),                'task:  recurrence is an editable field');
ok(/data-field="quadrant"/.test(files.index),   'index: quadrant is an editable cell');
ok(editableInTask('quadrant'),                  'task:  quadrant is an editable field');
ok(/id="atm-coowner"/.test(files.index),        'index: Add Task has a co-owner field');
ok(/id="atm-recurrence"/.test(files.index),     'index: Add Task has a repeats field');
ok(/id="atm-quadrant"/.test(files.index),       'index: Add Task has an importance/urgency field');

console.log('\n── (h) every GRID column is sortable ──');
// The grid was trimmed to nine columns so it fits a laptop without sideways
// scrolling; description, co-owner, repeats and created-at moved to the task
// drawer. Sorting covers every column that is actually on screen.
const sortable = arrayLiteral(files.index, 'SORTABLE_FIELDS') || [];
// The old high/medium/low priority column was deleted (Andrew, 2026-08-19);
// the Eisenhower field took over the name.
['title','next_step','quadrant','family','function',
 'due_date','assigned_to','status']
  .forEach(f => ok(sortable.includes(f), 'sortable: ' + f));
ok(!sortable.includes('priority'), 'the retired high/medium/low column is gone');
// Each sortable field needs a matching <th id="th-…"> or clicking does nothing.
sortable.forEach(f => ok(new RegExp('id="th-' + f + '"').test(files.index),
  'header exists for sortable field ' + f));
// ...and no sort key may point at a column that no longer has a header.
const orphan = sortable.filter(f => !new RegExp('id="th-' + f + '"').test(files.index));
ok(orphan.length === 0, 'no sort key without a header (' + orphan.join(',') + ')');

console.log('\n── fields moved to the drawer are still reachable ──');
['co_owner','recurrence'].forEach(f =>
  ok(new RegExp('data-field="' + f + '"').test(files.index),
     'drawer still exposes ' + f + ' as editable'));
ok(/function openTaskDrawer/.test(files.index), 'task drawer exists');
// The drawer IS the detail view now — every field editable plus notes — so it
// no longer bounces to a second page; task.html is demoted to a quiet link.
ok(/id="dw-title"/.test(files.index),   'drawer edits the title');
ok(/id="dw-overview"/.test(files.index),'drawer edits the description');
ok(/id="dw-next"/.test(files.index),    'drawer edits the next step');
ok(/id="dw-note"/.test(files.index),    'drawer can add a note');
ok(/function saveDrawerField/.test(files.index), 'drawer fields save back to the store');
ok(/Open as a page/.test(files.index),  'the standalone page is still reachable');
ok(/tdrawer-note/.test(files.index), 'drawer shows the note history');

console.log("\n── Andrew's 2026-08-19 feedback ──");
// One vocabulary: the grid used to abbreviate what Add Task spelled out.
['Important & urgent','Important, not urgent','Urgent, not important']
  .forEach(l => ok(files.index.includes(l), 'quadrant label in full: ' + l));
['Do first','Delegate'].forEach(l =>
  ok(!files.index.includes("short: '" + l), 'abbreviation retired: ' + l));
// Co-owned tasks must reach the co-owner's list.
ok(/function isOnTask/.test(files.index), 'owner-or-co-owner helper exists');
ok(!/tf\.includes\(t\.assigned_to\)/.test(files.index),
   'no person filter counts assigned_to alone');
// Drawer-only fields.
ok(/data-field="value_add"/.test(files.index), 'drawer has Value-add');
ok(/'hours_spent'/.test(files.index), 'drawer has Hours spent');
ok(!/th-value_add|th-hours_spent/.test(files.index), 'neither is a grid column');
ok(/function saveDrawerNumber/.test(files.index), 'numeric field saves null when blank');

console.log('\n── filtering surfaces ──');
ok(/id="cf-search"/.test(files.index), 'search box exists');
ok(/function taskMatchesSearch/.test(files.index), 'search is wired into filtering');
ok(/id="tasks-tiles"/.test(files.index), 'status tiles exist');
['open','closed','overdue','total'].forEach(t =>
  ok(new RegExp('data-tile="' + t + '"').test(files.index), 'tile: ' + t));
ok(/function toggleTile/.test(files.index), 'tiles filter on click');
ok(/function renderTileBreakdown/.test(files.index), 'tiles expand a priority breakdown');
ok(/function syncUrlState/.test(files.index) && /function restoreUrlState/.test(files.index),
   'view state is shareable via the URL');

console.log('\n── edits refresh the view ──');
// Saving used to leave the row on screen until a reload, even when the edit
// had pushed the task out of the current filter.
ok(/function afterTaskChange/.test(files.index), 'a single post-save refresh path exists');
['updateTaskField','updateDueDate','saveDrawerField','saveDrawerNumber'].forEach(fn => {
  const body = new RegExp('function ' + fn + '\\b[\\s\\S]{0,1400}').exec(files.index);
  ok(!!body && /afterTaskChange\(/.test(body[0]), fn + ' refreshes after saving');
});
ok(/function toast/.test(files.index), 'a task leaving the view says so');

// Staleness audit, 2026-08-19. afterTaskChange has to refresh EVERY surface
// derived from the data, not just the grid:
//  - the Client/Owner filter lists are built from the data, so an edit that
//    introduces a value nobody was using yet must rebuild them;
//  - the tile breakdown is a second view of the same counts and has to recount
//    while open, or it contradicts the tile above it;
//  - the drawer subheading restates family and priority and went stale the
//    moment either was edited from inside the drawer.
const afterBody = /function afterTaskChange[\s\S]{0,1200}/.exec(files.index)[0];
ok(/populateColFilterOptions\(/.test(afterBody), 'refresh rebuilds the data-derived filter lists');
ok(/renderTileBreakdown\(/.test(afterBody),      'refresh recounts the open tile breakdown');
ok(/refreshDrawerMeta\(/.test(afterBody),        'refresh updates the drawer subheading');
ok(/function refreshDrawerMeta/.test(files.index), 'drawer subheading is recomputed, not baked in at open');

// 0 means "All". `parseInt(v) || 25` treats it as falsy, so All paged at 25.
ok(!/window\.__perPage = parseInt\(v, 10\) \|\| 25/.test(files.index),
   'per-page does not coerce 0 ("All") back to 25');
ok(!/const per = window\.__perPage \|\| 25/.test(files.index),
   'the render path does not coerce 0 ("All") back to 25');

console.log('\n── default view hides completed work ──');
ok(/id="cf-showdone"/.test(files.index), 'a "Show completed" toggle exists');
ok(!/id="cf-showdone"[^>]*checked/.test(files.index), 'it is unchecked by default');
const doneStatuses = arrayLiteral(files.index, 'DONE_STATUSES') || [];
['done','completed','archived'].forEach(s =>
  ok(doneStatuses.includes(s), 'DONE_STATUSES covers "' + s + '"'));
ok(arrayLiteral(files.task, 'DONE_STATUSES') &&
   JSON.stringify(arrayLiteral(files.task, 'DONE_STATUSES').sort()) === JSON.stringify([...doneStatuses].sort()),
   'both files agree on which statuses mean finished');

console.log('\n── storage layer ──');
Object.entries(files).forEach(([name, src]) => {
  ok(/__SUPABASE_ANON_KEY__/.test(src), name + ': source uses the key placeholder, no key committed');
  ok(/xfxitjrubczqfnsslzuq\.supabase\.co/.test(src), name + ': points at the ascend-task-manager project');
  // The PHP endpoints must survive as the fallback path.
  ok(/taskmanager\/update-task\.php/.test(src), name + ': PHP fallback retained');
});
// No app-side code should call PHP directly any more — only TM's fallback branch.
const phpCalls = (files.index.match(/fetch\('\/protocols\/taskmanager\/(update-task|add-task|delete-task)\.php'/g) || []).length;
ok(phpCalls === 3, 'index: PHP is only called from the three TM fallback branches (found ' + phpCalls + ')');

console.log('\n── the two UIs were merged into one ──');
ok(/data-tab="protocols"/.test(files.index) && /data-tab="tasks"/.test(files.index),
   'index.html carries both the Protocols and Tasks tabs');
ok(!/href="\/protocols\/taskmanager\/"/.test(files.task),
   'task.html no longer links back to the retired /protocols/taskmanager/ page');
ok(/<h1>Protocols<\/h1>/.test(files.index) && /<h1>Tasks<\/h1>/.test(files.index),
   'the two tabs have distinct headings');

console.log(fails === 0 ? '\nALL TESTS PASSED' : '\n' + fails + ' TEST(S) FAILED');
process.exit(fails ? 1 : 0);
