
import React, { useEffect, useMemo, useRef, useState } from "react";

// SUPER ROGUELITE PLUS (with Boss, Shop, SFX)

export default function SuperRogueLitePlus() {
  const [screen, setScreen] = useState<"menu"|"playing"|"paused"|"gameover">("menu");
  const [difficulty, setDifficulty] = useState<"easy"|"normal"|"hard">("normal");
  const [fps, setFps] = useState(0);
  const [hint, setHint] = useState("WASD moverte • Clic disparar • Espacio dash • E interactuar • P pausa");
  const [sfxOn, setSfxOn] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const containerRef = useRef<HTMLDivElement|null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D|null>(null);
  const gameRef = useRef<Game|null>(null);
  const sfxRef = useRef<Sfx|null>(null);

  const DIFF = useMemo(() => ({
    easy:   { enemyHp: 16, enemyDmg: 6, spawn: 2.3, playerHp: 120 },
    normal: { enemyHp: 22, enemyDmg: 10, spawn: 1.8, playerHp: 100 },
    hard:   { enemyHp: 28, enemyDmg: 14, spawn: 1.4, playerHp: 80 },
  }), []);

  function ensureSfx() {
    if (!sfxRef.current) sfxRef.current = new Sfx();
    sfxRef.current?.resume?.();
  }

  function initNewGame() {
    ensureSfx();
    const opts = DIFF[difficulty];
    const g = createGame({
      width: 960,
      height: 600,
      tile: 24,
      enemyBaseHp: opts.enemyHp,
      enemyBaseDmg: opts.enemyDmg,
      spawnEvery: opts.spawn,
      playerMaxHp: opts.playerHp,
      difficulty,
    });
    g.playSfx = (name: string) => sfxOn && sfxRef.current?.play(name);
    gameRef.current = g;
    setScreen("playing");
    setHint("Derrota enemigos, vence al JEFE y entra al portal → siguiente nivel. Busca la TIENDA (E). ¡Suerte!");
  }

  function loadGame() {
    ensureSfx();
    const raw = localStorage.getItem("superRogueLiteSave");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const g = createGame(data.meta);
      if (data.state) restoreState(g, data.state);
      g.playSfx = (name: string) => sfxOn && sfxRef.current?.play(name);
      gameRef.current = g;
      setScreen("playing");
      setHint("Partida cargada ✨");
    } catch (e) {
      console.error(e); setHint("No se pudo cargar la partida");
    }
  }

  function saveGame() {
    const g = gameRef.current; if (!g) return;
    const payload = { meta: g.meta, state: snapshotState(g), version: 2, savedAt: Date.now() };
    localStorage.setItem("superRogueLiteSave", JSON.stringify(payload));
    setHint("Partida guardada ✔");
  }

  useEffect(() => {
    function resize(){
      const c = canvasRef.current, box = containerRef.current; if (!c || !box) return;
      const aspect = 960/600; const w = Math.min(box.clientWidth, 1200); const h = Math.round(w/aspect);
      c.style.width = w+"px"; c.style.height = h+"px";
    }
    resize(); window.addEventListener("resize", resize); return ()=>window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    function onGO(){ setScreen("gameover"); }
    window.addEventListener("gameover", onGO);
    return ()=>window.removeEventListener("gameover", onGO);
  }, []);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return; const ctx = c.getContext("2d"); if (!ctx) return; ctxRef.current = ctx;
    let last = performance.now(); let acc=0, frames=0; let req=0;
    const loop = (t:number)=>{
      const g = gameRef.current; const dt = Math.min((t-last)/1000, 0.05); last=t; acc+=dt; frames++; if (acc>=1){ setFps(frames); acc=0; frames=0; }
      if (g && screen === "playing") { updateGame(g, dt, ctx); renderGame(g, ctx); }
      else if (g && screen === "paused") { renderGame(g, ctx, true); }
      else { ctx.fillStyle = "#0b1020"; ctx.fillRect(0,0,ctx.canvas.width, ctx.canvas.height); }
      req = requestAnimationFrame(loop);
    };
    req = requestAnimationFrame(loop);
    return ()=>cancelAnimationFrame(req);
  }, [screen]);

  useEffect(() => {
    const kb = new Set<string>(); const mouse = { x:0, y:0, down:false };
    function onKey(e: KeyboardEvent){
      const g = gameRef.current; const k = e.key.toLowerCase();
      if (e.type === "keydown"){
        kb.add(k);
        if (k === "p") setScreen((s)=> s === "playing"?"paused": s === "paused"?"playing": s);
        if (k === "e") { g && tryInteract(g); }
      } else kb.delete(k);
      if (g) g.input.kb = kb;
    }
    function onMouseMove(e: MouseEvent){ const r = canvasRef.current?.getBoundingClientRect(); if(!r) return; mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top; const g=gameRef.current; if(g) g.input.mouse=mouse; }
    function onMouseDown(){ mouse.down=true; const g=gameRef.current; if(g) g.input.mouse=mouse; ensureSfx(); }
    function onMouseUp(){ mouse.down=false; const g=gameRef.current; if(g) g.input.mouse=mouse; }
    window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKey);
    window.addEventListener("mousemove", onMouseMove); window.addEventListener("mousedown", onMouseDown); window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mousedown", onMouseDown); window.removeEventListener("mouseup", onMouseUp); };
  }, []);

  const g = gameRef.current;

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col items-center gap-3 p-4 bg-slate-900 text-slate-100">
      <header className="w-full max-w-[1100px] flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">SUPER ROGUELITE <span className="text-indigo-300">PLUS</span></h1>
        <div className="flex items-center gap-3 text-sm opacity-80">
          <span>FPS: {fps}</span>
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input type="checkbox" checked={sfxOn} onChange={(e)=>{ setSfxOn(e.target.checked); ensureSfx(); }} /> SFX
          </label>
        </div>
      </header>

      {screen === "menu" && (
        <Menu difficulty={difficulty} setDifficulty={setDifficulty} onStart={initNewGame} onLoad={loadGame} />
      )}

      {screen !== "menu" && (
        <div className="relative w-full max-w-[1100px] rounded-2xl overflow-hidden shadow-xl">
          <canvas ref={canvasRef} width={960} height={600} className="block w-full h-auto bg-[#0b1020]" />

          {g && (
            <div className="pointer-events-none absolute inset-0 p-3 flex flex-col">
              <TopHud g={g} onSave={saveGame} onPause={()=>setScreen("paused")} />

              {screen === "paused" && (
                <Overlay onClose={()=>setScreen("playing")}>
                  <h2 className="text-xl font-bold mb-2">Pausa</h2>
                  <p className="mb-4 text-sm opacity-80">Juego detenido. Puedes guardar o volver al menú.</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={()=>setScreen("playing")} className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 pointer-events-auto">Reanudar</button>
                    <button onClick={saveGame} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 pointer-events-auto">Guardar</button>
                    <button onClick={()=>setScreen("menu")} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 pointer-events-auto">Menú</button>
                  </div>
                </Overlay>
              )}

              {screen === "gameover" && (
                <Overlay>
                  <h2 className="text-2xl font-bold mb-2 text-rose-300">¡Game Over!</h2>
                  <p className="opacity-80 mb-4">Puntuación: {Math.floor(g?.score ?? 0)} • Piso {g?.floor ?? 1}</p>
                  <div className="flex gap-2 justify-center">
                    <button onClick={()=>initNewGame()} className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 pointer-events-auto">Reintentar</button>
                    <button onClick={()=>setScreen("menu")} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 pointer-events-auto">Menú</button>
                  </div>
                </Overlay>
              )}

              {g?.ui?.shopOpen && (
                <Overlay onClose={()=>{ g.ui.shopOpen=false; setHint("Tienda cerrada."); }}>
                  <Shop g={g} />
                </Overlay>
              )}

              <div className="mt-auto text-xs md:text-sm opacity-80">{hint}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Overlay({ children, onClose }:{ children: React.ReactNode, onClose?:()=>void }){
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800/90 backdrop-blur rounded-2xl p-6 w-[min(92%,640px)] shadow-2xl relative">
        {onClose && (
          <button onClick={onClose} className="absolute right-3 top-3 text-slate-300 hover:text-white">✕</button>
        )}
        {children}
      </div>
    </div>
  );
}

function Menu({ difficulty, setDifficulty, onStart, onLoad }:{ difficulty:"easy"|"normal"|"hard", setDifficulty:(v:any)=>void, onStart:()=>void, onLoad:()=>void }) {
  return (
    <div className="w-full max-w-[1100px] grid md:grid-cols-2 gap-6">
      <div className="bg-slate-800/60 rounded-2xl p-6 shadow-xl">
        <h2 className="text-xl font-bold mb-2">Nuevo Juego</h2>
        <p className="text-sm opacity-80 mb-4">Mapa procedural, enemigos con IA, JEFE, tienda y sonidos.</p>
        <div className="flex items-center gap-2 mb-4">
          <label className="text-sm opacity-90">Dificultad:</label>
          <select value={difficulty} onChange={(e)=>setDifficulty(e.target.value)} className="pointer-events-auto bg-slate-700 rounded-xl px-3 py-2">
            <option value="easy">Fácil</option>
            <option value="normal">Normal</option>
            <option value="hard">Difícil</option>
          </select>
        </div>
        <div className="flex gap-2">
        <button
  onClick={() => {
    // 🔓 Desbloquear AudioContext antes de iniciar
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      if (ctx.state !== "running") ctx.resume();
    } catch {}
    onStart(); // inicia el juego
  }}
  className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600"
>
  Comenzar
</button>

          <button onClick={onLoad} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600">Cargar</button>
        </div>
      </div>
      <div className="bg-slate-800/60 rounded-2xl p-6 shadow-xl">
        <h2 className="text-xl font-bold mb-3">Controles</h2>
        <ul className="text-sm space-y-1 opacity-90">
          <li>WASD: moverte • Clic: disparar</li>
          <li>Espacio: dash • E: interactuar (portal/tienda)</li>
          <li>P: pausar • Guardado en el HUD</li>
        </ul>
        <h3 className="text-sm font-semibold mt-4">Objetivo</h3>
        <p className="text-sm opacity-80">Derrota al jefe del piso, entra al portal y mejora en la tienda.</p>
      </div>
    </div>
  );
}

function TopHud({ g, onSave, onPause }:{ g: Game, onSave:()=>void, onPause:()=>void }){
  const hearts = Math.ceil(g.player.maxHp / 20);
  const filled = Math.ceil((g.player.hp / g.player.maxHp) * hearts);
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1 text-rose-300">
        {Array.from({ length: hearts }).map((_, i) => (
          <span key={i} className={"text-xl "+(i < filled ? "opacity-100" : "opacity-30")}>❤</span>
        ))}
      </div>
      <div className="flex-1 max-w-[260px] h-3 bg-slate-700/60 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-400" style={{ width: `${(g.player.xp / g.player.nextLevelXp) * 100}%` }} />
      </div>
      <div className="text-xs opacity-80">Lv {g.player.level}</div>
      <div className="text-xs opacity-80">Piso {g.floor}</div>
      <div className="text-xs opacity-80">Monedas {g.coins}</div>
      <div className="text-xs opacity-80">Puntos {Math.floor(g.score)}</div>
      <div className="ml-auto flex gap-2 pointer-events-auto">
        <button onClick={onSave} className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs">Guardar</button>
        <button onClick={onPause} className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs">Pausa</button>
      </div>
    </div>
  );
}

function Shop({ g }:{ g: Game }){
  const buys = [
    { key:"heal", name:"Curación +50 HP", cost: 20, run:()=>{ g.player.hp = Math.min(g.player.maxHp, g.player.hp+50); } },
    { key:"maxhp", name:"+20 Vida Máxima", cost: 35, run:()=>{ g.player.maxHp += 20; g.player.hp = g.player.maxHp; } },
    { key:"dmg", name:"+6 Daño", cost: 40, run:()=>{ g.player.dmg += 6; } },
    { key:"spd", name:"+20 Velocidad", cost: 30, run:()=>{ g.player.speed += 20; } },
  ] as const;
  function buy(it: typeof buys[number]){ if (g.coins>=it.cost){ g.coins -= it.cost; it.run(); g.playSfx?.("buy"); } }
  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Tienda</h2>
      <p className="text-sm opacity-80 mb-4">Monedas: {g.coins}. Mejora a tu héroe antes del jefe o entre niveles.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {buys.map(b=> (
          <div key={b.key} className="bg-slate-700/50 rounded-xl p-3 flex items-center justify-between">
            <div>
              <div className="font-semibold">{b.name}</div>
              <div className="text-xs opacity-80">Costo: {b.cost}</div>
            </div>
            <button onClick={()=>buy(b)} disabled={g.coins<b.cost} className={`px-3 py-1 rounded-lg text-sm ${g.coins<b.cost?"bg-slate-600 opacity-60":"bg-emerald-500 hover:bg-emerald-600"}`}>Comprar</button>
          </div>
        ))}
      </div>
      <p className="text-xs opacity-70 mt-4">Consejo: guarda monedas para pisos altos; los jefes escalan cada piso.</p>
    </div>
  );
}

