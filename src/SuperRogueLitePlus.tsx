import React, { useEffect, useMemo, useRef, useState } from "react";

/* ----------------- Utils ----------------- */
type Vec = { x: number; y: number };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randi = (a: number, b: number) => Math.floor(rand(a, b + 1));

/* ----------------- SFX (sin archivos) ----------------- */
class Sfx {
  ctx: AudioContext;
  master: GainNode;
  constructor() {
    const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.06;
    this.master.connect(this.ctx.destination);
  }
  private beep(freq = 440, dur = 0.12, type: OscillatorType = "square") {
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    osc.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  play(name: "shoot" | "hit" | "boss" | "pick" | "ui" = "ui") {
    switch (name) {
      case "shoot": this.beep(950, 0.07, "square"); break;
      case "hit": this.beep(240, 0.08, "sawtooth"); break;
      case "boss": this.beep(130, 0.22, "triangle"); break;
      case "pick": this.beep(660, 0.06, "triangle"); break;
      default: this.beep(440, 0.05, "sine");
    }
  }
  async resume(){ if (this.ctx.state !== "running") await this.ctx.resume(); }
}

/* ----------------- Tipos ----------------- */
type Bullet = { p: Vec; v: Vec; life: number; from: "player" | "enemy"; damage: number };
type Enemy = {
  type: "chaser" | "shooter" | "boss";
  p: Vec; v: Vec; hp: number; r: number; speed: number; cd: number;
};
type Portal = { p: Vec } | null;
type Difficulty = "easy" | "normal" | "hard";

type Meta = {
  tile: number;
  fireRate: number;     // segundos entre disparos
  damage: number;       // daño bala jugador
  enemyBaseDmg: number; // daño bala enemigo
  spawnEvery: number;
  difficulty: Difficulty;
};

type Game = {
  w: number; h: number;
  player: { p: Vec; v: Vec; hp: number; maxHp: number; speed: number; fireCd: number };
  bullets: Bullet[];
  enemies: Enemy[];
  coins: number;
  score: number;
  floor: number;
  killsThisFloor: number;
  bossAlive: boolean;
  bossDefeated: boolean;
  portal: Portal;
  time: number;
  meta: Meta;
};

/* ----------------- Crear juego ----------------- */
function createGame(w: number, h: number, diff: Difficulty): Game {
  const metaByDiff: Record<Difficulty, Meta> = {
    easy:   { tile: 32, fireRate: 0.18, damage: 1, enemyBaseDmg: 0.6, spawnEvery: 1.0, difficulty: "easy" },
    normal: { tile: 32, fireRate: 0.18, damage: 1, enemyBaseDmg: 0.8, spawnEvery: 0.9, difficulty: "normal" },
    hard:   { tile: 32, fireRate: 0.16, damage: 1, enemyBaseDmg: 1.0, spawnEvery: 0.85, difficulty: "hard" },
  };
  const meta = metaByDiff[diff];
  return {
    w, h,
    player: { p: { x: w/2, y: h/2 }, v: { x: 0, y: 0 }, hp: 10, maxHp: 10, speed: 200, fireCd: 0 },
    bullets: [],
    enemies: [],
    coins: 0,
    score: 0,
    floor: 1,
    killsThisFloor: 0,
    bossAlive: false,
    bossDefeated: false,
    portal: null,
    time: 0,
    meta,
  };
}

/* ----------------- Entrada ----------------- */
function useKeys() {
  const ref = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const d = ref.current;
    const on = (e: KeyboardEvent) => { d[e.key.toLowerCase()] = true; };
    const off = (e: KeyboardEvent) => { d[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", on);
    window.addEventListener("keyup", off);
    return () => { window.removeEventListener("keydown", on); window.removeEventListener("keyup", off); };
  }, []);
  return ref;
}

/* ----------------- Spawns ----------------- */
function spawnEnemy(g: Game, around?: Vec) {
  const margin = 40;
  const p: Vec = { x: 0, y: 0 };
  if (around) {
    const angle = Math.atan2(around.y - g.h/2, around.x - g.w/2) + rand(-0.6, 0.6);
    p.x = clamp(around.x + Math.cos(angle) * rand(240, 300), margin, g.w - margin);
    p.y = clamp(around.y + Math.sin(angle) * rand(240, 300), margin, g.h - margin);
  } else {
    const edge = randi(0, 3);
    if (edge === 0) { p.x = rand(margin, g.w - margin); p.y = margin; }
    if (edge === 1) { p.x = rand(margin, g.w - margin); p.y = g.h - margin; }
    if (edge === 2) { p.x = margin; p.y = rand(margin, g.h - margin); }
    if (edge === 3) { p.x = g.w - margin; p.y = rand(margin, g.h - margin); }
  }
  const t = Math.random() < 0.75 ? "chaser" : "shooter";
  const hp = 2 + Math.floor((g.floor-1) * 0.5) + (t === "shooter" ? 1 : 0);
  const sp = (t === "chaser" ? 70 : 45) + (g.floor-1) * 5;
  g.enemies.push({ type: t, p, v: { x: 0, y: 0 }, hp, r: 12, speed: sp, cd: rand(0.3, 1.2) });
}

function spawnBoss(g: Game) {
  g.bossAlive = true;
  const p: Vec = { x: g.w/2, y: g.h/3 };
  const hp = 60 + (g.floor-1) * 25;
  const boss: Enemy = { type: "boss", p, v: { x: 0, y: 0 }, hp, r: 24, speed: 55, cd: 1.2 };
  g.enemies.push(boss);
}

/* ----------------- Update ----------------- */
function tryShoot(g: Game, mp: Vec | null, sfx: Sfx) {
  const pl = g.player;
  if (pl.fireCd > 0) return;
  if (!mp) return;
  const ang = Math.atan2(mp.y - pl.p.y, mp.x - pl.p.x);
  const v: Vec = { x: Math.cos(ang) * 480, y: Math.sin(ang) * 480 };
  g.bullets.push({ p: { x: pl.p.x, y: pl.p.y }, v, life: 0.8, from: "player", damage: g.meta.damage });
  pl.fireCd = g.meta.fireRate;
  sfx.play("shoot");
}

function updateGame(g: Game, dt: number, keys: Record<string, boolean>, mouse: {down:boolean, pos:Vec|null}, sfx: Sfx) {
  g.time += dt;

  // player move
  const k = keys;
  const p = g.player;
  const ax = (k["d"]?1:0) - (k["a"]?1:0);
  const ay = (k["s"]?1:0) - (k["w"]?1:0);
  const len = Math.hypot(ax, ay) || 1;
  p.v.x = (ax/len) * p.speed;
  p.v.y = (ay/len) * p.speed;
  p.p.x = clamp(p.p.x + p.v.x * dt, 8, g.w - 8);
  p.p.y = clamp(p.p.y + p.v.y * dt, 8, g.h - 8);
  p.fireCd = Math.max(0, p.fireCd - dt);

  // shooting
  if (mouse.down) tryShoot(g, mouse.pos, sfx);

  // spawn cadence (si no hay jefe)
  if (!g.bossAlive && !g.bossDefeated) {
    if ((g.time % g.meta.spawnEvery) < dt) spawnEnemy(g, p.p);
  }

  // jefe aparece después de N bajas
  const needBossAt = 18 + 6*(g.floor-1);
  if (!g.bossAlive && !g.bossDefeated && g.killsThisFloor >= needBossAt) {
    spawnBoss(g);
    sfx.play("boss");
  }

  // bullets update
  for (const b of g.bullets) {
    b.p.x += b.v.x * dt;
    b.p.y += b.v.y * dt;
    b.life -= dt;
  }
  g.bullets = g.bullets.filter(b => b.life > 0 && b.p.x>-10 && b.p.x<g.w+10 && b.p.y>-10 && b.p.y<g.h+10);

  // enemies AI
  for (const e of g.enemies) {
    const dx = p.p.x - e.p.x, dy = p.p.y - e.p.y;
    const L = Math.hypot(dx,dy)||1;

    if (e.type === "chaser") {
      e.p.x += (dx/L) * e.speed * dt;
      e.p.y += (dy/L) * e.speed * dt;
      if (dist(e.p, p.p) < e.r + 10) {
        p.hp -= g.meta.enemyBaseDmg * dt;
        if (p.hp <= 0) p.hp = 0;
      }
    } else if (e.type === "shooter") {
      e.cd -= dt;
      // se mueve suave
      e.p.x += (dx/L) * e.speed * dt * 0.2;
      e.p.y += (dy/L) * e.speed * dt * 0.2;
      if (e.cd <= 0 && L < 380) {
        e.cd = 1.2 + Math.random()*0.6;
        const sp = 180;
        const v: Vec = { x: (dx/L)*sp, y: (dy/L)*sp };
        g.bullets.push({ p: { x: e.p.x, y: e.p.y }, v, life: 2.5, from: "enemy", damage: g.meta.enemyBaseDmg*0.7 });
      }
    } else if (e.type === "boss") {
      e.cd -= dt;
      // patrón: orbitar y barrer balas
      const towards = 0.6;
      e.p.x += (dx/L) * e.speed * dt * towards;
      e.p.y += (dy/L) * e.speed * dt * towards;

      if (e.cd <= 0) {
        e.cd = Math.max(0.8, 1.8 - 0.12*(g.floor-1));
        const shots = 18;
        const base = Math.random() * Math.PI*2;
        const speed = 160 + 20*(g.floor-1);
        for (let k=0;k<shots;k++){
          const ang = base + (Math.PI*2*k)/shots;
          const v: Vec = { x: Math.cos(ang)*speed, y: Math.sin(ang)*speed };
          g.bullets.push({ p: { x: e.p.x, y: e.p.y }, v, life: 3.2, from: "enemy", damage: g.meta.enemyBaseDmg*1.2 });
        }
      }
    }
  }

  // collisions bullet-enemy
  for (const e of g.enemies) {
    if (e.type === "boss") continue; // lo resolvemos aparte por radio mayor
    for (const b of g.bullets) {
      if (b.from !== "player") continue;
      if (dist(e.p, b.p) < e.r + 6) {
        e.hp -= b.damage;
        b.life = -1;
        g.score += 2;
        if (e.hp <= 0) {
          g.coins += randi(1,3);
          g.killsThisFloor++;
          sfx.play("pick");
        }
      }
    }
  }
  // bullet-boss
  for (const e of g.enemies) {
    if (e.type !== "boss") continue;
    for (const b of g.bullets) {
      if (b.from !== "player") continue;
      if (dist(e.p, b.p) < e.r + 8) {
        e.hp -= b.damage;
        b.life = -1;
        g.score += 5;
      }
    }
  }

  // bullets hitting player
  for (const b of g.bullets) {
    if (b.from !== "enemy") continue;
    if (dist(b.p, p.p) < 10) {
      p.hp -= b.damage;
      b.life = -1;
      sfx.play("hit");
      if (p.hp <= 0) p.hp = 0;
    }
  }

  // limpiar muertos & eventos de jefe
  const before = g.enemies.length;
  g.enemies = g.enemies.filter(e => e.hp > 0);
  if (before !== g.enemies.length) sfx.play("hit");

  // si muere el jefe → portal
  if (g.bossAlive && !g.enemies.some(e => e.type === "boss")) {
    g.bossAlive = false;
    g.bossDefeated = true;
    g.portal = { p: { x: g.w/2, y: g.h/2 } };
    g.coins += 20 + 10*(g.floor-1);
    g.score += 100;
  }
}

/* ----------------- Render ----------------- */
function drawGame(g: Game, ctx: CanvasRenderingContext2D, fps: number) {
  ctx.clearRect(0,0,g.w,g.h);

  // grid de ambiente
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0,0,g.w,g.h);
  ctx.strokeStyle = "#111a33";
  ctx.lineWidth = 1;
  for (let x=0; x<g.w; x+=32){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,g.h); ctx.stroke(); }
  for (let y=0; y<g.h; y+=32){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(g.w,y); ctx.stroke(); }

  // portal si existe
  if (g.portal) {
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(g.portal.p.x, g.portal.p.y, 22, 0, Math.PI*2);
    ctx.stroke();
  }

  // bullets
  for (const b of g.bullets) {
    ctx.fillStyle = b.from === "player" ? "#eab308" : "#f87171";
    ctx.beginPath();
    ctx.arc(b.p.x, b.p.y, b.from === "player" ? 3 : 4, 0, Math.PI*2);
    ctx.fill();
  }

  // enemies
  for (const e of g.enemies) {
    ctx.fillStyle = e.type === "boss" ? "#a78bfa" : (e.type === "shooter" ? "#f97316" : "#ef4444");
    ctx.beginPath();
    ctx.arc(e.p.x, e.p.y, e.r, 0, Math.PI*2);
    ctx.fill();
    // vida
    ctx.fillStyle = "#10b981";
    const pct = Math.max(0, e.hp) / (e.type==="boss" ? (60 + (g.floor-1)*25) : 6);
    ctx.fillRect(e.p.x - e.r, e.p.y - e.r - 6, e.r*2*pct, 4);
  }

  // player
  ctx.fillStyle = "#93c5fd";
  ctx.beginPath();
  ctx.arc(g.player.p.x, g.player.p.y, 10, 0, Math.PI*2);
  ctx.fill();

  // HUD
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "12px ui-sans-serif, system-ui, Segoe UI, Roboto";
  ctx.fillText(`HP: ${g.player.hp.toFixed(1)} / ${g.player.maxHp}`, 12, 18);
  ctx.fillText(`Floor: ${g.floor}`, 12, 34);
  ctx.fillText(`Score: ${g.score}`, 12, 50);
  ctx.fillText(`Coins: ${g.coins}`, 12, 66);
  ctx.fillText(`FPS: ${fps.toFixed(0)}`, g.w - 80, 18);

  // prompt portal
  if (g.portal) {
    ctx.fillStyle = "#22d3ee";
    ctx.fillText(`Acércate y pulsa "E" para ir a la tienda`, g.portal.p.x - 120, g.portal.p.y - 28);
  }
}

