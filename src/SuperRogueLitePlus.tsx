import React, { useEffect, useMemo, useRef, useState } from "react";

/** ---------- Utilidades ---------- */
type Vec = { x: number; y: number };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist2 = (a: Vec, b: Vec) => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** ---------- Audio SFX (sin archivos) ---------- */
class Sfx {
  ctx: AudioContext;
  master: GainNode;

  constructor() {
    const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.06; // volumen global bajito
    this.master.connect(this.ctx.destination);
  }

  private beep(freq = 440, dur = 0.12, type: OscillatorType = "square") {
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(this.master);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  play(name: "shoot" | "hit" | "boss" | "pick" | "step" | "ui" = "ui") {
    switch (name) {
      case "shoot": this.beep(950, 0.07, "square"); break;
      case "hit": this.beep(220, 0.08, "sawtooth"); break;
      case "boss": this.beep(130, 0.22, "triangle"); break;
      case "pick": this.beep(660, 0.06, "triangle"); break;
      default: this.beep(440, 0.05, "sine"); break;
    }
  }

  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }
}

/** ---------- Tipos de juego ---------- */
type Bullet = { p: Vec; v: Vec; life: number };
type Enemy = { p: Vec; v: Vec; hp: number, speed: number };
type Game = {
  player: { p: Vec; v: Vec; hp: number; speed: number };
  bullets: Bullet[];
  enemies: Enemy[];
  score: number;
  time: number;
  w: number; h: number;
  rng: number;
};

type Difficulty = "easy" | "normal" | "hard";

/** ---------- Creación de juego ---------- */
function createGame(w: number, h: number, diff: Difficulty): Game {
  const meta = {
    easy:   { pHp: 12, eHp: 2,  pSp: 220, eSp: 60 },
    normal: { pHp: 10, eHp: 3,  pSp: 200, eSp: 70 },
    hard:   { pHp:  8, eHp: 4,  pSp: 190, eSp: 80 },
  }[diff];

  return {
    player: { p: { x: w / 2, y: h / 2 }, v: { x: 0, y: 0 }, hp: meta.pHp, speed: meta.pSp },
    bullets: [],
    enemies: [],
    score: 0,
    time: 0,
    w, h,
    rng: Math.random() * 1e9,
  };
}

/** ---------- Entrada ---------- */
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

/** ---------- Update y Render ---------- */
function spawnEnemy(g: Game, around?: Vec) {
  const margin = 40;
  const side = Math.floor(rand(0, 4));
  const p: Vec = { x: 0, y: 0 };
  if (around) {
    // cerca del borde pero hacia el jugador
    const angle = Math.atan2(around.y - g.h/2, around.x - g.w/2) + rand(-0.6, 0.6);
    p.x = clamp(around.x + Math.cos(angle) * rand(220, 280), margin, g.w - margin);
    p.y = clamp(around.y + Math.sin(angle) * rand(220, 280), margin, g.h - margin);
  } else {
    if (side === 0) { p.x = rand(margin, g.w - margin); p.y = margin; }
    if (side === 1) { p.x = rand(margin, g.w - margin); p.y = g.h - margin; }
    if (side === 2) { p.x = margin; p.y = rand(margin, g.h - margin); }
    if (side === 3) { p.x = g.w - margin; p.y = rand(margin, g.h - margin); }
  }
  const sp = rand(60, 90);
  g.enemies.push({ p, v: { x: 0, y: 0 }, hp: rand(2,4), speed: sp });
}