// Types
type Game = ReturnType<typeof createGame>;

function randInt(a:number,b:number){ return Math.floor(Math.random()*(b-a+1))+a; }
function clamp(v:number,a:number,b:number){ return Math.max(a, Math.min(b, v)); }
function dist(a:number,b:number,c:number,d:number){ const dx=c-a, dy=d-b; return Math.hypot(dx,dy); }

function createGame(metaOverrides:any){
  const meta = { width:960, height:600, tile:24, enemyBaseHp:20, enemyBaseDmg:8, spawnEvery:1.8, playerMaxHp:100, difficulty:"normal", ...metaOverrides };
  const cols = Math.floor(meta.width/meta.tile); const rows = Math.floor(meta.height/meta.tile);
  const tiles = new Uint8Array(cols*rows).fill(1);
  const rooms = generateRooms(cols, rows, tiles);

  const player = { x: rooms[0].cx*meta.tile+meta.tile/2, y: rooms[0].cy*meta.tile+meta.tile/2, r:10, speed:150, dashCd:0, dashTime:0, maxHp:meta.playerMaxHp, hp:meta.playerMaxHp, dmg:16, level:1, xp:0, nextLevelXp:50 };
  const bullets:any[] = []; const enemies:any[]=[]; const items:any[]=[]; const spawner={t:0};
  const input = { kb:new Set<string>(), mouse:{x:0,y:0,down:false} };

  let score = 0; let floor = 1; let coins = 0; let killsThisFloor=0; let bossAlive=false; let bossDefeated=false;
  const ui = { shopOpen:false };

  const shopRoom = rooms[Math.min(rooms.length-1, 1 + randInt(0, Math.max(0, rooms.length-2)))];
  const shopPos = roomCenterPixel(shopRoom, meta.tile); items.push({ x: shopPos.x+randInt(-20,20), y: shopPos.y+randInt(-20,20), type:"shop" });

  for (let i=1;i<Math.min(rooms.length, 6);i++){
    const pos = roomCenterPixel(rooms[i], meta.tile);
    spawnEnemy(enemies, pos.x, pos.y, meta);
    if (Math.random()<0.5) spawnItem(items, pos.x, pos.y);
  }

  const g:any = { meta, cols, rows, tiles, rooms, player, bullets, enemies, items, spawner, input, score, floor, coins, killsThisFloor, bossAlive, bossDefeated, ui, playSfx:(_:string)=>{}, _rectCache:null };
  return g;
}

