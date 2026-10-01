const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const loader = fs.readFileSync('todo-loader.js', 'utf8');
async function compose(missing) {
  const frame = {hidden:false,srcdoc:''}, error = {hidden:true}, fallback = [];
  await vm.runInNewContext(loader, {
    document:{querySelector:()=>frame,getElementById:()=>error},
    location:{href:'https://widget.test/todo-smart-shell.html'},
    URL, Uint8Array, atob, Blob, Response, DecompressionStream,
    fetch:async url=>{
      const u=new URL(url), file=u.pathname.split('/').pop();
      if(u.hostname==='raw.githubusercontent.com')fallback.push(file);
      const blocked=missing===file || (u.hostname==='widget.test' && ['widget-icons.js','reading-estimates.js','core.js'].includes(file));
      return new Response(blocked?'not found':fs.readFileSync(file,'utf8'),{status:blocked?404:200});
    }
  });
  return {frame,error,fallback};
}
(async()=>{
  for(const entry of ['todo-smart-shell.html','todo-v2.html']) assert(fs.readFileSync(entry,'utf8').includes('src="todo-loader.js?'));
  assert(fs.readFileSync('todo-sync.html','utf8').includes("'todo-smart-shell.html'+location.search+location.hash"));
  assert(fs.readFileSync('apps/assistant/app.js','utf8').includes('todo: "todo-smart-shell.html"'));
  const {frame,error,fallback}=await compose();
  assert(!frame.hidden && error.hidden && frame.srcdoc);
  for(const file of ['widget-icons.js','reading-estimates.js','core.js']) {
    assert(fallback.includes(file));
    assert(!new RegExp('<script src="'+file.replace(/\./g,'\\.')+'[^>]*></script>').test(frame.srcdoc));
  }
  assert(frame.srcdoc.includes('window.TodoUIBridge ='));
  assert(frame.srcdoc.includes('ReadingEstimates.apply(t)'));
  assert(frame.srcdoc.includes('window.TodoUI'));
  for(const file of ['widget-icons.js','reading-estimates.js','core.js']) {
    const failed=await compose(file);
    assert(failed.frame.hidden && !failed.error.hidden);
    assert.equal(failed.frame.srcdoc,'');
  }
  console.log('Shared entry points, dependency fallback and safe failure passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