/* ----------------- Tienda ----------------- */
type ShopItem = { id: string; name: string; desc: string; cost: number; apply: (g: Game) => void };
function buildShop(g: Game): ShopItem[] {
  const base = 12 + (g.floor-1) * 6;
  return [
    { id: "dmg",   name: "+1 Daño",            desc: "Aumenta el daño de tus disparos", cost: base + 6,  apply: (gg)=>{ gg.meta.damage += 1; } },
    { id: "rate",  name: "Cadencia +20%",      desc: "Disparas más seguido",            cost: base + 8,  apply: (gg)=>{ gg.meta.fireRate = Math.max(0.08, gg.meta.fireRate*0.8); } },
    { id: "spd",   name: "Velocidad +20%",     desc: "Te mueves más rápido",            cost: base + 8,  apply: (gg)=>{ gg.player.speed *= 1.2; } },
    { id: "hpmax", name: "+2 Vida Máxima",     desc: "Más vida total",                  cost: base + 10, apply: (gg)=>{ gg.player.maxHp += 2; gg.player.hp += 2; } },
    { id: "heal",  name: "Curación completa",  desc: "Rellena toda tu vida",            cost: Math.floor(base/2), apply: (gg)=>{ gg.player.hp = gg.player.maxHp; } },
  ];
}

