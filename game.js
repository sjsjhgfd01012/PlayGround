(() => {
  const SAVE_KEY = 'helios-foundry-save-v1';
  const TOTAL_SEGMENTS = 72;
  const recipes = {
    iron: {name:'Iron extractor', icon:'▰', color:'#d9a563', output:'IRON ORE', rate:1.25, power:5, cost:{iron:18,silicon:8}, description:'+1.25 ore / sec'},
    silicon: {name:'Silicon harvester', icon:'◆', color:'#9bbdef', output:'SILICON', rate:1.05, power:5, cost:{iron:14,silicon:12}, description:'+1.05 silicon / sec'},
    foundry: {name:'Alloy foundry', icon:'⬡', color:'#d0a6e2', output:'STRUCTURAL ALLOY', rate:.48, power:10, cost:{iron:24,silicon:10}, description:'Smelts iron into alloy'},
    solar: {name:'Solar forge', icon:'✦', color:'#f0ce72', output:'SOLAR CELLS', rate:.65, power:7, cost:{iron:18,silicon:15}, description:'Prints cells from silicon'},
    circuit: {name:'Circuit printer', icon:'▦', color:'#79d1a7', output:'PROCESSORS', rate:.18, power:8, cost:{iron:20,silicon:20}, description:'Builds orbital processors'},
    assembler: {name:'Shell assembler', icon:'◈', color:'#8de0da', output:'SHELL SEGMENTS', rate:.18, power:12, cost:{iron:25,silicon:20}, description:'Assembles Dyson shell segments'}
  };
  const initialState = () => ({resources:{iron:70,silicon:50,alloy:0,cells:0,processors:0,segments:0}, buildings:['iron','silicon',null,null,null,null], panels:0, cycle:1, elapsed:0, eventLog:[], muted:false});
  let state;
  try { state = Object.assign(initialState(), JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch { state = initialState(); }
  const defaults = initialState();
  state.resources = Object.assign(defaults.resources, state.resources || {});
  for (const key of Object.keys(defaults.resources)) {
    const value = Number(state.resources[key]);
    state.resources[key] = Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  state.buildings = Array.isArray(state.buildings) ? state.buildings.slice(0,6) : defaults.buildings;
  while (state.buildings.length < 6) state.buildings.push(null);
  state.buildings = state.buildings.map(type => recipes[type] ? type : null);
  state.panels = Math.max(0, Math.min(TOTAL_SEGMENTS, Math.floor(Number(state.panels) || 0)));
  state.elapsed = Math.max(0, Number.isFinite(Number(state.elapsed)) ? Number(state.elapsed) : 0);
  state.cycle = Math.floor(state.elapsed / 60) + 1;
  state.eventLog = Array.isArray(state.eventLog) ? state.eventLog.filter(entry => entry && typeof entry.message === 'string' && !/Cycle 000/.test(entry.message) && /^\d{2}:\d{2}$/.test(entry.stamp)) : [];
  let lastTime = performance.now(), saveTimer = 0, toastTimer;
  const $ = id => document.getElementById(id);
  const names = {iron:'iron ore',silicon:'silicon',alloy:'structural alloy',cells:'solar cells',processors:'processors',segments:'shell segments'};
  const ratesEl = {iron:$('iron-rate'),silicon:$('silicon-rate'),alloy:$('alloy-rate'),cells:$('cells-rate'),processors:$('processors-rate')};
  const number = n => Number(n).toLocaleString('en-US',{maximumFractionDigits:n < 10 ? 1 : 0});
  function log(message, timeLabel='SYS') {
    const stamp = timeLabel === 'SYS' ? `${String(Math.floor(state.elapsed/60)).padStart(2,'0')}:${String(Math.floor(state.elapsed%60)).padStart(2,'0')}` : timeLabel;
    state.eventLog.unshift({stamp,message}); state.eventLog = state.eventLog.slice(0,4); renderLog(); save();
  }
  if (!state.eventLog.length) state.eventLog.push({stamp:'00:00',message:'<b>Foundry initialized.</b> Two extraction facilities online.'});
  function renderLog() {
    $('activity-list').innerHTML = state.eventLog.map(e=>`<div class="activity-item"><time>${e.stamp}</time><p>${e.message}</p></div>`).join('') || '<div class="activity-item"><time>00:00</time><p>Foundry network initialized.</p></div>';
    $('log-count').textContent = String(Math.max(1,state.eventLog.length)).padStart(2,'0');
  }
  function canAfford(cost) { return Object.entries(cost).every(([key,value])=>state.resources[key] >= value); }
  function renderBuildOptions() {
    $('build-options').innerHTML = Object.entries(recipes).map(([key,r])=>{
      const available=state.buildings.includes(null), affordable=canAfford(r.cost);
      return `<button class="build-option" data-build="${key}" ${!available||!affordable?'disabled':''} title="${r.description}"><span class="option-icon" style="color:${r.color}">${r.icon}</span><span class="option-info"><b>${r.name}</b><small>${r.description}</small></span><span class="option-cost"><span>${r.cost.iron} Fe</span><span>${r.cost.silicon} Si</span></span></button>`;
    }).join('');
    document.querySelectorAll('[data-build]').forEach(button=>button.addEventListener('click',()=>build(button.dataset.build)));
  }
  function renderBuildings() {
    $('facility-grid').innerHTML=state.buildings.map((type,index)=>{
      if(!type || !recipes[type]) return `<div class="facility-card empty"><span class="empty-plus">＋</span><small>OPEN SLOT 0${index+1}</small></div>`;
      const r=recipes[type];
      const output=type==='foundry'?'1.8 Fe → 0.48 alloy/s':type==='solar'?'1.0 Si → 0.65 cells/s':type==='circuit'?'0.55 Si + 0.18 alloy → chips':type==='assembler'?'2.5 alloy + cells + chips → shell':r.description;
      return `<div class="facility-card" style="--accent:${r.color}"><div class="facility-top"><span class="facility-icon" style="color:${r.color}">${r.icon}</span><span class="facility-badge">● ONLINE</span></div><h3>${r.name}</h3><span class="facility-output">${output}</span><span class="facility-state">AUTO</span></div>`;
    }).join('');
    const count=state.buildings.filter(Boolean).length, free=6-count;
    $('active-facilities').innerHTML=`${count}<small> / 6</small>`;
    $('slots-label').textContent=`${free} FREE SLOT${free===1?'':'S'}`;
  }
  function facilityRates() {
    const rates={iron:0,silicon:0,alloy:0,cells:0,processors:0,segments:0};
    const count=type=>state.buildings.filter(x=>x===type).length;
    // Raw-material extraction runs from inexhaustible planetary and asteroid deposits.
    rates.iron += count('iron')*1.25; rates.silicon += count('silicon')*1.05;
    // Conversion lines have input caps; this keeps the production chain physically coherent.
    let foundry=count('foundry')*.48;
    foundry=Math.min(foundry,state.resources.iron/3.75);
    rates.iron-=foundry*3.75;
    rates.alloy+=foundry;
    let solar=count('solar')*.65;
    solar=Math.min(solar,state.resources.silicon/(1/.65));
    rates.silicon-=solar/.65;
    rates.cells+=solar;
    let circuit=count('circuit')*.18;
    circuit=Math.min(circuit,state.resources.silicon/(.55/.18),state.resources.alloy);
    rates.silicon-=circuit*(.55/.18); rates.alloy-=circuit; rates.processors+=circuit;
    let assembler=count('assembler')*.18;
    assembler=Math.min(assembler,state.resources.alloy/2.5,state.resources.cells/2,state.resources.processors);
    rates.alloy-=assembler*2.5; rates.cells-=assembler*2; rates.processors-=assembler; rates.segments+=assembler;
    return rates;
  }
  function build(type) {
    const r=recipes[type], slot=state.buildings.indexOf(null);
    if(!r || slot<0 || !canAfford(r.cost)) return;
    for(const [key,value] of Object.entries(r.cost)) state.resources[key]-=value;
    state.buildings[slot]=type;
    log(`<b>${r.name}</b> commissioned in slot 0${slot+1}.`);
    showToast(`${r.name.toUpperCase()} COMMISSIONED`); render();
  }
  function deploy() {
    if(state.resources.segments<1 || state.panels>=TOTAL_SEGMENTS) return;
    state.resources.segments-=1; state.panels++;
    const milestone=state.panels===24||state.panels===48||state.panels===72;
    if(state.panels===72){
      log('<b>Dyson sphere complete.</b> Helios is now a star of your making.');
      $('directive').textContent='A star, made yours'; $('directive-sub').textContent='Dyson sphere complete · civilization secured';
      showToast('DYSON SPHERE COMPLETE — HELIOS IS YOURS');
    } else if(milestone){
      const ring=state.panels===24?'inner':state.panels===48?'mid':'outer';
      log(`<b>${ring[0].toUpperCase()+ring.slice(1)} ring complete.</b> Orbital lattice synchronized.`);
      $('directive').textContent=state.panels===24?'Expand the shell':'Complete the stellar lattice';
      $('directive-sub').textContent=state.panels===24?'Begin the middle ring · 48 segments remain':'Only one ring remains · 24 segments to go';
      showToast(`${ring.toUpperCase()} RING SYNCHRONIZED`);
    } else {log(`<b>Shell segment ${String(state.panels).padStart(2,'0')} deployed.</b> Lattice locked into orbit.`);}
    render(); draw(); save();
  }
  function showToast(message) {const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500);}
  function render() {
    for(const key of ['iron','silicon','alloy','cells','processors']) $(key).textContent=number(state.resources[key]);
    $('cycle').textContent=String(Math.floor(state.elapsed/60)+1).padStart(3,'0');
    const rates=facilityRates();
    for(const key of Object.keys(ratesEl)){const value=rates[key];ratesEl[key].textContent=`${value>=0?'+':''}${value.toFixed(1)}/s`;ratesEl[key].style.color=value<0?'#d88b79':value>0?'#74c9a1':'#77869a';}
    const power=state.buildings.reduce((sum,type)=>sum+(type?recipes[type].power:0),0);
    $('power').textContent=power; $('energy-output').textContent=Math.max(0,80-power);
    $('power-fill').style.width=`${Math.min(100,power/80*100)}%`;
    $('efficiency').innerHTML=`${power>80?Math.floor(80/power*100):100}<small>%</small>`;
    $('progress-label').innerHTML=`${state.panels} <em>/ ${TOTAL_SEGMENTS} segments</em>`;
    $('progress-percent').textContent=`${Math.round(state.panels/TOTAL_SEGMENTS*100)}%`;
    $('progress-fill').style.width=`${state.panels/TOTAL_SEGMENTS*100}%`;
    for(let i=0;i<3;i++){const amount=Math.max(0,Math.min(24,state.panels-i*24));$(`ring-count-${i+1}`).textContent=`${amount}/24`;const el=$(`ring-${['one','two','three'][i]}`);el.classList.toggle('ring-current',state.panels<=(i+1)*24 && state.panels>=i*24);}
    const canDeploy=state.resources.segments>=1 && state.panels<TOTAL_SEGMENTS;
    $('deploy-button').disabled=!canDeploy;
    $('deploy-title').textContent=state.panels>=TOTAL_SEGMENTS?'Construction complete':canDeploy?'Segment ready for deployment':`${number(state.resources.segments)} segments in storage`;
    $('deploy-hint').textContent=canDeploy?'Launch a shell segment into the active orbital ring.':state.panels>=TOTAL_SEGMENTS?'Helios now powers an entire civilization.':'The assembler is fabricating shell segments automatically.';
    if(state.panels>=24 && state.panels<48){$('directive').textContent='Expand the shell';$('directive-sub').textContent='Build the middle ring · 48 segments remain';}
    if(state.panels>=48 && state.panels<72){$('directive').textContent='Complete the stellar lattice';$('directive-sub').textContent='Only one ring remains · 24 segments to go';}
    if(state.panels>=72){$('directive').textContent='A star, made yours';$('directive-sub').textContent='Dyson sphere complete · civilization secured';}
    renderBuildings();renderBuildOptions();renderLog();
  }
  function step(dt) {
    state.elapsed+=dt;
    const rates=facilityRates();
    // Apply resources in dependency order so newly made stock is available next frame.
    state.resources.iron=Math.max(0,state.resources.iron+rates.iron*dt);
    state.resources.silicon=Math.max(0,state.resources.silicon+rates.silicon*dt);
    state.resources.alloy=Math.max(0,state.resources.alloy+rates.alloy*dt);
    state.resources.cells=Math.max(0,state.resources.cells+rates.cells*dt);
    state.resources.processors=Math.max(0,state.resources.processors+rates.processors*dt);
    state.resources.segments=Math.max(0,Math.min(99,state.resources.segments+rates.segments*dt));
    // Advance a calibrated orbital cycle every minute of simulated factory time.
    if(Math.floor(state.elapsed/60)+1!==state.cycle){state.cycle=Math.floor(state.elapsed/60)+1;log(`<b>Cycle ${String(state.cycle).padStart(3,'0')}.</b> Foundry network remains online.`);}
    if(saveTimer>2){saveTimer=0;save();} else saveTimer+=dt;
  }
  function save() {try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));$('save-label').textContent='AUTOSAVE ON';}catch{$('save-label').textContent='LOCAL SAVE UNAVAILABLE';}}
  function reset() {if(!confirm('Reset the Helios foundry and erase this local save?')) return;localStorage.removeItem(SAVE_KEY);state=initialState();log('<b>Foundry reset.</b> New system initialized.','00:00');render();draw();showToast('NEW SIMULATION INITIALIZED');}
  $('deploy-button').addEventListener('click',deploy);
  $('reset-button').addEventListener('click',reset);
  $('sound-toggle').addEventListener('click',event=>{state.muted=!state.muted;event.currentTarget.style.color=state.muted?'#667488':'#81a1c3';event.currentTarget.title=state.muted?'Ambient animation paused':'Toggle ambient animation';});
  $('orbit-canvas').addEventListener('click',event=>{const c=event.currentTarget.getBoundingClientRect(),x=event.clientX-c.left-c.width/2,y=event.clientY-c.top-c.height/2;const d=Math.sqrt((x/(c.width*.30))**2+(y/(c.height*.39))**2);if(Math.abs(d-1)<.23)deploy();});

  const canvas=$('orbit-canvas'),ctx=canvas.getContext('2d');let canvasW=0,canvasH=0,stars=[];
  function resizeCanvas(){const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvasW=rect.width;canvasH=rect.height;canvas.width=Math.floor(rect.width*dpr);canvas.height=Math.floor(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);stars=Array.from({length:62},()=>({x:Math.random()*canvasW,y:Math.random()*canvasH,r:Math.random()*1.1+.2,a:Math.random()*.38+.12}));draw();}
  function draw(){if(!ctx||!canvasW)return;ctx.clearRect(0,0,canvasW,canvasH);const cx=canvasW*.5,cy=canvasH*.52,rx=Math.min(canvasW*.32,180),ry=Math.min(canvasH*.42,111),t=state.muted?0:performance.now()*.000035;
    for(const s of stars){ctx.fillStyle=`rgba(166,193,222,${s.a})`;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();}
    // Faint planetary paths establish scale around the central star.
    for(let ring=0;ring<3;ring++){const k=[.44,.69,1][ring];ctx.beginPath();ctx.ellipse(cx,cy,rx*k,ry*k,-.23,0,Math.PI*2);ctx.strokeStyle=ring===2?'rgba(130,166,206,.24)':'rgba(103,132,165,.13)';ctx.lineWidth=1;ctx.setLineDash(ring===2?[2,4]:[1,5]);ctx.stroke();ctx.setLineDash([]);}
    // Outer shell segment lattice; each panel is a discrete piece of the growing megastructure.
    for(let ring=0;ring<3;ring++){
      const k=[.44,.69,1][ring],count=Math.max(0,Math.min(24,state.panels-ring*24));
      for(let j=0;j<24;j++){
        const a=(j/24)*Math.PI*2+t+ring*.18-.25,px=cx+Math.cos(a)*rx*k,py=cy+Math.sin(a)*ry*k;
        ctx.save();ctx.translate(px,py);ctx.rotate(a+.3);
        ctx.beginPath();ctx.roundRect(-3.9,-1.7,7.8,3.4,1);
        if(j<count){ctx.fillStyle='#edbd79';ctx.shadowColor='#efa94f';ctx.shadowBlur=6;ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#ffdda0';ctx.lineWidth=.5;ctx.stroke();}
        else if(j===count && ring===Math.floor(state.panels/24) && state.panels<TOTAL_SEGMENTS){ctx.fillStyle='#8bb9f4';ctx.shadowColor='#74baff';ctx.shadowBlur=9;ctx.fill();ctx.shadowBlur=0;}
        else {ctx.strokeStyle='rgba(120,147,179,.42)';ctx.lineWidth=.7;ctx.stroke();}
        ctx.restore();
      }
      if(ring===0){ctx.beginPath();ctx.ellipse(cx,cy,rx*k,ry*k,-.23,0,Math.PI*2);ctx.strokeStyle='rgba(239,185,111,.18)';ctx.lineWidth=4;ctx.stroke();}
    }
    // Star glow and corona.
    const glow=ctx.createRadialGradient(cx,cy,2,cx,cy,47);glow.addColorStop(0,'rgba(255,230,174,.9)');glow.addColorStop(.12,'rgba(255,193,108,.52)');glow.addColorStop(.42,'rgba(239,139,71,.16)');glow.addColorStop(1,'rgba(239,139,71,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,47,0,Math.PI*2);ctx.fill();
    const star=ctx.createRadialGradient(cx-4,cy-5,1,cx,cy,14);star.addColorStop(0,'#fff6d8');star.addColorStop(.34,'#ffd48a');star.addColorStop(1,'#e98a4e');ctx.fillStyle=star;ctx.beginPath();ctx.arc(cx,cy,11,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(255,220,155,.34)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy,16,0,Math.PI*2);ctx.stroke();
  }
  let uiAccumulator=0;
  function frame(now){const dt=Math.min(.25,(now-lastTime)/1000);lastTime=now;step(dt);uiAccumulator+=dt;if(uiAccumulator>=.2){uiAccumulator=0;render();}draw();requestAnimationFrame(frame);}
  window.addEventListener('resize',resizeCanvas);
  render();resizeCanvas();requestAnimationFrame(frame);
})();