function updateGame(g: Game, dt: number, keys: Record<string, boolean>, sfx: Sfx) {
  g.time += dt;

  // movimiento jugador
  const p = g.player;
  const ax = (keys["d"] ? 1 : 0) - (keys["a"] ? 1 : 0);
  const ay = (keys["s"] ? 1 : 0) - (keys["w"] ? 1 : 0);
  const len = Math.hypot(ax, ay) || 1;
  p.v.x = (ax/len) * p.speed;
  p.v.y = (ay/len) * p.speed;
  p.p.x = clamp(p.p.x + p.v.x * dt, 8, g.w - 8);
  p.p.y = clamp(p.p.y + p.v.y * dt, 8, g.h - 8);

  // disparo auto si mouseDown (flag en keys["mouse"])
  if (keys["mouse"]) {
    if ((g.time % 0.18) < dt) {
      const mp = (keys as any).__mouse as Vec | undefined;
      if (mp) {
        const ang = Math.atan2(mp.y - p.p.y, mp.x - p.p.x);
        const v: Vec = { x: Math.cos(ang) * 460, y: Math.sin(ang) * 460 };
        g.bullets.push({ p: { x: p.p.x, y: p.p.y }, v, life: 0.8 });
        sfx.play("shoot");
      }
    }
  }

  // actualizar balas
  g.bullets.forEach(b => {
    b.p.x += b.v.x * dt;
    b.p.y += b.v.y * dt;
    b.life -= dt;
  });
  g.bullets = g.bullets.filter(b => b.life > 0 && b.p.x>=-10 && b.p.x<=g.w+10 && b.p.y>=-10 && b.p.y<=g.h+10);

  // spawner
  if ((g.time % 1.2) < dt) spawnEnemy(g, p.p);

  // mover enemigos
  for (const e of g.enemies) {
    const dx = p.p.x - e.p.x, dy = p.p.y - e.p.y;
    const L = Math.hypot(dx, dy) || 1;
    e.v.x = (dx / L) * e.speed;
    e.v.y = (dy / L) * e.speed;
    e.p.x += e.v.x * dt;
    e.p.y += e.v.y * dt;
  }

  // colisión bala-enemigo
  for (const e of g.enemies) {
    for (const b of g.bullets) {
      if (dist2(e.p, b.p) < 18*18) {
        e.hp -= 1;
        b.life = -1;
        g.score += 1;
        sfx.play("hit");
      }
    }
  }
  g.enemies = g.enemies.filter(e => e.hp > 0);

  // colisión enemigo-jugador
  for (const e of g.enemies) {
    if (dist2(e.p, p.p) < 20*20) {
      p.hp -= 1;
      sfx.play("hit");
      // knockback leve
      const dx = p.p.x - e.p.x, dy = p.p.y - e.p.y, L = Math.hypot(dx, dy)||1;
      p.p.x = clamp(p.p.x + (dx/L) * 20, 8, g.w-8);
      p.p.y = clamp(p.p.y + (dy/L) * 20, 8, g.h-8);
    }
  }
}

/** ---------- Render ---------- */
function drawGame(g: Game, ctx: CanvasRenderingContext2D, fps: number) {
  ctx.clearRect(0,0,g.w,g.h);

  // fondo
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0,0,g.w,g.h);

  // jugador
  ctx.fillStyle = "#87CEFA";
  ctx.beginPath();
  ctx.arc(g.player.p.x, g.player.p.y, 10, 0, Math.PI*2);
  ctx.fill();

  // balas
  ctx.fillStyle = "#eab308";
  for (const b of g.bullets) {
    ctx.beginPath();
    ctx.arc(b.p.x, b.p.y, 3, 0, Math.PI*2);
    ctx.fill();
  }

  // enemigos
  ctx.fillStyle = "#ef4444";
  for (const e of g.enemies) {
    ctx.beginPath();
    ctx.arc(e.p.x, e.p.y, 12, 0, Math.PI*2);
    ctx.fill();
  }

  // HUD
  ctx.fillStyle = "#9ca3af";
  ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText(`HP: ${g.player.hp}`, 12, 18);
  ctx.fillText(`Score: ${g.score}`, 12, 34);
  ctx.fillText(`FPS: ${fps.toFixed(0)}`, g.w - 80, 18);
}