function snapshotState(g:any){
  return { player:g.player, enemies:g.enemies, items:g.items, tiles:Array.from(g.tiles), score:g.score, floor:g.floor, coins:g.coins, meta:g.meta, bossAlive:g.bossAlive, bossDefeated:g.bossDefeated };
}
function restoreState(g:any, s:any){ g.player=s.player; g.enemies=s.enemies; g.items=s.items; g.tiles=Uint8Array.from(s.tiles); g.score=s.score; g.floor=s.floor||1; g.coins=s.coins||0; g.bossAlive=!!s.bossAlive; g.bossDefeated=!!s.bossDefeated; }

function roomCenterPixel(r:any,tile:number){ return { x:r.cx*tile+tile/2, y:r.cy*tile+tile/2 }; }

function generateRooms(cols:number, rows:number, tiles:Uint8Array){
  const rooms:any[]=[]; const roomCount=randInt(6, 10);
  for (let i=0;i<roomCount;i++){
    const w=randInt(6,11), h=randInt(5,9), x=randInt(1, max(1, cols-w-2)), y=randInt(1, max(1, rows-h-2));
    carveRect(tiles, cols, rows, x, y, w, h, 0);
    rooms.push({ x,y,w,h, cx:x+Math.floor(w/2), cy:y+Math.floor(h/2) });
  }
  rooms.sort((a,b)=>a.cx-b.cx);
  for (let i=0;i<rooms.length-1;i++){
    const a=rooms[i], b=rooms[i+1]; carveLine(tiles, cols, rows, a.cx,a.cy, b.cx,a.cy, 0); carveLine(tiles, cols, rows, b.cx,a.cy, b.cx,b.cy, 0);
  }
  dilateFloors(tiles, cols, rows); return rooms;
}
function max(a:number,b:number){ return a>b?a:b; }
function carveRect(tiles:Uint8Array, cols:number, rows:number, x:number,y:number,w:number,h:number,v:number){ for(let j=y;j<y+h;j++) for(let i=x;i<x+w;i++) tiles[j*cols+i]=v; }
function carveLine(tiles:Uint8Array, cols:number, rows:number, x0:number,y0:number,x1:number,y1:number,v:number){ const dx=Math.sign(x1-x0), dy=Math.sign(y1-y0); let x=x0,y=y0; tiles[y*cols+x]=v; while(x!==x1||y!==y1){ if(x!==x1) x+=dx; else if(y!==y1) y+=dy; tiles[y*cols+x]=v; } }
function dilateFloors(tiles:Uint8Array, cols:number, rows:number){ const cp=tiles.slice(); for(let y=1;y<rows-1;y++) for(let x=1;x<cols-1;x++){ const i=y*cols+x; if(cp[i]===0) for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) tiles[(y+dy)*cols+(x+dx)]=0; } }

