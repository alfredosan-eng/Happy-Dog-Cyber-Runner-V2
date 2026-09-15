(() => {
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const GROUND = 414;

const C = {
  blue:'#4285F4', red:'#EA4335', yellow:'#FBBC05', green:'#34A853',
  ink:'#0b1020', white:'#ffffff', cyan:'#76e4ff', purple:'#a78bfa',
  road:'#252b38', road2:'#303746', dark:'#101827', glass:'#ffffff14'
};

const DIFFICULTIES = [
  {name:'EASY', speed:.85, enemy:0.75, desc:'More forgiving'},
  {name:'NORMAL', speed:1.0, enemy:1.0, desc:'Balanced challenge'},
  {name:'HARD', speed:1.25, enemy:1.35, desc:'Fast and intense'}
];

let state='menu', diff=1, dogChoice=0, soundOn=true, score=0, bonesCollected=0, lives=3;
let frame=0, distance=0, combo=0, comboTimer=0, level=1, best=Number(localStorage.getItem('happyDogV2Best')||0);
let last=performance.now(), paused=false;
let spawnTimer=0, boneTimer=0, powerTimer=0;

const DOGS = [
  {name:'Sunny', breed:'Golden Retriever', collar:C.blue, body:'#f0c27b', ear:'#a7663f', accent:C.blue},
  {name:'Echo', breed:'Husky', collar:C.yellow, body:'#dbe4ee', ear:'#566579', accent:C.yellow},
  {name:'Bean', breed:'Corgi', collar:C.green, body:'#d98d4f', ear:'#8b4d2c', accent:C.green},
  {name:'Byte', breed:'Cyber Dog', collar:C.red, body:'#b8c1cc', ear:'#4b5563', accent:C.red}
];
const dog = {x:145, y:GROUND-72, w:78, h:62, vy:0, grounded:true, invuln:0, magnet:0, shield:0, turbo:0, step:0};
const bones=[], hazards=[], particles=[], powerups=[], popups=[], clouds=[];
const farBuildings=[], nearBuildings=[], planes=[];
for(let i=0;i<3;i++) planes.push({x:W+180+i*1150,y:55+rand(0,90),s:.85+Math.random()*.25});
for(let i=0;i<18;i++)farBuildings.push({x:i*82+rand(-25,20),w:rand(48,88),h:rand(60,135),kind:Math.random()});
for(let i=0;i<12;i++)nearBuildings.push({x:i*112+rand(-25,25),w:rand(62,116),h:rand(110,205),kind:Math.random()});

for(let i=0;i<10;i++) clouds.push({x:i*125+Math.random()*90,y:55+Math.random()*115,s:0.55+Math.random()*.65,w:95+Math.random()*85});

function audioCtx(){ if(!audioCtx.ctx) audioCtx.ctx=new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.ctx.state==='suspended')audioCtx.ctx.resume(); return audioCtx.ctx; }
function beep(freq=440,d=.08,type='square',gain=.045,delay=0){
  if(!soundOn)return;
  const a=audioCtx(), o=a.createOscillator(), g=a.createGain(), t=a.currentTime+delay;
  o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(g).connect(a.destination);o.start(t);o.stop(t+d);
}

let bgm = null;
function startMusic(){
  if(!bgm){ bgm=new Audio('assets/sounds/happy-dog-v1-bgm.mp3'); bgm.loop=true; bgm.volume=.34; }
  if(soundOn) bgm.play().catch(()=>{});
}

function sBone(){beep(620,.06,'sine',.07);beep(880,.09,'sine',.06,.055)}
function sGold(){beep(660,.06,'triangle',.08);beep(990,.06,'triangle',.08,.06);beep(1320,.12,'triangle',.07,.12)}
function sHit(){beep(180,.08,'sawtooth',.09);beep(90,.16,'square',.07,.07)}
function sJump(){beep(420,.08,'square',.045);beep(700,.08,'square',.03,.05)}
function sPower(){beep(500,.06,'triangle',.06);beep(800,.06,'triangle',.06,.06);beep(1100,.14,'triangle',.05,.12)}
function sLevel(){beep(523,.05,'square',.06);beep(659,.05,'square',.06,.05);beep(784,.08,'square',.06,.10)}
function sOver(){[220,196,165].forEach((f,i)=>beep(f,.18,'sawtooth',.06,i*.16))}
function sClick(){beep(520,.05,'square',.04)}

function rr(x,y,w,h,r=10){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function text(t,x,y,size=20,color=C.white,align='left',weight=700){ctx.font=`${weight} ${size}px system-ui`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(t,x,y)}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function rand(a,b){return a+Math.random()*(b-a)}

function resetGame(){
  score=0;bonesCollected=0;lives=3;frame=0;distance=0;combo=0;comboTimer=0;level=1;
  spawnTimer=0;boneTimer=0;powerTimer=0;
  dog.y=GROUND-dog.h;dog.vy=0;dog.grounded=true;dog.invuln=0;dog.magnet=0;dog.shield=0;dog.turbo=0;dog.step=0;
  bones.length=hazards.length=particles.length=powerups.length=popups.length=0;
}

function startGame(){ resetGame(); state='play'; paused=false; sClick(); startMusic(); }
function jump(){ if(state==='play'&&!paused&&dog.grounded){dog.vy=-16.2;dog.grounded=false;sJump();} }

window.addEventListener('pointerdown', ()=>{ audioCtx(); startMusic(); }, {once:false});
window.addEventListener('keydown', ()=>{ audioCtx(); }, {once:false});

function goToMenu(){
  state='menu';
  paused=false;
  stopMusic();
  sClick();
}

window.addEventListener('keydown', e=>{
  if(['Space','ArrowUp'].includes(e.code))e.preventDefault();

  if(e.code==='Escape' && (state==='play'||state==='over')){
    goToMenu();
    return;
  }

  if(state==='menu'){
    if(e.code==='Enter'||e.code==='Space')startGame();
    if(e.code==='ArrowLeft'){diff=(diff+2)%3;sClick()}
    if(e.code==='ArrowRight'){diff=(diff+1)%3;sClick()}
    if(e.code==='KeyA'||e.code==='ArrowUp'){dogChoice=(dogChoice+DOGS.length-1)%DOGS.length;sClick()}
    if(e.code==='KeyD'||e.code==='ArrowDown'){dogChoice=(dogChoice+1)%DOGS.length;sClick()}
    if(e.code==='KeyM'){toggleSound()}
  } else if(state==='play'){
    if(e.code==='Space'||e.code==='ArrowUp')jump();
    if(e.code==='KeyP'){paused=!paused;sClick()}
    if(e.code==='KeyM'){toggleSound()}
  } else if(state==='over'){
    if(e.code==='Enter'||e.code==='Space')startGame();
  }
});

canvas.addEventListener('pointerdown',e=>{
  audioCtx();
  const r=canvas.getBoundingClientRect(), x=(e.clientX-r.left)*W/r.width, y=(e.clientY-r.top)*H/r.height;
  if(state==='menu'){
    if(x>W-130&&y>8&&y<42){toggleSound();return;}
    if(y>442&&y<505)startGame();
    if(y>180&&y<255){const i=clamp(Math.floor((x-(W/2-210))/140),0,3);dogChoice=i;sClick();}
  } else if(state==='play') {
    if(x>W-120&&y>86&&y<125){toggleSound();return;}
    jump();
  }
  else if(state==='over'){
    if(y>355&&y<425)startGame();
  }
});

function addParticles(x,y,color,n=0){
  // Particles intentionally disabled for collectible/life feedback.
}
function popup(t,x,y,color=C.white){popups.length=0;popups.push({t,x:W/2,y:116,life:55,color})}
function rectHit(a,b,pad=7){return a.x+pad<b.x+b.w-pad&&a.x+a.w-pad>b.x+pad&&a.y+pad<b.y+b.h-pad&&a.y+a.h-pad>b.y+pad}

function spawnBone(){
  const gold=Math.random()<.12;
  bones.push({x:W+30,y:Math.random()<.55?GROUND-30:GROUND-115,w:32,h:18,gold});
}
function spawnHazard(){
  const r=Math.random(), type=r<.42?'car':r<.64?'taxi':r<.82?'bus':r<.92?'moto':'sweeper';
  const h=type==='bus'?46:type==='sweeper'?32:type==='moto'?31:34;
  const y=GROUND-h;
  const w=type==='bus'?74:type==='sweeper'?62:type==='moto'?42:52;
  hazards.push({x:W+40,y,w,h,type,phase:Math.random()*6.28,hit:false});
}
function spawnPower(){
  const types=['shield','magnet','life'];
  powerups.push({x:W+30,y:GROUND-95-rand(0,80),w:28,h:28,type:types[Math.floor(Math.random()*types.length)]});
}

function speed(){
  const base=5.2*DIFFICULTIES[diff].speed;
  const levelRamp=1+Math.min(0.32,(level-1)*0.04);
  return base*levelRamp;
}

function update(dt){
  if(state!=='play'||paused)return;
  frame++;distance+=speed()*dt*60/1000; dog.step+=(dog.grounded?0.32:0.10)*(dt/16.67); if(!Number.isFinite(dog.step))dog.step=0;
  const newLevel=1+Math.floor(bonesCollected/20);
  if(newLevel>level){level=newLevel;sLevel();popup(`LEVEL ${level}`,W/2,116,C.yellow);}

  dog.invuln=Math.max(0,dog.invuln-dt);
  dog.magnet=Math.max(0,dog.magnet-dt);
  dog.shield=Math.max(0,dog.shield-dt);
    comboTimer=Math.max(0,comboTimer-dt);
  if(comboTimer<=0)combo=0;

  dog.vy+=0.84; dog.y+=dog.vy;
  if(dog.y>=GROUND-dog.h){dog.y=GROUND-dog.h;dog.vy=0;dog.grounded=true}

  const sp=speed();
  spawnTimer-=dt; boneTimer-=dt; powerTimer-=dt;
  const difficulty=DIFFICULTIES[diff];
  if(spawnTimer<=0){spawnHazard();spawnTimer=rand(1050,1550)/difficulty.enemy/(1+level*.03)}
  if(boneTimer<=0){spawnBone();boneTimer=rand(420,720)/(1+level*.06)}
  if(powerTimer<=0){spawnPower();powerTimer=rand(5200,8500)}

  const magnetX=dog.x+dog.w/2;
  for(const b of bones){
    b.x-=sp;
    if(dog.magnet>0){
      const dx=magnetX-(b.x+b.w/2),dy=(dog.y+dog.h/2)-(b.y+b.h/2);
      if(Math.hypot(dx,dy)<190){b.x+=clamp(dx*.055,-6,6);b.y+=clamp(dy*.055,-5,5)}
    }
  }
  for(const h of hazards){h.x-=sp*(h.type==='moto'?1.18:h.type==='sweeper'?0.82:1);h.phase+=.05}
  for(const p of powerups)p.x-=sp;

  // Generous gameplay hitbox: covers the dog's body/head so visual contact reliably counts.
  const dr={x:dog.x+5,y:dog.y+4,w:dog.w-6,h:dog.h-5};

  for(let i=bones.length-1;i>=0;i--){
    const b=bones[i];
    if(rectHit(dr,b,5)){
      bones.splice(i,1);bonesCollected++;
      const mult=Math.min(5,1+Math.floor(combo/5));
      combo++;comboTimer=1600;
      const pts=(b.gold?25:10)*mult;
      score+=pts;
      popup(`+${pts} 🦴`,b.x,b.y-10,b.gold?C.yellow:C.cyan);
      b.gold?sGold():sBone();
    } else if(b.x+b.w<-20)bones.splice(i,1);
  }

  for(let i=powerups.length-1;i>=0;i--){
    const p=powerups[i];
    if(rectHit(dr,p,2)){
      powerups.splice(i,1);sPower();if(p.type==='shield')dog.shield=6000;
      if(p.type==='magnet')dog.magnet=7000;
      if(p.type==='life'){lives=Math.min(10,lives+1);}
            
      popup(powerLabel(p.type),p.x,p.y-12,pColor(p.type));
    } else if(p.x+p.w<-20)powerups.splice(i,1);
  }

  if(dog.invuln<=0){
    for(const h of hazards){
      if(h.hit) continue;

      // All V2 traffic hazards occupy the road. Register a hit whenever
      // their horizontal footprint reaches the dog's lane.
      const dogLeft=dog.x+15;
      const dogRight=dog.x+dog.w-11;
      // Only the lower body/feet count as the player's hit area.
      // This makes jumping over short vehicles much more forgiving.
      const dogTop=dog.y+dog.h*0.42;
      const dogBottom=dog.y+dog.h-4;

      const inset = h.type==='bus' ? 10 :
                    h.type==='sweeper' ? 11 :
                    h.type==='moto' ? 8 : 9;
      const hazardLeft=h.x+inset;
      const hazardRight=h.x+h.w-inset;
      const hazardTop=h.y+6;
      const hazardBottom=h.y+h.h;

      const horizontalContact =
        hazardLeft < dogRight &&
        hazardRight > dogLeft;
      const verticalContact =
        hazardTop < dogBottom &&
        hazardBottom > dogTop;

      if(horizontalContact && verticalContact){
        h.hit=true;

        if(dog.shield>0){
          dog.shield=0;
          popup('SHIELD BLOCK!',W/2,116,C.green);
          sHit();
        } else {
          lives=Math.max(0,lives-1);
          dog.invuln=1400;
          combo=0;
          comboTimer=0;
          sHit();
          popup('-1 LIFE',W/2,116,C.red);
          if(lives<=0){endGame();return}
        }
      }
    }
  }

  for(let i=popups.length-1;i>=0;i--){popups[i].life--;if(popups[i].life<=0)popups.splice(i,1)}
  for(let i=hazards.length-1;i>=0;i--)if(hazards[i].x+hazards[i].w<-30)hazards.splice(i,1);
}

function endGame(){best=Math.max(best,score);localStorage.setItem('happyDogV2Best',best);state='over';sOver()}

function pColor(t){return t==='shield'?C.green:t==='magnet'?C.blue:t==='turbo'?C.red:C.yellow}
function powerLabel(t){return t==='shield'?'🛡 SHIELD':t==='magnet'?'🧲 MAGNET':'🩷 +1 LIFE'}


function updatePlanes(dt){
  for(const p of planes){
    p.x -= 0.78*p.s*(dt/16.67);
    if(p.x < -130){
      p.x = W + rand(500,1100);
      p.y = 65 + rand(0,90);
      p.s = .82 + Math.random()*.28;
    }
  }
}
function drawPlane(p){
  ctx.save();
  ctx.translate(p.x,p.y);
  ctx.scale(p.s,p.s);

  // High-contrast aircraft silhouette so it remains distinguishable from clouds.
  ctx.globalAlpha=.98;

  // Contrail behind the plane.
  ctx.strokeStyle='#94a3b8';
  ctx.lineWidth=2.5;
  ctx.beginPath();
  ctx.moveTo(-28,7);ctx.lineTo(-76,7);
  ctx.stroke();

  // Dark outline.
  ctx.fillStyle='#334155';
  ctx.beginPath();
  ctx.moveTo(-18,-1);ctx.lineTo(24,-1);ctx.lineTo(36,5);
  ctx.lineTo(23,11);ctx.lineTo(-18,11);
  ctx.closePath();
  ctx.fill();

  // Bright fuselage.
  ctx.fillStyle='#f8fafc';
  ctx.beginPath();
  ctx.moveTo(-16,1);ctx.lineTo(22,1);ctx.lineTo(32,5);
  ctx.lineTo(21,8);ctx.lineTo(-16,8);
  ctx.closePath();
  ctx.fill();

  // Upper wing.
  ctx.fillStyle='#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(-2,1);ctx.lineTo(-21,-13);ctx.lineTo(-6,-10);ctx.lineTo(11,2);
  ctx.closePath();
  ctx.fill();

  // Lower wing.
  ctx.beginPath();
  ctx.moveTo(7,8);ctx.lineTo(-8,18);ctx.lineTo(5,15);ctx.lineTo(15,8);
  ctx.closePath();
  ctx.fill();

  // Tail fin.
  ctx.fillStyle=C.red;
  ctx.beginPath();
  ctx.moveTo(-15,2);ctx.lineTo(-25,-9);ctx.lineTo(-11,-5);ctx.lineTo(-6,2);
  ctx.closePath();
  ctx.fill();

  // Blue nose light.
  ctx.fillStyle=C.blue;
  ctx.beginPath();ctx.arc(23,4.5,2.8,0,Math.PI*2);ctx.fill();

  // Cabin windows.
  ctx.fillStyle='#1e3a8a';
  for(let i=0;i<4;i++){
    ctx.beginPath();
    ctx.arc(-3+i*6,4.5,1.5,0,Math.PI*2);
    ctx.fill();
  }

  ctx.restore();
}

function bg(){
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#dbeafe');g.addColorStop(.58,'#f8fafc');g.addColorStop(1,'#cbd5e1');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  clouds.forEach(c=>{c.x-=.10*c.s;if(c.x+c.w<0)c.x=W+20;ctx.fillStyle='#ffffffb8';for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(c.x+i*24,c.y+(i%2)*6,22,0,Math.PI*2);ctx.fill();}});
  // Aircraft move slowly across the sky.
  updatePlanes(16.67);
  planes.forEach(drawPlane);

  // Deterministic parallax: positions are derived from frame so motion is always visible.
  const farShift=(frame*.42)%180, nearShift=(frame*1.15)%220;
  function building(x,w,h,i,alpha){const top=GROUND-h;ctx.fillStyle=i%4===0?'#d7dee8':i%4===1?'#c6d0dc':i%4===2?'#e4e9ef':'#b8c4d2';ctx.globalAlpha=alpha;ctx.fillRect(x,top,w,h);ctx.globalAlpha=1;for(let wy=0;wy<5;wy++)for(let wx=0;wx<3;wx++){if((i+wx+wy)%3!==0){ctx.fillStyle=[C.blue,C.red,C.yellow,C.green][(i+wy)%4]+'66';ctx.fillRect(x+10+wx*22,top+20+wy*25,11,13);}}}
  for(let i=-2;i<14;i++){const x=i*180+60-farShift;const h=80+((i*37)%85+85)%85;building(x,100,h,i,.92);}
  for(let i=-2;i<12;i++){const x=i*220+25-nearShift;const h=145+((i*71)%120+120)%120;building(x,125,h,i+20,1);}
  ctx.fillStyle=C.road;ctx.fillRect(0,GROUND,W,H-GROUND);ctx.fillStyle='#fff';for(let x=-20;x<W;x+=110)ctx.fillRect(x,GROUND+72,62,7);
  const seg=48;for(let i=0;i<20;i++){ctx.fillStyle=[C.blue,C.red,C.yellow,C.green][i%4];ctx.fillRect(i*seg,GROUND-8,seg,8);}
}
function dogDraw(){
  const d=DOGS[dogChoice];
  const phase=dog.step || 0;
  const walk=Math.sin(phase);
  const bob=dog.grounded ? Math.sin(phase*2)*1.4 : 0;

  ctx.save();
  ctx.translate(dog.x,dog.y+bob);

  if(dog.invuln>0&&Math.floor(frame/5)%2===0)ctx.globalAlpha=.45;

  // Ground shadow
  ctx.globalAlpha*=.55;
  ctx.fillStyle='#0004';
  ctx.beginPath();ctx.ellipse(39,61,35,7,0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;

  // Body
  ctx.fillStyle=d.body;
  rr(15,20,48,30,15);ctx.fill();

  // Rear leg
  ctx.save();
  ctx.translate(23,44);
  ctx.rotate(dog.grounded ? -walk*.22 : 0);
  ctx.fillStyle=d.ear;
  ctx.fillRect(-3,0,7,16);
  ctx.restore();

  // Front leg
  ctx.save();
  ctx.translate(55,44);
  ctx.rotate(dog.grounded ? walk*.22 : 0);
  ctx.fillStyle=d.ear;
  ctx.fillRect(-3,0,7,16);
  ctx.restore();

  // Small rear paw highlights to make the stride more readable
  if(dog.grounded){
    ctx.fillStyle=d.ear;
    ctx.fillRect(17+walk*2,57,10,3);
    ctx.fillRect(49-walk*2,57,10,3);
  }

  // Tail at rear/left
  ctx.save();
  ctx.translate(18,29);
  ctx.rotate(Math.sin(phase*1.4)*.08);
  ctx.strokeStyle=d.ear;ctx.lineWidth=6;
  ctx.beginPath();
  ctx.moveTo(0,0);
  ctx.quadraticCurveTo(-13,-11,-9,-24);
  ctx.stroke();
  ctx.restore();

  // Neck + head clearly facing right
  ctx.fillStyle=d.body;
  rr(46,7,33,34,13);ctx.fill();

  // Ears
  ctx.fillStyle=d.ear;
  if(dogChoice===0){
    ctx.beginPath();ctx.ellipse(53,7,7,15,.35,0,Math.PI*2);ctx.fill();
  }else if(dogChoice===1){
    ctx.beginPath();ctx.moveTo(52,10);ctx.lineTo(56,-2);ctx.lineTo(63,10);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(68,9);ctx.lineTo(75,-1);ctx.lineTo(79,12);ctx.closePath();ctx.fill();
  }else if(dogChoice===2){
    ctx.beginPath();ctx.ellipse(52,5,7,11,.35,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(73,7,6,10,-.15,0,Math.PI*2);ctx.fill();
  }else{
    ctx.fillRect(52,2,8,9);ctx.fillRect(68,1,8,10);
  }

  // Eye and forward snout
  ctx.fillStyle=C.ink;
  ctx.beginPath();ctx.arc(68,18,2.8,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=d.body;
  rr(65,22,19,12,6);ctx.fill();
  ctx.fillStyle=d.ear;
  ctx.beginPath();ctx.arc(82,27,2.6,0,Math.PI*2);ctx.fill();

  // Collar + tag
  ctx.fillStyle=d.collar;ctx.fillRect(47,32,27,6);
  ctx.fillStyle=C.yellow;ctx.beginPath();ctx.arc(61,38,3.5,0,Math.PI*2);ctx.fill();

  // Accessories
  if(dogChoice===1){ctx.fillStyle=C.red;rr(52,1,16,5,3);ctx.fill();}
  if(dogChoice===2){
    // Bean uses a simple collar band; the face stays unobstructed.
    ctx.fillStyle=C.green;
    ctx.fillRect(47,32,27,5);
    ctx.fillStyle=C.yellow;
    ctx.beginPath();ctx.arc(61,38,3,0,Math.PI*2);ctx.fill();
  }
  if(dogChoice===3){
    ctx.fillStyle=C.yellow;ctx.fillRect(51,0,6,4);
    ctx.fillStyle=C.blue;ctx.fillRect(58,0,6,4);
  }

  if(dog.shield>0){
    ctx.strokeStyle=C.green;ctx.lineWidth=3;
    ctx.globalAlpha=.7+.2*Math.sin(frame*.2);
    ctx.beginPath();ctx.arc(42,32,46,0,Math.PI*2);ctx.stroke();
  }

  ctx.restore();
}
function boneDraw(b){
  ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.sin(frame*.08+b.x*.01)*.12);
  ctx.fillStyle=b.gold?C.yellow:C.white;ctx.strokeStyle=b.gold?C.red:'#94a3b8';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(5,5);ctx.lineTo(27,10);ctx.lineTo(24,15);ctx.lineTo(3,10);ctx.closePath();ctx.fill();ctx.stroke();
  for(const x of [4,27]){ctx.beginPath();ctx.arc(x,5,5,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(x,11,5,0,Math.PI*2);ctx.fill();ctx.stroke()}
  ctx.restore();
}

function carDraw(h){
  const x=h.x,y=h.y;ctx.save();
  if(h.type==='moto'){
    ctx.fillStyle=C.red;
    ctx.beginPath();ctx.arc(x+11,y+h.h-4,5,0,Math.PI*2);ctx.arc(x+h.w-11,y+h.h-4,5,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=C.ink;ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(x+11,y+h.h-8);ctx.lineTo(x+21,y+10);ctx.lineTo(x+h.w-11,y+h.h-8);ctx.stroke();
    ctx.fillStyle=C.blue;rr(x+22,y+3,18,18,6);ctx.fill();ctx.fillStyle=C.yellow;ctx.fillRect(x+27,y,8,5);
  } else if(h.type==='sweeper'){
    ctx.fillStyle=C.green;rr(x,y+7,h.w,h.h-7,10);ctx.fill();ctx.fillStyle='#d1fae5';rr(x+18,y+1,h.w-36,19,7);ctx.fill();
    ctx.fillStyle=C.yellow;ctx.fillRect(x+7,y+h.h-7,20,4);ctx.fillRect(x+h.w-27,y+h.h-7,20,4);
    ctx.strokeStyle=C.red;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x+6,y+h.h-2);ctx.lineTo(x-4,y+h.h+6);ctx.stroke();
    ctx.fillStyle=C.ink;ctx.beginPath();ctx.arc(x+17,y+h.h-2,8,0,Math.PI*2);ctx.arc(x+h.w-17,y+h.h-2,8,0,Math.PI*2);ctx.fill();
  } else {
    const body=h.type==='bus'?C.blue:h.type==='taxi'?C.yellow:C.red;ctx.fillStyle=body;rr(x,y+12,h.w,h.h-12,10);ctx.fill();
    ctx.fillStyle='#dff4ff';rr(x+10,y+2,h.w-20,19,7);ctx.fill();ctx.fillStyle=C.ink;ctx.fillRect(x+15,y+6,14,9);ctx.fillRect(x+h.w-29,y+6,14,9);
    if(h.type==='taxi'){ctx.fillStyle=C.ink;ctx.fillRect(x+h.w*.42,y-1,17,6)}
    if(h.type==='bus'){ctx.fillStyle='#ffffffb8';for(let i=0;i<3;i++)ctx.fillRect(x+12+i*23,y+28,15,12)}
    ctx.fillStyle=C.ink;ctx.beginPath();ctx.arc(x+15,y+h.h-2,8,0,Math.PI*2);ctx.arc(x+h.w-15,y+h.h-2,8,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}
function powerDraw(p){
  ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle=pColor(p.type);ctx.shadowColor=pColor(p.type);ctx.shadowBlur=15;rr(0,0,p.w,p.h,8);ctx.fill();ctx.shadowBlur=0;
  text(p.type==='shield'?'S':p.type==='magnet'?'M':'❤',14,20,16,C.ink,'center',900);ctx.restore();
}

function drawHeart(x,y,s,color){ctx.save();ctx.translate(x,y);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,s*.9);ctx.bezierCurveTo(-s*1.45,-s*.05,-s*.9,-s*1.35,0,-s*.55);ctx.bezierCurveTo(s*.9,-s*1.35,s*1.45,-s*.05,0,s*.9);ctx.fill();ctx.restore();}
function hud(){
  ctx.fillStyle='#0b1020dd';rr(16,14,390,70,14);ctx.fill();
  text('🦴 '+bonesCollected,32,42,19,C.white);text('SCORE '+score,125,42,19,C.white);
  if(combo>1)text('x'+Math.min(5,1+Math.floor(combo/5))+' COMBO',255,42,17,C.yellow);
  text('LEVEL '+level+'  •  '+(bonesCollected%20)+'/20 BONES',32,66,11,'#cbd5e1','left',600);
  text('LIFE',W-185,29,11,'#f9a8d4','right',900);
  for(let i=0;i<lives;i++) drawHeart(W-164+i*15,29,6.5,'#f472b6');
  if(dog.magnet>0)text('🧲',W-255,63,17,C.white);
  if(dog.shield>0)text('🛡',W-225,63,17,C.white);
  ctx.fillStyle='#ffffff18';rr(W-110,58,92,25,8);ctx.fill();ctx.strokeStyle='#ffffff33';ctx.lineWidth=1;ctx.stroke();text(soundOn?'🔊 SOUND ON':'🔇 SOUND OFF',W-64,75,9,soundOn?C.green:C.red,'center',800);
  text('BEST '+best,W-18,108,10,'#cbd5e1','right',600);
}
function menu(){
  bg();
  ctx.fillStyle='#0b1020c9';
  ctx.fillRect(0,0,W,H);
  ctx.textAlign='center';

  // Brand
  [C.blue,C.red,C.yellow,C.green].forEach((c,i)=>{
    ctx.fillStyle=c;
    ctx.beginPath();ctx.arc(W/2-45+i*30,35,8,0,Math.PI*2);ctx.fill();
  });
  text('HAPPY DOG',W/2,76,42,C.white,'center',900);
  text('CYBER RUNNER V2',W/2,101,17,C.cyan,'center',800);

  // Sound toggle
  ctx.fillStyle='#ffffff12';
  rr(W-150,20,128,32,9);ctx.fill();
  ctx.strokeStyle=soundOn?C.green:C.red;ctx.stroke();
  text(soundOn?'🔊 SOUND ON':'🔇 SOUND OFF',W-86,42,10,soundOn?C.green:C.red,'center',800);

  // Dogs — centered group
  text('CHOOSE YOUR DOG',W/2,126,11,'#cbd5e1','center',800);
  DOGS.forEach((dd,i)=>{
    const x=W/2-352+i*176;
    const selected=i===dogChoice;
    ctx.fillStyle=selected?'#ffffff1c':'#ffffff09';
    rr(x,138,164,68,12);ctx.fill();
    ctx.strokeStyle=selected?dd.accent:'#ffffff24';
    ctx.lineWidth=selected?2:1;ctx.stroke();

    ctx.fillStyle=dd.body;
    ctx.beginPath();ctx.arc(x+38,171,20,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=dd.ear;
    ctx.beginPath();ctx.arc(x+27,160,6,0,Math.PI*2);ctx.arc(x+49,160,6,0,Math.PI*2);ctx.fill();
    text(dd.name,x+92,166,13,selected?dd.accent:C.white,'left',900);
    text(dd.breed,x+92,184,9,'#94a3b8','left',600);
  });

  text(`${DOGS[dogChoice].name} selected`,W/2,222,11,DOGS[dogChoice].accent,'center',800);

  // Difficulty — centered group
  text('DIFFICULTY',W/2,242,10,'#94a3b8','center',700);
  DIFFICULTIES.forEach((dd,i)=>{
    const x=W/2-285+i*195;
    const selected=diff===i;
    ctx.fillStyle=selected?pColorForDiff(i)+'30':'#ffffff0b';
    rr(x,250,180,34,9);ctx.fill();
    ctx.strokeStyle=selected?pColorForDiff(i):'#ffffff26';ctx.stroke();
    text(dd.name,x+90,273,12,selected?pColorForDiff(i):'#94a3b8','center',800);
  });

  // Power-ups — centered group
  text('POWER-UPS',W/2,309,10,'#cbd5e1','center',800);
  const powers=[
    ['🛡','Shield','Blocks 1 hit',C.green],
    ['🧲','Magnet','Pulls bones',C.blue],
    ['🩷','Life','+1 life (max 10)',C.yellow]
  ];
  powers.forEach((p,i)=>{
    const x=W/2-310+i*210;
    ctx.fillStyle='#ffffff10';rr(x,319,200,52,11);ctx.fill();
    text(p[0],x+22,352,18,p[3],'center',900);
    text(p[1],x+45,340,11,C.white,'left',800);
    text(p[2],x+45,356,9,'#94a3b8','left',600);
  });

  // Start
  ctx.fillStyle='#ffffff13';rr(W/2-145,390,290,58,15);ctx.fill();
  ctx.strokeStyle=C.blue;ctx.lineWidth=2;ctx.stroke();
  text('▶  START GAME',W/2,427,20,C.white,'center',900);

  // Controls + GitHub footer
  text('A / D or ↑ / ↓ = dog   ·   ← / → = difficulty   ·   M = sound',W/2,471,10,'#cbd5e1','center',600);
  text('SPACE = jump   ·   P = pause   ·   ESC = menu',W/2,489,10,'#94a3b8','center',600);
  text('github.com/alfredosan-eng/Happy-Dog-Cyber-Runner-V2',W/2,516,10,C.cyan,'center',700);

  ctx.textAlign='left';
}
function pColorForDiff(i){return [C.green,C.blue,C.red][i]}

function over(){
  bg();ctx.fillStyle='#0b1020cc';ctx.fillRect(0,0,W,H);
  ctx.textAlign='center';ctx.shadowColor=C.red;ctx.shadowBlur=24;text('GAME OVER',W/2,165,54,C.red,'center',900);
  text('(Thank you so much for playing my game)',W/2,192,12,'#f9a8d4','center',600);ctx.shadowBlur=0;
  text('🦴 BONES COLLECTED',W/2,215,18,C.white,'center',800);
  text(String(bonesCollected),W/2,255,42,C.yellow,'center',900);
  text('FINAL SCORE',W/2,295,14,'#cbd5e1','center',700);
  text(String(score),W/2,335,34,C.cyan,'center',900);
  text(score>=best?'NEW BEST!':'BEST '+best,W/2,365,13,score>=best?C.green:'#94a3b8','center',800);
  ctx.fillStyle='#ffffff12';rr(W/2-150,385,300,56,15);ctx.fill();ctx.strokeStyle=C.green;ctx.lineWidth=2;ctx.stroke();
  text('▶  NEXT GAME',W/2,421,20,C.white,'center',900);
  text('ENTER / SPACE = next game · ESC = menu',W/2,462,12,'#cbd5e1','center',600);ctx.textAlign='left';
}

function play(){
  bg();
  bones.forEach(boneDraw);
  hazards.forEach(carDraw);
  powerups.forEach(powerDraw);
  dogDraw();
  popups.forEach(p=>text(p.t,p.x,p.y,14,p.color,'center',900));
  hud();
  if(paused){ctx.fillStyle='#0b102088';ctx.fillRect(0,0,W,H);text('PAUSED',W/2,H/2,42,C.white,'center',900);text('Press P to continue',W/2,H/2+32,14,'#cbd5e1','center',600)}
}

function draw(){ if(state==='menu')menu(); else if(state==='play')play(); else over(); }

function loop(now){
  const dt=Math.min(32,now-last);last=now;update(dt);draw();requestAnimationFrame(loop)
}
requestAnimationFrame(loop);
})();
