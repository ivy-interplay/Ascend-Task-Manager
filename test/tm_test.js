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
  // 'alec' owns a live task; without a roster entry the owner dropdown had no
  // matching option and a stray save would have silently blanked the owner.
  ok(list.includes('alec'), name + ": includes 'alec' (owns a live task)");
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

console.log('\n── (h) every column is sortable ──');
const sortable = arrayLiteral(files.index, 'SORTABLE_FIELDS') || [];
['title','overview','next_step','priority','quadrant','family','function',
 'due_date','recurrence','assigned_to','co_owner','status','created_at']
  .forEach(f => ok(sortable.includes(f), 'sortable: ' + f));
// Each sortable field needs a matching <th id="th-…"> or clicking does nothing.
sortable.forEach(f => ok(new RegExp('id="th-' + f + '"').test(files.index),
  'header exists for sortable field ' + f));

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