function spawnEnemy(enemies:any[], x:number,y:number, meta:any){ const type = Math.random()<0.75?"chaser":"shooter"; enemies.push({ x,y, r:10, hp: meta.enemyBaseHp, type, cd:0 }); }
function spawnBoss(g:any){ if (g.bossAlive) return; g.bossAlive=true; g.bossDefeated=false; const r = g.rooms[g.rooms.length-1]; const pos = roomCenterPixel(r, g.meta.tile); const base = 260 + 70*(g.floor-1);
  g.enemies.push({ x:pos.x, y:pos.y, r:22, hp: base, type:"boss", cd:1.2, phase:0 }); }
function spawnItem(items:any[], x:number,y:number){ const types=["potion","speed","power"]; const type = types[randInt(0, types.length-1)]; items.push({ x,y,type }); }

function tryInteract(g:any){
  const p=g.player;
  for (let i=g.items.length-1;i>=0;i--){ const it=g.items[i]; if (dist(p.x,p.y,it.x,it.y) < 26){
      if (it.type==="potion"){ p.hp = clamp(p.hp+35, 0, p.maxHp); g.items.splice(i,1); g.score+=5; g.playSfx?.("pickup"); return; }
      if (it.type==="speed"){ p.speed += 20; setTimeout(()=>p.speed-=20, 12000); g.items.splice(i,1); g.score+=5; g.playSfx?.("pickup"); return; }
      if (it.type==="power"){ p.dmg += 6; setTimeout(()=>p.dmg-=6, 12000); g.items.splice(i,1); g.score+=5; g.playSfx?.("pickup"); return; }
      if (it.type==="portal"){ nextFloor(g); g.playSfx?.("level"); return; }
      if (it.type==="shop"){ g.ui.shopOpen=true; return; }
    } }
}

