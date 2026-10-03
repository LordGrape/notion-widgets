/* Exercise the shipped model, all clips, and the real Command Centre fallback.
   Only synthetic state is used; every external service request is intercepted.
   Run: node tools/broadcast/verify.cjs <screenshot-directory>
   Set BROADCAST_BROWSER=chrome or msedge to use an installed browser. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(process.argv[2] || 'output/broadcast-qa');
fs.mkdirSync(out, { recursive: true });
const bytes = fs.readFileSync(path.join(root, 'apps/assistant/broadcast.glb'));
const model = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
assert.deepEqual(model.animations.map(a => a.name).sort(), ['cheer','idle','run','slump','talk']);
for (const name of ['Root','Body','Neck','ShoulderL','ShoulderR','ElbowL','ElbowR','HipL','HipR','KneeL','KneeR','Screen']) {
 assert(model.nodes.some(n => n.name === name), `Missing rig node: ${name}`);
}
for (const name of ['Hand-1','Hand1','Shoe-1Buckle0_0','Shoe1Buckle0_0','CaseHandle','CaseClasp-1']) {
 assert(model.nodes.some(n => n.name === name), `Missing executive mesh: ${name}`);
}
assert(model.materials.some(m => m.name !== 'Screen' && m.emissiveFactor?.some(v => v > 0)), 'Missing emissive hand signal');
assert(!model.nodes.some(n => /Antenna/.test(n.name)), 'Old TV antenna remains');
for (const file of ['icon.svg','icon-light.svg','icon-dark.svg','icon-maskable.svg','index.html']) {
 const svg=fs.readFileSync(path.join(root,'apps/assistant',file),'utf8');
 assert(svg.includes('class="lg-handle"'), `${file}: suitcase handle missing`);
 assert(!svg.includes('class="lg-ant"'), `${file}: old logo antenna remains`);
}
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.glb':'model/gltf-binary', '.webp':'image/webp', '.json':'application/json' };
const server = http.createServer((req,res) => {
 let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
 if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
 if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file,'index.html');
 fs.readFile(file,(error,data) => {
  const type=types[path.extname(file)] || 'application/octet-stream';
  res.writeHead(error ? 404 : 200, {'Content-Type':type});
  // Match GitHub's LF source: the To-Do compatibility loader checks exact text.
  res.end(error ? 'Not found' : type.startsWith('text/') ? data.toString().replaceAll('\r\n','\n') : data);
 });
});
(async () => {
 await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
 const base = `http://127.0.0.1:${server.address().port}`;
 const browser = await chromium.launch({channel:process.env.BROADCAST_BROWSER || undefined, args:['--enable-unsafe-swiftshader']});
 try {
  for (const theme of ['light','dark']) for (const mobile of [false,true]) for (const reduced of [false,true]) {
   const label = `${theme}-${mobile?'mobile':'desktop'}-${reduced?'fallback':'3d'}`;
   const context = await browser.newContext({viewport:{width:mobile?390:1440,height:1000},colorScheme:theme,reducedMotion:reduced?'reduce':'no-preference',serviceWorkers:'block'});
   const errors=[], states={};
   await context.route('**/*', async route => {
    const request=route.request(), url=new URL(request.url());
    if (url.hostname==='127.0.0.1') return route.continue();
    if (url.hostname==='cdn.jsdelivr.net' && url.pathname.startsWith('/npm/three@0.170.0/')) {
     const file=path.join(root,'node_modules/three',url.pathname.split('/npm/three@0.170.0/')[1]);
     return route.fulfill({body:fs.readFileSync(file),contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'}});
    }
    if (url.hostname==='widget-sync.lordgrape-widgets.workers.dev') {
     const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'X-Widget-Key,Content-Type','Access-Control-Allow-Methods':'GET,PUT,POST,OPTIONS'};
     if(request.method()==='OPTIONS') return route.fulfill({status:204,headers});
     const ns=url.pathname.split('/')[2];
     if(url.pathname.startsWith('/state/') && request.method()==='PUT') states[ns]=request.postDataJSON().value;
     return route.fulfill({headers,json:{value:states[ns] || {},ok:true,items:[],tasks:[]}});
    }
    return route.abort();
   });
   const page=await context.newPage();
   page.on('pageerror',error=>{ errors.push(error.message); console.error('PAGE',error.message); });
   await page.goto(base+'/apps/assistant/');
   await page.locator('#accessKey').fill('synthetic-test-key');
   await page.locator('#unlockForm button').click();
   await page.locator('.today-layout').waitFor().catch(async error=>{
    await page.screenshot({path:path.join(out,'failure.png')});
    console.error((await page.locator('body').innerText()).slice(0,3000));
    for (const frame of page.frames()) console.error('FRAME',frame.url(),await frame.evaluate(()=>({ready:window.SyncEngine?.isReady?.(),todo:!!window.TodoUIBridge,clock:!!window.updateTMDisplay,timetable:!!window.occurrencesForDate,text:document.body.innerText.slice(0,150)})).catch(()=>null));
    throw error;
   });
   await page.locator('[data-view="docket"]').first().click();
   await page.locator('#broadcastCompanion').waitFor();
   await page.waitForTimeout(1500);
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   if (!reduced) {
    await page.locator('#broadcastCompanion.has-3d canvas').waitFor();
    await page.waitForTimeout(400);
    await page.evaluate(async () => {
     const module=await import('./broadcast3d.mjs');
     window.partnerTest=await module.loadBroadcast3D('./broadcast.glb');
     window.partnerTest.setMood('panic');
    });
    if (!mobile && theme==='dark') {
     for (const reaction of ['talk','cheer','slump','glitch']) {
      await page.evaluate(kind=>window.partnerTest.react(kind),reaction);
      await page.waitForTimeout(600);
      await page.locator('#broadcastCompanion').screenshot({path:path.join(out,`${reaction}.png`)});
     }
    }
   } else {
    assert.equal(await page.locator('#broadcastCompanion.has-3d').count(),0);
    assert.equal(await page.locator('.broadcast-hand i').count(),8);
    assert.equal(await page.locator('.broadcast-tie-bar').count(),1);
   }
   await page.locator('#broadcastCompanion').screenshot({path:path.join(out,label+'.png')});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${label}: horizontal overflow`);
   assert.deepEqual(errors,[],`${label}: browser errors`);
   // Use the actual app inside a Notion-sized frame, keeping the same mock boundary.
   if (!mobile) {
    await page.goto(base+'/apps/assistant/');
    await page.setContent(`<iframe title="Command Centre embed" src="${base}/apps/assistant/" style="width:640px;height:760px;border:0"></iframe>`);
    const embed=page.frameLocator('iframe[title="Command Centre embed"]');
    await embed.locator('[data-view="docket"]').first().click();
    await embed.locator('#broadcastCompanion').waitFor();
    if (!reduced) await embed.locator('#broadcastCompanion.has-3d canvas').waitFor();
    await embed.locator('#broadcastCompanion').screenshot({path:path.join(out,label+'-embed.png')});
   }
   console.log('PASS',label);
   await context.close();
  }
 } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