/* ----------------- UI: overlays ----------------- */
function ShopOverlay({
  g, onBuy, onContinue
}: { g: Game; onBuy: (id: string)=>void; onContinue: ()=>void }) {
  const items = buildShop(g);
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="pointer-events-auto bg-slate-800 text-slate-200 rounded-2xl p-6 w-[720px] max-w-[95vw] shadow-2xl">
        <h2 className="text-xl font-bold mb-1">Tienda (Piso {g.floor})</h2>
        <p className="text-sm opacity-80 mb-4">Monedas: <span className="font-semibold">{g.coins}</span></p>
        <div className="grid sm:grid-cols-2 gap-3">
          {items.map(it => (
            <div key={it.id} className="bg-slate-700/50 rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{it.name}</h3>
                <span className="text-amber-300 font-semibold">{it.cost} 💰</span>
              </div>
              <p className="text-sm opacity-80">{it.desc}</p>
              <button
                onClick={()=>onBuy(it.id)}
                className={`mt-1 px-3 py-2 rounded-lg ${g.coins>=it.cost? "bg-indigo-500 hover:bg-indigo-600" : "bg-slate-600 cursor-not-allowed"}`}
                disabled={g.coins<it.cost}
              >
                Comprar
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onContinue} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600">Continuar al siguiente piso</button>
        </div>
      </div>
    </div>
  );
}

/* ----------------- Componente principal ----------------- */
export default function SuperRogueLitePlus() {
  const [screen, setScreen] = useState<"menu"|"playing"|"paused"|"gameover">("menu");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [sfxOn, setSfxOn] = useState(true);
  const [showShop, setShowShop] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D|null>(null);
  const gameRef = useRef<Game|null>(null);
  const sfxRef = useRef<Sfx|null>(null);
  const keysRef = useKeys();
  const mouseRef = useRef<{down:boolean, pos:Vec|null}>({down:false, pos:null});

  const DIFF = useMemo(() => (["easy","normal","hard"] as Difficulty[]), []);

  // SFX init
  useEffect(() => { sfxRef.current = new Sfx(); }, []);

  // Mouse listeners (solo jugando)
  useEffect(() => {
    if (screen !== "playing") return;
    const c = canvasRef.current; if (!c) return;
    const onDown = (e: MouseEvent) => { mouseRef.current.down = true; mouseRef.current.pos = { x: e.offsetX, y: e.offsetY }; };
    const onUp   = () => { mouseRef.current.down = false; };
    const onMove = (e: MouseEvent) => { mouseRef.current.pos = { x: e.offsetX, y: e.offsetY }; };
    c.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    c.addEventListener("mousemove", onMove);
    return () => { c.removeEventListener("mousedown", onDown); window.removeEventListener("mouseup", onUp); c.removeEventListener("mousemove", onMove); };
  }, [screen]);

  // Loop
  useEffect(() => {
    if (screen !== "playing") return;
    const c = canvasRef.current!; const ctx = c.getContext("2d"); if (!ctx) return;
    ctxRef.current = ctx;

    let last = performance.now(), acc = 0, frames = 0, fps = 0, tFps = 0;
    const step = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.04); last = t;
      const g = gameRef.current!;

      updateGame(g, dt, keysRef.current, mouseRef.current, sfxRef.current!);

      // E: interactuar con portal → tienda
      if (g.portal && dist(g.player.p, g.portal.p) < 28 && keysRef.current["e"]) {
        setShowShop(true);
      }

      if (keysRef.current["p"]) setScreen(s=> s==="paused" ? "playing" : "paused");

      // render
      acc += dt; frames++;
      if (t - tFps > 500) { fps = frames / (acc || 1e-6); frames = 0; acc = 0; tFps = t; }
      drawGame(g, ctx, fps);

      if (g.player.hp <= 0) { setScreen("gameover"); return; }
      req = requestAnimationFrame(step);
    };
    let req = requestAnimationFrame(step);
    return () => cancelAnimationFrame(req);
  }, [screen]);

  function startGame() {
    sfxRef.current?.resume(); // desbloquear audio
    const w = 960, h = 600;
    gameRef.current = createGame(w, h, difficulty);
    setShowShop(false);
    setScreen("playing");
  }

  function continueNextFloor() {
    const g = gameRef.current!;
    g.floor += 1;
    g.killsThisFloor = 0;
    g.bossDefeated = false;
    g.portal = null;
    g.enemies = [];
    g.bullets = [];
    // un mini heal al subir de piso
    g.player.hp = Math.min(g.player.maxHp, g.player.hp + 2);
    setShowShop(false);
  }

  function buyItem(id: string) {
    const g = gameRef.current!; const items = buildShop(g);
    const it = items.find(x=>x.id===id)!;
    if (g.coins >= it.cost) { g.coins -= it.cost; it.apply(g); sfxRef.current?.play("pick"); }
  }

  // Layout
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <div className="w-full max-w-[1100px] mx-auto px-4 py-6 md:grid md:grid-cols-2 gap-6">
        <header className="w-full max-w-[1100px] flex items-center justify-between">
          <h1 className="text-2xl font-bold">SUPER ROGUELITE <span className="text-indigo-400">PLUS</span></h1>
          <div className="text-sm opacity-75 flex items-center gap-3">
            <span>Piso: {gameRef.current?.floor ?? 1}</span>
            <label className="select-none cursor-pointer flex items-center gap-1">
              <input
                type="checkbox"
                checked={sfxOn}
                onChange={(e)=>{ setSfxOn(e.target.checked); if (sfxRef.current) sfxRef.current.master.gain.value = e.target.checked ? 0.06 : 0; }}
              />
              <span>SFX</span>
            </label>
          </div>
        </header>

        {screen === "menu" && (
          <div className="bg-slate-800/60 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-2">Nuevo Juego</h2>
            <p className="text-sm opacity-80 mb-4">WASD moverte · Clic disparar · E portal/tienda · P pausa</p>
            <div className="flex items-center gap-4 mb-4">
              <label className="text-sm opacity-90">Dificultad:</label>
              <select
                value={difficulty}
                onChange={(e)=>setDifficulty(e.target.value as Difficulty)}
                className="pointer-events-auto bg-slate-700 rounded-xl px-3 py-2"
              >
                {(["easy","normal","hard"] as Difficulty[]).map(d=>(
                  <option key={d} value={d}>{d==="easy"?"Fácil":d==="normal"?"Normal":"Difícil"}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={startGame} className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600">Comenzar</button>
              <button onClick={()=>alert("Cargar: demo sin almacenamiento")} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600">Cargar</button>
            </div>
          </div>
        )}

        {screen !== "menu" && (
          <div className="relative w-full max-w-[1100px] rounded-2xl overflow-hidden shadow-xl">
            <canvas
              ref={canvasRef}
              width={960}
              height={600}
              className={`block w-full h-auto bg-[#0b1020] ${screen==="menu" ? "pointer-events-none" : ""}`}
            />
            {screen === "paused" && (
              <div className="pointer-events-none absolute inset-0 p-3 flex flex-col items-center justify-center bg-black/40">
                <h2 className="text-xl font-bold mb-2">Pausa</h2>
                <p className="text-sm opacity-80">Pulsa P para reanudar</p>
              </div>
            )}
          </div>
        )}

        <div className="bg-slate-800/60 rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-bold mb-2">Estado</h2>
          <ul className="text-sm space-y-1 opacity-90">
            <li>HP: {gameRef.current?.player.hp.toFixed?.(1) ?? "-"} / {gameRef.current?.player.maxHp ?? "-"}</li>
            <li>Score: {gameRef.current?.score ?? 0} · Coins: {gameRef.current?.coins ?? 0}</li>
            <li>Daño: {gameRef.current?.meta.damage ?? 1} · Cadencia: {(gameRef.current?.meta.fireRate ?? 0.18).toFixed(2)}s</li>
          </ul>
        </div>
      </div>

      {/* Tienda al derrotar jefe */}
      {showShop && gameRef.current && (
        <ShopOverlay
          g={gameRef.current}
          onBuy={buyItem}
          onContinue={continueNextFloor}
        />
      )}

      {/* Game over */}
      {screen === "gameover" && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-slate-800 text-slate-200 rounded-2xl p-6 w-[520px] max-w-[95vw] shadow-2xl text-center">
            <h2 className="text-2xl font-bold mb-2">¡Game Over!</h2>
            <p className="opacity-80 mb-4">Score: {gameRef.current?.score ?? 0} · Piso: {gameRef.current?.floor ?? 1}</p>
            <div className="flex gap-2 justify-center">
              <button onClick={()=>setScreen("menu")} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600">Menú</button>
              <button onClick={startGame} className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600">Reintentar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