function nextFloor(g:any){
  g.floor += 1; g.killsThisFloor = 0; g.bossAlive=false; g.bossDefeated=false;
  g.meta.enemyBaseHp = Math.floor(g.meta.enemyBaseHp*1.12 + 1);
  g.meta.enemyBaseDmg = Math.floor(g.meta.enemyBaseDmg*1.10 + 1);
  const { width,height,tile } = g.meta; const cols=Math.floor(width/tile), rows=Math.floor(height/tile); g.cols=cols; g.rows=rows; g.tiles=new Uint8Array(cols*rows).fill(1); g.rooms=generateRooms(cols, rows, g.tiles);
  const start = g.rooms[0]; const p=g.player; p.x=start.cx*tile+tile/2; p.y=start.cy*tile+tile/2; p.hp = Math.min(p.maxHp, p.hp + 30);
  g.enemies.length=0; g.bullets.length=0; g.items.length=0; g.spawner.t = 0;
  const shopRoom = g.rooms[Math.min(g.rooms.length-1, 1 + randInt(0, Math.max(0, g.rooms.length-2)))]; const shopPos=roomCenterPixel(shopRoom, tile); g.items.push({ x:shopPos.x+randInt(-20,20), y:shopPos.y+randInt(-20,20), type:"shop" });
  for (let i=1;i<Math.min(g.rooms.length, 6);i++){ const pos = roomCenterPixel(g.rooms[i], tile); spawnEnemy(g.enemies, pos.x, pos.y, g.meta); if (Math.random()<0.5) spawnItem(g.items, pos.x, pos.y); }
}
function updateGame(g:any, dt:number, ctx:CanvasRenderingContext2D){
  const p=g.player; 
  const kb=g.input.kb as Set<string>; 
  const mouse=g.input.mouse as any;

  let ax=0, ay=0; 
  if (kb.has("w")) ay-=1; 
  if (kb.has("s")) ay+=1; 
  if (kb.has("a")) ax-=1; 
  if (kb.has("d")) ax+=1; 

  const len=Math.hypot(ax,ay)||1; 
  const spd=p.speed*(p.dashTime>0?2.2:1.0); 
  const vx=(ax/len)*spd*dt, vy=(ay/len)*spd*dt;

  p.dashCd=Math.max(0, p.dashCd-dt); 
  p.dashTime=Math.max(0, p.dashTime-dt); 
  if (kb.has(" ") && p.dashCd<=0){ 
    p.dashTime=0.18; 
    p.dashCd=0.9; 
    g.playSfx?.("dash"); 
  }

  tryMove(g, p, vx, vy);

  if (mouse.down) shoot(g, p, mouse);

  for (let i=g.bullets.length-1;i>=0;i--){ 
    const b=g.bullets[i]; 
    b.x+=b.vx*dt; 
    b.y+=b.vy*dt; 
    b.life-=dt; 
    if (solidAt(g,b.x,b.y) || b.life<=0){ 
      g.bullets.splice(i,1); 
      continue; 
    }
    if (b.from==="player"){ 
      for (let j=g.enemies.length-1;j>=0;j--){ 
        const e=g.enemies[j]; 
        if (dist(b.x,b.y,e.x,e.y) < (e.type==="boss"? e.r+6 : 14)){ 
          e.hp -= b.damage; 
          g.bullets.splice(i,1); 
          if (e.hp<=0){
            if (e.type==="boss"){ 
              g.bossAlive=false; 
              g.bossDefeated=true; 
              g.playSfx?.("bossdown"); 
              const pos={x:e.x,y:e.y}; 
              g.items.push({ x:pos.x, y:pos.y, type:"portal" }); 
              g.coins += 50; 
              g.score += 500; 
            }
            g.enemies.splice(j,1); 
            g.score += 20; 
            g.coins += randInt(2,4); 
            gainXp(g, 12); 
            if (Math.random()<0.2) spawnItem(g.items, e.x, e.y); 
            g.killsThisFloor = (g.killsThisFloor||0)+1;
          }
          break; 
        }
      }
    } else { 
      if (dist(b.x,b.y,p.x,p.y) < 12){ 
        p.hp -= b.damage; 
        g.bullets.splice(i,1); 
        g.playSfx?.("hurt"); 
        if (p.hp<=0) gameOver(); 
      } 
    }
  }

  for (const e of g.enemies){ 
    const dx=p.x-e.x, dy=p.y-e.y; 
    const d=Math.hypot(dx,dy)||1; 
    if (e.type==="chaser"){ 
      const s=60 + (g.meta.difficulty==="hard"?20:0); 
      tryMove(g, e, (dx/d)*s*dt, (dy/d)*s*dt); 
      if (d<16){ 
        p.hp -= g.meta.enemyBaseDmg*dt; 
        if (p.hp<=0) gameOver(); 
      } 
    }
    else if (e.type==="shooter"){ 
      e.cd-=dt; 
      if (e.cd<=0 && d<320){ 
        e.cd=1.2+Math.random()*0.6; 
        const sp=180; 
        const vx=(dx/d)*sp, vy=(dy/d)*sp; 
        g.bullets.push({ x:e.x, y:e.y, vx, vy, life:2.5, from:"enemy", damage:g.meta.enemyBaseDmg*0.7 }); 
      }
      const s=40; 
      tryMove(g, e, (dx/d)*s*dt*0.2, (dy/d)*s*dt*0.2); 
    }
    else if (e.type==="boss"){ 
      e.cd -= dt;
      if (e.cd<=0){ 
        e.cd = 1.6; 
        const shots = 10 + randInt(0,6); 
        const speed = 140 + 20*randInt(0,2); 
        for (let k=0;k<shots;k++){ 
          const ang = (Math.PI*2*k)/shots + Math.random()*0.2; 
          const vx=Math.cos(ang)*speed, vy=Math.sin(ang)*speed; 
          g.bullets.push({ x:e.x, y:e.y, vx, vy, life:3.5, from:"enemy", damage:g.meta.enemyBaseDmg*1.2 }); 
        } 
        g.playSfx?.("bossfire"); 
      }
      const s = 50; 
      tryMove(g, e, (dx/d)*s*dt*0.6, (dy/d)*s*dt*0.6); 
    }
  }

  g.spawner.t += dt; 
  const needBossAt = 20 + 5*(g.floor-1);

  if (!g.bossAlive && !g.bossDefeated && (g.killsThisFloor||0) >= needBossAt){ 
    spawnBoss(g); 
    g.playSfx?.("boss"); 
  }

  if (!g.bossAlive && !g.bossDefeated && g.spawner.t >= g.meta.spawnEvery){ 
    g.spawner.t=0; 
    // 🔥 CORREGIDO AQUÍ 🔥
    const far = g.rooms.filter((r:any)=> 
      dist(p.x,p.y, r.cx * g.meta.tile, r.cy * g.meta.tile) > 200
    );
    const r = far.length? far[randInt(0,far.length-1)] : g.rooms[randInt(0,g.rooms.length-1)]; 
    const pos = roomCenterPixel(r, g.meta.tile); 
    spawnEnemy(g.enemies, pos.x+randInt(-30,30), pos.y+randInt(-30,30), g.meta); 
  }
}