/** ---------- Componente principal ---------- */
export default function SuperRogueLitePlus() {
  const [screen, setScreen] = useState<"menu"|"playing"|"paused"|"gameover">("menu");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [sfxOn, setSfxOn] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D|null>(null);
  const gameRef = useRef<Game|null>(null);
  const sfxRef = useRef<Sfx|null>(null);
  const keysRef = useKeys();

  const DIFF = useMemo(() => (["easy","normal","hard"] as Difficulty[]), []);

  // inicializar SFX una sola vez
  useEffect(() => { sfxRef.current = new Sfx(); }, []);

  // listeners de mouse para apuntar/disparo continuo
  useEffect(() => {
    function onDown(e: MouseEvent) {
      (keysRef.current as any)["mouse"] = true;
      (keysRef.current as any).__mouse = { x: e.offsetX, y: e.offsetY };
    }
    function onUp() { (keysRef.current as any)["mouse"] = false; }
    function onMove(e: MouseEvent) {
      (keysRef.current as any).__mouse = { x: e.offsetX, y: e.offsetY };
    }
    const c = canvasRef.current;
    if (!c) return;
    c.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    c.addEventListener("mousemove", onMove);
    return () => {
      c.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      c.removeEventListener("mousemove", onMove);
    };
  }, [screen]);

  // loop de juego
  useEffect(() => {
    if (screen !== "playing") return;

    const c = canvasRef.current!;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctxRef.current = ctx;

    let last = performance.now();
    let acc = 0;
    let frames = 0;
    let fps = 0;
    let tFps = 0;

    const step = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.04);
      last = t;

      const g = gameRef.current!;
      // lógica
      updateGame(g, dt, keysRef.current, sfxRef.current!);

      // controles adicionales
      if (keysRef.current["p"]) setScreen((s)=> s==="paused" ? "playing" : "paused");

      // render (solo si no está en pause)
      if (screen === "playing") {
        acc += dt; frames++;
        if (t - tFps > 500) {
          fps = frames / (acc || 1e-6);
          frames = 0; acc = 0; tFps = t;
        }
        drawGame(g, ctx, fps);
      }

      if (g.player.hp <= 0) {
        setScreen("gameover");
        return;
      }
      req = requestAnimationFrame(step);
    };

    let req = requestAnimationFrame(step);
    return () => cancelAnimationFrame(req);
  }, [screen]);

  // Crear el juego al empezar
  function startGame() {
    // desbloquear audio
    sfxRef.current?.resume();
    // crear juego
    const w = 960, h = 600;
    gameRef.current = createGame(w, h, difficulty);
    setScreen("playing");
  }

  function loadGame() {
    alert("Cargar: demo sin almacenamiento todavía 🙂");
  }

  // layout
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <div className="w-full max-w-[1100px] mx-auto px-4 py-6 md:grid md:grid-cols-2 gap-6">
        <header className="w-full max-w-[1100px] flex items-center justify-between">
          <h1 className="text-2xl font-bold">SUPER ROGUELITE <span className="text-indigo-400">PLUS</span></h1>
          <div className="text-sm opacity-75 flex items-center gap-3">
            <span>FPS: {/* mostrado en canvas */}</span>
            <label className="select-none cursor-pointer flex items-center gap-1">
              <input
                type="checkbox"
                checked={sfxOn}
                onChange={(e)=>{ setSfxOn(e.target.checked); sfxRef.current!.master.gain.value = e.target.checked ? 0.06 : 0; }}
              />
              <span>SFX</span>
            </label>
          </div>
        </header>

        {screen === "menu" && (
          <div className="bg-slate-800/60 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-2">Nuevo Juego</h2>
            <p className="text-sm opacity-80 mb-4">Mapa procedural, enemigos con IA y sonidos. Sin assets externos.</p>

            <div className="flex items-center gap-4 mb-4">
              <label className="text-sm opacity-90">Dificultad:</label>
              <select
                value={difficulty}
                onChange={(e)=>setDifficulty(e.target.value as Difficulty)}
                className="pointer-events-auto bg-slate-700 rounded-xl px-3 py-2"
              >
                <option value="easy">Fácil</option>
                <option value="normal">Normal</option>
                <option value="hard">Difícil</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={startGame}
                className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600"
              >
                Comenzar
              </button>
              <button
                onClick={loadGame}
                className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600"
              >
                Cargar
              </button>
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
          <h2 className="text-xl font-bold mb-2">Controles</h2>
          <ul className="text-sm space-y-1 opacity-90">
            <li>WASD: moverte • Clic: disparar</li>
            <li>Espacio: dash (futuro) • E: interactuar (futuro)</li>
            <li>P: pausar / reanudar</li>
          </ul>
          <h3 className="text-sm font-semibold mt-4">Objetivo</h3>
          <p className="text-sm opacity-80">Sobrevive, derrota enemigos, sube el puntaje.</p>
        </div>
      </div>
    </div>
  );
}
