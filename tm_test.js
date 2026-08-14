const fs=require('fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('index.html','utf8');
let fails=0;
const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' - '+m);if(!c)fails++;};

// Stub fetch so Supabase calls fall through to the localStorage fallback
const dom=new JSDOM(html,{
  runScripts:'dangerously',
  url:'http://localhost/',
  beforeParse(w){
    w.fetch=()=>Promise.reject(new Error('offline'));
  }
});
const w=dom.window,d=w.document;

// Give loadCards() time to hit the fetch stub and fall back to localStorage
setTimeout(()=>{

// 1. Board renders exactly 3 columns (To Do, In Progress, Done)
const cols=d.querySelectorAll('#board .col');
ok(cols.length===3,'board renders 3 columns (got '+cols.length+')');

// 2. Column headings match the spec
const headings=[...cols].map(c=>c.querySelector('h2').textContent.replace(/\d+/,'').trim());
ok(headings[0].startsWith('To Do'),'first column is To Do');
ok(headings[1].startsWith('In Progress'),'second column is In Progress');
ok(headings[2].startsWith('Done'),'third column is Done');

// 3. Cards are grouped by status — seed localStorage with three cards
const seed=[
  {id:'1',title:'Alpha',desc:'',owner:'',watchers:'',status:'todo',created_at:'2024-01-01T00:00:00Z'},
  {id:'2',title:'Beta',desc:'',owner:'',watchers:'',status:'prog',created_at:'2024-01-02T00:00:00Z'},
  {id:'3',title:'Gamma',desc:'',owner:'',watchers:'',status:'done',created_at:'2024-01-03T00:00:00Z'},
];
w.localStorage.setItem('tm2_cards',JSON.stringify(seed));
w.cards=seed.slice();
w.render(seed);

const todoCol=d.querySelector('.cards[data-col=todo]');
const progCol=d.querySelector('.cards[data-col=prog]');
const doneCol=d.querySelector('.cards[data-col=done]');
ok(todoCol&&/Alpha/.test(todoCol.innerHTML),'todo card renders in To Do column');
ok(progCol&&/Beta/.test(progCol.innerHTML),'prog card renders in In Progress column');
ok(doneCol&&/Gamma/.test(doneCol.innerHTML),'done card renders in Done column');
ok(!todoCol.innerHTML.includes('Beta'),'Beta does NOT appear in To Do column');
ok(!doneCol.innerHTML.includes('Alpha'),'Alpha does NOT appear in Done column');

// 4. Column counts update when render is called
const todoBadge=d.querySelectorAll('#board .col')[0].querySelector('.col-count');
ok(todoBadge&&todoBadge.textContent==='1','To Do column shows count 1');

// 5. openModal sets status correctly for the "add in column" flow
w.openModal(null,'prog');
ok(d.getElementById('modal').classList.contains('open'),'modal opens for new card');
ok(d.getElementById('f-status').value==='prog','status pre-set to prog when adding in that column');
w.closeModal();

// 6. saveTask with empty title shows error, does not add a card
w.openModal(null,'todo');
d.getElementById('f-title').value='';
w.saveTask();
const err=d.getElementById('modal-error');
ok(err&&err.style.display!=='none','error shown for empty title');
ok(w.cards.length===3,'no card added when title is empty');

// 7. esc() escapes HTML (XSS guard)
ok(w.esc('<b>&"\'')==='&lt;b&gt;&amp;&quot;&#39;','esc() escapes HTML special chars');

// 8. No 'Review' status option in the status select
const statusOpts=[...d.getElementById('f-status').options].map(o=>o.value);
ok(!statusOpts.includes('review'),'Review status absent from status select');

console.log(fails===0?'\nALL TESTS PASSED':'\n'+fails+' TEST(S) FAILED');
process.exit(fails?1:0);

},200);
