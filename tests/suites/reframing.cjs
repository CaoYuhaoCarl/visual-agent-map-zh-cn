const assert = require('node:assert/strict');
const { test, integrationTest, load, core, map, withExpansionCoordinator, obsidian, DEFAULT_SETTINGS, fixture, topicNote, coffeeSession, deferred, until, coffeeFind, reframingModalFixture } = require('../support.cjs');
test('Reframing validates structured output and rejects whole-request over-budget without truncation', async () => {
  const { ReframingService, buildReframePrompt, REFRAME_SCHEMA } = load('core/reframing-service.ts');
  const calls = [];
  const service = new ReframingService(async (request) => { calls.push(request); return JSON.stringify({ question: 'What evidence distinguishes these explanations?', context: 'Simulated analogy; alternatives and uncertainty remain.', rationale: 'Test the key tension.' }); });
  const request = { targetCore: 'understand', source: 'Candidate insight, not evidence', question: 'Explore this', context: '', language: 'en', model: 'model-a', reasoning: 'low' };
  const result = await service.reframe(request, new AbortController().signal);
  assert.match(result.context, /uncertainty/); assert.equal(calls.length, 1);
  assert.match(buildReframePrompt(request), /Candidate insight/); assert.equal(REFRAME_SCHEMA.additionalProperties, false);
  await assert.rejects(service.reframe({ ...request, source: 'x'.repeat(128001) }, new AbortController().signal), /budget|large/i); assert.equal(calls.length, 1);
  const invalid = new ReframingService(async () => '{"question":"q","context":"c","rationale":"r","path":"invented"}');
  await assert.rejects(invalid.reframe(request, new AbortController().signal), /invalid/i);
});
test('Coffee reframing snapshots exclude drafts/style and never turn ambiguous excerpts into provenance', () => {
  const { buildCoffeeSource, coffeeCommittedKey } = load('experiences/coffee-tables/handoff-source.ts');
  const session = { ...coffeeSession(), status: 'completed', rounds: [{id:'r1',status:'completed',createdAt:'now',markdown:'Unique line. Repeat phrase.',notes:''}, {id:'r2',status:'completed',createdAt:'now',markdown:'Repeat phrase.',notes:''}], transcriptMarkdown:'Unique line. Repeat phrase.\nRepeat phrase.', draftMarkdown:'UNFINISHED', observerDraftMarkdown:'DRAFT NOTES', dirtyNotes:true, guests: {...coffeeSession().guests,background:'Provided background',stylePrompt:'STYLE INSTRUCTION',customPrompt:'CUSTOM STYLE'}, observerNotes:['# Observer’s notes\n\n## Unexpected connections\n- Candidate analogy <!-- coffee-insight:v1:id=idea --> <!-- source: Unique line. -->\n  - Context: Important limits'] };
  const whole = buildCoffeeSource(session); assert.match(whole.content, /Provided background/); assert.match(whole.content, /Unique line/); assert.doesNotMatch(whole.content, /UNFINISHED|DRAFT NOTES|STYLE INSTRUCTION|CUSTOM STYLE/); assert.match(whole.sourceSnapshot, /Important limits/);
  const single = buildCoffeeSource(session, 'idea'); assert.match(single.content, /Unique line/); assert.match(single.content, /not.*updated|stale/i);
  const changed = {...session, observerNotes:[session.observerNotes[0].replace('Unique line.', 'Repeat phrase.')]}; const ambiguous = buildCoffeeSource(changed, 'idea'); assert.match(ambiguous.content, /unresolved|not.*located/i);
  assert.notEqual(coffeeCommittedKey(session), coffeeCommittedKey(changed));
});
integrationTest('Thinking Origin survives managed updates and hostile Markdown headings', async () => {
  const { repo } = fixture('en');
  const mapPath = await repo.createMap('Origin'); const map = await repo.readMap(mapPath);
  const origin = 'Original framing\n\n## Detail\n```md\n<!-- visual-agent-map:detail:end -->\n```\n### Limits\nNot verified';
  const n = await repo.createNote('Question', 'm', map, mapPath, 'manual', {detail:'Editable framing',thinkingOrigin:origin});
  assert.equal((await repo.readNote(n.path)).thinkingOrigin, origin);
  await repo.updateNote(n.path,{detail:'New research',summary:'Updated summary',preview:'User preview'});
  assert.equal((await repo.readNote(n.path)).thinkingOrigin,origin); assert.equal((await repo.readNote(n.path)).detail,'New research');
});
test('Visual Map origin is source context including decomposition and rejects silent omission', () => {
  const { withThinkingOrigin } = load('experiences/visual-map/thinking-origin.ts');
  const context = {title:'Question',summary:'',detail:'',task:'Expand',ancestors:'',rules:'',mode:'decompose',sourceContext:'Selected sources'};
  const joined = withThinkingOrigin(context, {thinkingOrigin:'Candidate analogy with limits'});
  assert.match(joined.sourceContext, /Selected sources/); assert.match(joined.sourceContext,/Candidate analogy/); assert.equal(joined.rules,'');
  const prepared = load('ai/context-builder.ts').buildPreparedTaskContext(joined,'m'); assert.match(prepared.context.sourceContext,/Candidate analogy/);
});
integrationTest('Coffee reframing stops late results and preserves drafts on invalid/failed requests', async () => {
  const data=await reframingModalFixture('idea'),{modal,plugin}=data;const pending=deferred();
  plugin.core.reframing={reframe:()=>pending.promise};
  const context=coffeeFind(modal.contentEl,e=>e.attrs['aria-label']==='Research context'), old=context.value;
  coffeeFind(modal.contentEl,e=>e.text==='Organize with AI').onclick();await until(()=>modal.controller);
  coffeeFind(modal.contentEl,e=>e.text==='Stop').onclick();pending.resolve({question:'late',context:'late result',rationale:'late'});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(context.value,old);assert.equal(plugin.activeTasks.size,0);assert.equal(data.opened.length,0);
  plugin.core.reframing={reframe:async()=>{throw Error('invalid response');}};
  coffeeFind(modal.contentEl,e=>e.text==='Organize with AI').onclick();await until(()=>!modal.controller);assert.equal(context.value,old);assert.match(modal.status.text,/invalid/);
});
integrationTest('Coffee reframing checks Markdown/sidecar changes and busy state before creating', async () => {
  for (const kind of ['markdown','sidecar','busy']) {
    const data=await reframingModalFixture();
    if(kind==='markdown')data.contents.set(data.path,data.contents.get(data.path)+'\nExternal edit');
    if(kind==='sidecar'){const p=data.store.sidecarPath(data.session.id);data.contents.set(p,data.contents.get(p)+' ');}
    if(kind==='busy')data.plugin.coffeeManager={get:()=>({busy:true})};
    coffeeFind(data.modal.contentEl,e=>e.text==='Create research map').onclick();await until(()=>!data.modal.creating);
    assert.equal((await data.repo.mapFiles()).length,0);assert.equal(data.opened.length,0);assert.match(data.modal.status.text,/changed|generating/);
  }
});
integrationTest('Visual Map handoff separates synchronization/navigation failure from durable completion', async () => {
  const {receiveVisualMapHandoff}=load('experiences/visual-map/handoff.ts',{obsidian});const {repo,files}=fixture('en');let navigations=0;
  const artifact={version:1,id:'operation',kind:'question',title:'Question',content:'Context',sourceSnapshot:'Idea',origin:{experience:'coffee-tables'},sources:[]};
  const result=await receiveVisualMapHandoff(artifact,{repo,defaultModel:()=> 'm',exists:p=>files.has(p),mutate:async work=>{await work();throw Error('sync failed');},navigate:async()=>{navigations++;throw Error('open failed');}});
  assert.match(result.navigationError,/sync failed/);assert.match(result.navigationError,/open failed/);assert.ok(files.has(result.targetPath));assert.equal((await repo.readMap(result.targetPath)).nodes.length,1);assert.equal(navigations,1);
});
integrationTest('Visual Map handoff exposes exact partial paths at every persistence stage', async () => {
  const {receiveVisualMapHandoff}=load('experiences/visual-map/handoff.ts',{obsidian});
  for(const stage of ['folders','map','note','saveMap']){
    const {repo,app,files}=fixture('en');
    if(stage==='folders'){const fn=repo.ensureTopicFolders.bind(repo);repo.ensureTopicFolders=async root=>{await fn(root);throw Error('folder failed');};}
    if(stage==='map'||stage==='note'){const fn=app.vault.create;app.vault.create=async(p,s)=>{if(stage==='map'?p.endsWith('/Map.md'):p.includes('/Notes/'))throw Error(stage+' failed');return fn(p,s);};}
    if(stage==='saveMap')repo.saveMap=async()=>{throw Error('save failed');};
    const artifact={version:1,id:stage,kind:'question',title:'Question',content:'Context',origin:{experience:'coffee-tables'},sources:[]};
    await assert.rejects(receiveVisualMapHandoff(artifact,{repo,defaultModel:()=> 'm',exists:p=>files.has(p),mutate:work=>work(),navigate:async()=>{throw Error('should not navigate');}}),e=>{assert.equal(e.name,'HandoffWriteError');assert.ok(e.paths.length>=1);assert.ok(e.paths.every(p=>files.has(p)));return true;});
  }
});
integrationTest('Coffee handoff partial writes disable creation; saved navigation failures retry only opening', async () => {
  const partial=await reframingModalFixture();partial.repo.saveMap=async()=>{throw Error('save failed');};
  const create=coffeeFind(partial.modal.contentEl,e=>e.text==='Create research map');create.onclick();await until(()=>!partial.modal.creating);assert.equal(create.disabled,true);const paths=[...partial.files.keys()];create.onclick();await Promise.resolve();assert.deepEqual([...partial.files.keys()],paths);assert.match(partial.modal.status.text,/Some files/);
  const saved=await reframingModalFixture();saved.plugin.activateView=async()=>{throw Error('navigation failed');};
  const open=coffeeFind(saved.modal.contentEl,e=>e.text==='Create research map');open.onclick();await until(()=>!saved.modal.creating);assert.equal(open.text,'Open saved map');assert.equal((await saved.repo.mapFiles()).length,1);open.onclick();await until(()=>saved.opened.length===1);assert.equal((await saved.repo.mapFiles()).length,1);
});
integrationTest('Root research and decomposition use Thinking Origin and preserve it across writeback', async () => {
  const {repo,app}=fixture('en'), n=await topicNote(repo,'Research source');
  const mapPath='Agent Workspace/Topics/map-a/Map.md', doc={...map([n]),id:'map-a'};await app.vault.create(mapPath,core.serializeMap(doc));
  await repo.updateNote(n.path,{prompt:'Research',detail:'Initial context',thinkingOrigin:'Unverified analogy. Important conditions and alternatives.'});
  const {VisualAgentMapView}=load('main.ts',{obsidian});let view;const modes=[],languages=[];
  const plugin=withExpansionCoordinator({repo,settings:{...DEFAULT_SETTINGS,language:'en'},running:new Set(),activeTasks:new Map(),pendingSuggestions:new Map(),pendingResearchOptions:new Map(),mutate:work=>work(),views:()=>[view],askModel:async context=>{modes.push(context.mode);languages.push(context.outputLanguage);assert.match(context.sourceContext,/Important conditions/);assert.equal(context.rules,'');return {summary:'New understanding',detail:'Research findings',suggestions:[]};},rebuildDerivedData:async()=>{}});
  view=new VisualAgentMapView({app},plugin);view.path=mapPath;view.map=doc;view.render=()=>{};view.hydrate=async()=>{};view.contentEl={querySelector:()=>null};
  await view.runAgent(n,undefined,undefined,{outputLanguage:'zh-TW'});await until(()=>!plugin.running.size);assert.match((await repo.readNote(n.path)).thinkingOrigin,/Important conditions/);
  await view.proposeChildren(n,{researchMode:'local',researchDepth:'normal',visualMode:'off',referenceGroups:[]},'Explore',()=>{},()=>{});
  assert.deepEqual(modes,['task','decompose']);assert.equal(languages[0],'zh-TW');
});
integrationTest('Editing Thinking Origin during root research fences stale results', async () => {
  const {repo,app}=fixture('en'),n=await topicNote(repo,'Editable source');await repo.updateNote(n.path,{prompt:'Research',detail:'Keep',thinkingOrigin:'Old source'});
  const {VisualAgentMapView}=load('main.ts',{obsidian});const pending=deferred();let view,accepted=false;
  const plugin={repo,settings:{...DEFAULT_SETTINGS},running:new Set(),activeTasks:new Map(),pendingSuggestions:new Map(),mutate:work=>work(),views:()=>[view],askModel:(_context,_model,_reasoning,_signal,_exchange,onAccepted)=>{onAccepted?.();accepted=true;return pending.promise;}};
  view=new VisualAgentMapView({app},plugin);view.map=map([n]);view.render=()=>{};view.hydrate=async()=>{};
  const handle=await view.runAgent(n);assert.ok(handle);assert.equal(accepted,true);await repo.updateNote(n.path,{thinkingOrigin:'User corrected source'});pending.resolve({summary:'Stale',detail:'Stale',suggestions:[]});await handle.finished;
  const note=await repo.readNote(n.path);assert.equal(note.detail,'Keep');assert.equal(note.thinkingOrigin,'User corrected source');
});
integrationTest('Reframing close/reset and declined usage confirmation never apply late drafts', async () => {
  for(const action of ['close','reset','decline']){
    const data=await reframingModalFixture(),{modal,plugin}=data;const pending=deferred();let request;
    plugin.core.reframing={reframe:(input,signal)=>{request={input,signal};return pending.promise;}};
    if(action==='decline')plugin.confirmAiUsage=async()=>false;
    const question=coffeeFind(modal.contentEl,e=>e.attrs['aria-label']==='Research question'),before=question.value;
    coffeeFind(modal.contentEl,e=>e.text==='Organize with AI').onclick();
    if(action==='decline'){await until(()=>!modal.controller);assert.equal(request,undefined);assert.match(modal.status.text,/did not run/);continue;}
    await until(()=>request);if(action==='close')modal.close();else plugin.resetCodexRuntime();
    assert.equal(request.signal.aborted,true);pending.resolve({question:'Late',context:'Late',rationale:'Late'});await new Promise(resolve=>setImmediate(resolve));assert.equal(question.value,before);assert.equal(data.opened.length,0);assert.equal(plugin.activeTasks.size,0);
  }
});
integrationTest('Coffee handoff rechecks source after waiting in the write queue', async () => {
  const data=await reframingModalFixture();const gate=deferred();data.plugin.mutate=async work=>{await gate.promise;await work();};
  coffeeFind(data.modal.contentEl,e=>e.text==='Create research map').onclick();await until(()=>data.modal.creating);
  data.contents.set(data.path,data.contents.get(data.path)+'\nChanged while queued');gate.resolve();await until(()=>!data.modal.creating);assert.equal((await data.repo.mapFiles()).length,0);assert.equal(data.opened.length,0);
});
integrationTest('Reframing runner uses structured output and disabled tools on both provider adapters', async () => {
  const {EventEmitter}=require('node:events');const requests=[];
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
  const emit=message=>process.nextTick(()=>child.stdout.emit('data',Buffer.from(JSON.stringify(message)+'\n')));
  child.stdin={write:line=>{const m=JSON.parse(line);requests.push(m);if(m.method==='initialize')emit({id:m.id,result:{}});else if(m.method==='config/read')emit({id:m.id,result:{config:{mcp_servers:{'inherited.server':{},enabledServer:{enabled:true}}}}});else if(m.method==='thread/start'){assert.equal(m.params.config.mcp_servers['inherited.server'].enabled,false);assert.equal(m.params.config.mcp_servers.enabledServer.enabled,false);for(const feature of ['apps','plugins','browser_use','computer_use','multi_agent','goals','code_mode_host'])assert.equal(m.params.config['features.'+feature],false);assert.equal(m.params.config['web_search'],'disabled');assert.equal(m.params.config['features.shell_tool'],false);assert.equal(m.params.config['features.unified_exec'],false);assert.doesNotMatch(m.params.baseInstructions,/only.*Markdown/);emit({id:m.id,result:{thread:{id:'reframe-thread'}}});}else if(m.method==='turn/start'){assert.equal(m.params.outputSchema.additionalProperties,false);emit({id:m.id,result:{turn:{id:'reframe-turn'}}});emit({method:'item/completed',params:{threadId:'reframe-thread',item:{id:'message',type:'agentMessage',text:'{"question":"Q?","context":"Unverified context","rationale":"R"}'}}});emit({method:'turn/completed',params:{threadId:'reframe-thread',turn:{status:'completed'}}});}else if(m.method==='thread/unsubscribe')emit({id:m.id,result:{}});}};
  const {CodexAppServerRuntime}=load('ai/runtime/codex-app-server.ts',{'node:child_process':{spawn:()=>child}});const {ReframingService}=load('core/reframing-service.ts');
  const runtime=new CodexAppServerRuntime({executable:'codex',cwd:'/plugin',env:{},clientVersion:'test',webSearchDisabled:true});
  try{const service=new ReframingService((request,prompt,schema,signal)=>runtime.runTask(prompt,request.model,request.reasoning,schema,{textOnly:true,searchBudget:0,signal}));await service.reframe({targetCore:'understand',source:'Unverified idea',question:'Q',context:'',model:'m',reasoning:'low',language:'en'},new AbortController().signal);assert.ok(requests.some(r=>r.method==='turn/start'));}finally{runtime.stop();}
  const args=load('ai/runtime/claude-code-cli.ts').claudeTaskArgs('sonnet','low',load('core/reframing-service.ts').REFRAME_SCHEMA,false);assert.equal(args[args.indexOf('--tools')+1],'');assert.ok(args.includes('--json-schema'));
});
integrationTest('Oversized Thinking Origin is rejected before provider work without trimming', async () => {
  const {default:Plugin}=load('main.ts',{obsidian});const plugin=new Plugin();let calls=0;plugin.runtime=()=>{calls++;throw Error('must not run');};
  await assert.rejects(plugin.askModel({title:'Q',summary:'',detail:'',task:'Research',rules:'',ancestors:'',sourceContext:'x'.repeat(128001)},'m'),/budget|預算/i);assert.equal(calls,0);
});
integrationTest('Coffee becoming busy during the final snapshot read blocks handoff writes', async () => {
  const data=await reframingModalFixture();let checks=0;const read=data.store.assertHandoffSnapshot.bind(data.store);
  data.store.assertHandoffSnapshot=async s=>{await read(s);if(++checks===2)data.plugin.coffeeManager={get:()=>({busy:true})};};
  coffeeFind(data.modal.contentEl,e=>e.text==='Create research map').onclick();await until(()=>!data.modal.creating);assert.equal((await data.repo.mapFiles()).length,0);assert.match(data.modal.status.text,/generating/);
});
integrationTest('Reframing exchange logs record validation failure and clean active controllers', async () => {
  const {providerReframeRunner,ReframingService}=load('core/reframing-service.ts');const states=[];const active=new Map();
  const log={begin:()=>states.push('begin'),sent:()=>{},received:()=>states.push('received'),parsed:()=>states.push('parsed'),completed:()=>states.push('completed'),failed:()=>states.push('failed')};
  const options={pluginDirectory:()=>'/plugin',exchangeLoggingEnabled:()=>true,exchanges:()=>log,codexRuntime:()=>({runTask:async()=>'{"question":"Q?","context":"","rationale":"r"}'})};
  const service=new ReframingService(providerReframeRunner(options,active));
  await assert.rejects(service.reframe({targetCore:'understand',source:'idea',question:'Q?',context:'',language:'en',model:'m',reasoning:'low'},new AbortController().signal),/Invalid/);assert.deepEqual(states,['begin','received','failed']);assert.equal(active.size,0);
});
integrationTest('Guided proposals fence Thinking Origin at publication and after persisted reload', async () => {
  for(const stage of ['publication','acceptance','reload']) {
    const {repo,app}=fixture('en'), n=await topicNote(repo,'Guided origin');
    await repo.updateNote(n.path,{thinkingOrigin:'Old analogy'});
    const {VisualAgentMapView}=load('main.ts',{obsidian});const deferredResult=deferred();let view,accept,error;
    const plugin=withExpansionCoordinator({repo,settings:{...DEFAULT_SETTINGS,language:'en'},running:new Set(),activeTasks:new Map(),quickExpandPending:new Set(),pendingSuggestions:new Map(),pendingResearchOptions:new Map(),mutate:work=>work(),views:()=>[view],askModel:(_context,_model,_reasoning,_signal,_exchange,accepted)=>{accepted?.();return deferredResult.promise;},recordFailure:(_label,e)=>e.message});
    view=new VisualAgentMapView({app},plugin);view.map=map([n]);view.render=()=>{};view.hydrate=async()=>{};
    const modalController=new AbortController(); let accepted=false;
    const task=view.proposeChildren(n,{referenceGroups:[],shallowResearch:true,signal:modalController.signal,onProgress:()=>assert.fail('closed modal progress callback used')},'Explore',(_items,create)=>{accept=create;},message=>{error=message;},()=>{accepted=true;});
    await until(()=>accepted);
    assert.equal(accepted,true); assert.equal(modalController.signal.aborted,false); assert.ok(plugin.activeTasks.has(n.path));
    if(stage==='publication')await repo.updateNote(n.path,{thinkingOrigin:'Corrected source'});
    deferredResult.resolve({summary:'',detail:'',suggestions:[{title:'Proposal',task:'Explore',contribution:'Understanding'}]});await task;
    assert.equal(plugin.activeTasks.has(n.path),false);
    if(stage==='publication'){assert.equal(accept,undefined);assert.equal(plugin.pendingSuggestions.size,0);assert.ok(error);continue;}
    const proposals=plugin.pendingSuggestions.get(n.path);
    const savedOptions=plugin.pendingResearchOptions.get(n.path);
    assert.equal(savedOptions.signal,undefined); assert.equal(savedOptions.onProgress,undefined);
    if(stage==='reload')plugin.pendingSuggestions.set(n.path,JSON.parse(JSON.stringify(proposals)));
    await repo.updateNote(n.path,{thinkingOrigin:'Corrected source'});
    if(stage==='reload')await view.proposeChildren(n,undefined,'',(_items,create)=>{accept=create;});
    await assert.rejects(accept(plugin.pendingSuggestions.get(n.path)),/changed|變更/);
    assert.equal(view.map.nodes.length,1);assert.equal(plugin.pendingSuggestions.size,0);
  }
});
