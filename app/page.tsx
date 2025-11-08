"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type CharacterId = "Naruto" | "Sasuke" | "Sakura";

type Fighter = {
  id: 0 | 1;
  name: CharacterId;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  facing: 1 | -1;
  hp: number;
  lastHitAt: number;
  cooldowns: Record<string, number>;
  grounded: boolean;
};

type Attack = {
  ownerId: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  damage: number;
  knockX: number;
  knockY: number;
  expiresAt: number;
  pierce?: boolean;
};

const W = 960;
const H = 540;
const GRAVITY = 0.85;
const FRICTION = 0.85;
const GROUND_Y = H - 80;

const COLORS: Record<CharacterId, string> = {
  Naruto: "#f59e0b",
  Sasuke: "#64748b",
  Sakura: "#ec4899",
};

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function rectsOverlap(a:{x:number;y:number;w:number;h:number}, b:{x:number;y:number;w:number;h:number}){
  return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
}

function createFighter(id: 0 | 1, name: CharacterId): Fighter {
  return {
    id,
    name,
    color: COLORS[name],
    x: id === 0 ? 160 : W - 200,
    y: GROUND_Y - 120,
    vx: 0,
    vy: 0,
    width: 48,
    height: 120,
    facing: id === 0 ? 1 : -1,
    hp: 100,
    lastHitAt: -99999,
    cooldowns: {},
    grounded: true,
  };
}

type Technique = {
  key: string;
  name: string;
  cooldownMs: number;
  exec: (me: Fighter, now: number, projectiles: Attack[], opponent: Fighter) => void;
};

function getTechniques(charName: CharacterId): Technique[] {
  switch (charName) {
    case "Naruto":
      return [
        { key: "basic", name: "Kunai", cooldownMs: 300, exec(me, now, projectiles){
            // short poke in front
            const w=36, h=40; const x = me.x + (me.facing>0? me.width : -w);
            projectiles.push({ ownerId: me.id, x, y: me.y+40, vx: 0, vy: 0, w, h, color: "#fde68a", damage: 6, knockX: 5*me.facing, knockY: -2, expiresAt: now+120 });
        }},
        { key: "t1", name: "Rasengan", cooldownMs: 1800, exec(me, now, projectiles){
            const speed=9*me.facing; const w=30, h=30; const x = me.x + (me.facing>0? me.width : -w);
            projectiles.push({ ownerId: me.id, x, y: me.y+60, vx: speed, vy: 0, w, h, color: "#60a5fa", damage: 16, knockX: 9*me.facing, knockY: -6, expiresAt: now+1400, pierce:false });
        }},
        { key: "t2", name: "Shadow Clones", cooldownMs: 4000, exec(me, now, projectiles){
            for(let i=0;i<3;i++){
              const off = (i-1)*26;
              const w=24,h=80; const x = me.x + off + (me.facing>0? me.width : -w);
              projectiles.push({ ownerId: me.id, x, y: me.y+20, vx: 7*me.facing, vy: 0, w, h, color: "#fbbf24", damage: 8, knockX: 6*me.facing, knockY: -4, expiresAt: now+1000 });
            }
        }},
        { key: "ult", name: "Nine-Tails Blast", cooldownMs: 7000, exec(me, now, projectiles){
            // wide wave
            projectiles.push({ ownerId: me.id, x: me.x-20, y: me.y-10, vx: 7*me.facing, vy: 0, w: 140, h: 140, color: "#f97316", damage: 24, knockX: 12*me.facing, knockY: -10, expiresAt: now+700 });
        }},
      ];
    case "Sasuke":
      return [
        { key: "basic", name: "Slash", cooldownMs: 300, exec(me, now, projectiles){
            const w=44,h=44; const x = me.x + (me.facing>0? me.width : -w);
            projectiles.push({ ownerId: me.id, x, y: me.y+38, vx: 0, vy: 0, w, h, color: "#94a3b8", damage: 7, knockX: 6*me.facing, knockY: -2, expiresAt: now+120 });
        }},
        { key: "t1", name: "Chidori", cooldownMs: 1800, exec(me, now, projectiles){
            const w=34,h=34; const x = me.x + (me.facing>0? me.width : -w);
            projectiles.push({ ownerId: me.id, x, y: me.y+58, vx: 10*me.facing, vy: 0, w, h, color: "#60a5fa", damage: 18, knockX: 10*me.facing, knockY: -6, expiresAt: now+1200 });
        }},
        { key: "t2", name: "Fireball", cooldownMs: 3000, exec(me, now, projectiles){
            const w=32,h=32; const x = me.x + (me.facing>0? me.width : -w);
            projectiles.push({ ownerId: me.id, x, y: me.y+50, vx: 6*me.facing, vy: 0, w, h, color: "#ef4444", damage: 14, knockX: 7*me.facing, knockY: -4, expiresAt: now+2200, pierce: true });
        }},
        { key: "ult", name: "Sharingan Counter", cooldownMs: 6000, exec(me, now, projectiles){
            // brief zone; if opponent overlaps, big knockback
            projectiles.push({ ownerId: me.id, x: me.x-20, y: me.y, vx: 0, vy: 0, w: me.width+40, h: me.height, color: "#6366f1", damage: 10, knockX: 14*me.facing, knockY: -10, expiresAt: now+400 });
        }},
      ];
    case "Sakura":
      return [
        { key: "basic", name: "Punch", cooldownMs: 300, exec(me, now, projectiles){
            const w=42,h=44; const x = me.x + (me.facing>0? me.width : -w);
            projectiles.push({ ownerId: me.id, x, y: me.y+40, vx: 0, vy: 0, w, h, color: "#f472b6", damage: 8, knockX: 6*me.facing, knockY: -3, expiresAt: now+120 });
        }},
        { key: "t1", name: "Super Punch", cooldownMs: 1600, exec(me, now, projectiles){
            const w=60,h=60; const x = me.x + (me.facing>0? me.width : -w);
            projectiles.push({ ownerId: me.id, x, y: me.y+48, vx: 4*me.facing, vy: 0, w, h, color: "#fb7185", damage: 16, knockX: 9*me.facing, knockY: -8, expiresAt: now+700 });
        }},
        { key: "t2", name: "Healing", cooldownMs: 5000, exec(me, now){
            me.hp = clamp(me.hp + 20, 0, 100);
        }},
        { key: "ult", name: "Cherry Blossom Storm", cooldownMs: 7000, exec(me, now, projectiles){
            projectiles.push({ ownerId: me.id, x: me.x-40, y: me.y-20, vx: 0, vy: 0, w: me.width+80, h: me.height+60, color: "#f472b6", damage: 22, knockX: 10*me.facing, knockY: -10, expiresAt: now+600 });
        }},
      ];
  }
}

function useKeyPress() {
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const d = (e: KeyboardEvent) => { keys.current[e.key] = true; };
    const u = (e: KeyboardEvent) => { keys.current[e.key] = false; };
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    return () => { window.removeEventListener("keydown", d); window.removeEventListener("keyup", u); };
  }, []);
  return keys;
}

export default function Page() {
  const [p1, setP1] = useState<CharacterId | null>(null);
  const [p2, setP2] = useState<CharacterId | null>(null);
  const [started, setStarted] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keys = useKeyPress();
  const [tick, setTick] = useState(0);

  const [fighters, setFighters] = useState<Fighter[] | null>(null);
  const [projectiles, setProjectiles] = useState<Attack[]>([]);

  const techMap = useMemo(() => {
    if (!fighters) return {} as Record<0|1, Technique[]>;
    return {
      0: getTechniques(fighters[0].name),
      1: getTechniques(fighters[1].name),
    } as Record<0|1, Technique[]>;
  }, [fighters]);

  useEffect(() => {
    if (started && p1 && p2) {
      setFighters([createFighter(0, p1), createFighter(1, p2)]);
      setProjectiles([]);
      setWinner(null);
    }
  }, [started, p1, p2]);

  useEffect(() => {
    if (!fighters) return;
    const ctx = canvasRef.current?.getContext("2d");
    let raf = 0;

    const step = () => {
      const now = performance.now();
      const f0 = { ...fighters[0] };
      const f1 = { ...fighters[1] };

      // controls
      // P1: A/D move, W jump, J basic, U/I/O techniques
      const k = keys.current;
      const speed = 3.2;
      const jump = -15;

      // Face opponent
      f0.facing = (f1.x > f0.x) ? 1 : -1;
      f1.facing = (f0.x > f1.x) ? 1 : -1;

      // Move P1
      if (k["a"] || k["A"]) f0.vx -= 0.7; if (k["d"] || k["D"]) f0.vx += 0.7;
      if ((k["w"] || k["W"]) && f0.grounded) { f0.vy = jump; f0.grounded = false; }

      // Move P2: Arrows + 1/2/3 for techniques, "/" for basic
      if (k["ArrowLeft"]) f1.vx -= 0.7; if (k["ArrowRight"]) f1.vx += 0.7;
      if (k["ArrowUp"] && f1.grounded) { f1.vy = jump; f1.grounded = false; }

      f0.vx = clamp(f0.vx, -speed, speed); f1.vx = clamp(f1.vx, -speed, speed);

      // Attacks with cooldowns
      const doCast = (me: Fighter, key: string) => {
        const arr = (techMap as any)[me.id] as Technique[];
        const t = arr?.find(tt => tt.key === key);
        if (!t) return;
        const next = me.cooldowns[t.name] ?? 0;
        if (now < next) return;
        const proj: Attack[] = [];
        t.exec(me, now, proj, me.id===0? f1 : f0);
        (me.cooldowns as any)[t.name] = now + t.cooldownMs;
        projectilesRef = projectilesRef.concat(proj);
      };

      // fire inputs (edge-triggerless, repeats allowed via cooldown)
      if (k["j"] || k["J"]) doCast(f0, "basic");
      if (k["u"] || k["U"]) doCast(f0, "t1");
      if (k["i"] || k["I"]) doCast(f0, "t2");
      if (k["o"] || k["O"]) doCast(f0, "ult");

      if (k["/"]) doCast(f1, "basic");
      if (k["1"]) doCast(f1, "t1");
      if (k["2"]) doCast(f1, "t2");
      if (k["3"]) doCast(f1, "ult");

      // Integrate physics
      const integrate = (f: Fighter) => {
        f.x += f.vx; f.y += f.vy; f.vy += GRAVITY; f.vx *= FRICTION;
        // ground
        if (f.y + f.height >= GROUND_Y) { f.y = GROUND_Y - f.height; f.vy = 0; f.grounded = true; }
        // walls
        f.x = clamp(f.x, 10, W - f.width - 10);
      };
      integrate(f0); integrate(f1);

      // Update projectiles
      let projectilesRef = [...projectiles];
      const newProjectiles: Attack[] = [];
      for (const p of projectilesRef) {
        const pp = { ...p };
        pp.x += pp.vx; pp.y += pp.vy;
        if (now > pp.expiresAt) continue;
        // collide with bounds lightly
        if (pp.x < 0 || pp.x + pp.w > W) { if (!pp.pierce) continue; }

        const target = pp.ownerId === 0 ? f1 : f0;
        const hitbox = { x: pp.x, y: pp.y, w: pp.w, h: pp.h };
        const targetBox = { x: target.x, y: target.y, w: target.width, h: target.height };

        if (rectsOverlap(hitbox, targetBox)) {
          if (now - target.lastHitAt > 150) {
            target.hp = clamp(target.hp - pp.damage, 0, 100);
            target.vx += pp.knockX; target.vy += pp.knockY;
            target.lastHitAt = now;
          }
          if (!pp.pierce) {
            // consume
            continue;
          }
        }
        newProjectiles.push(pp);
      }

      // Winner check
      let win: string | null = null;
      if (f0.hp <= 0) win = `${f1.name} Wins!`;
      if (f1.hp <= 0) win = `${f0.name} Wins!`;

      // Draw
      if (ctx) {
        ctx.clearRect(0,0,W,H);
        // background grid
        ctx.fillStyle = "#0a1326"; ctx.fillRect(0,0,W,H);
        ctx.fillStyle = "#0b1e3a"; for (let x=0;x<W;x+=40){ ctx.fillRect(x,0,1,H);} for(let y=0;y<H;y+=40){ ctx.fillRect(0,y,W,1);} 
        // ground
        ctx.fillStyle = "#0f172a"; ctx.fillRect(0,GROUND_Y,W,H-GROUND_Y);

        // draw projectiles
        for (const p of newProjectiles) {
          const grad = ctx.createLinearGradient(p.x, p.y, p.x+p.w, p.y+p.h);
          grad.addColorStop(0, p.color);
          grad.addColorStop(1, "#ffffff22");
          ctx.fillStyle = grad;
          ctx.fillRect(p.x, p.y, p.w, p.h);
        }

        // draw fighters
        const drawF = (f: Fighter) => {
          // body
          ctx.fillStyle = f.color;
          ctx.fillRect(f.x, f.y, f.width, f.height);
          // face stripe
          ctx.fillStyle = "#ffffff22";
          ctx.fillRect(f.facing>0? f.x+f.width-6 : f.x, f.y+18, 6, 24);
        };
        drawF(f0); drawF(f1);

        // winner text
        if (win) {
          ctx.fillStyle = "#f8fafc"; ctx.font = "bold 42px ui-sans-serif";
          ctx.fillText(win, W/2 - ctx.measureText(win).width/2, 120);
        }
      }

      setFighters([f0, f1]);
      setProjectiles(newProjectiles);
      if (win && !winner) setWinner(win);

      setTick(t => t+1);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [fighters, winner, projectiles, techMap]);

  // Restart
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && p1 && p2 && !started) setStarted(true);
      if (e.key === "r" || e.key === "R") { setStarted(false); setFighters(null); setProjectiles([]); setWinner(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p1, p2, started]);

  const resetSelect = () => { setP1(null); setP2(null); setStarted(false); setWinner(null); setFighters(null); setProjectiles([]); };

  const renderSelection = () => (
    <div className="container">
      <div className="header">
        <div className="h1">Naruto Sprite Fighter</div>
        <div className="small">???????? ?????? (P1 ? P2), ????? ??????? <kbd>Enter</kbd></div>
      </div>

      <div className="card-grid">
        {["Naruto","Sasuke","Sakura"].map(name => (
          <div key={name} className="card" onClick={() => {
            if (!p1) setP1(name as CharacterId);
            else if (!p2) setP2(name as CharacterId);
          }}>
            <h3>{name}</h3>
            <div className="row">
              <span className="badge" style={{borderColor: COLORS[name as CharacterId]}}>????</span>
              <span className="small" style={{ color: COLORS[name as CharacterId] }}>{COLORS[name as CharacterId]}</span>
            </div>
            <div className="small" style={{marginTop:8}}>???????:</div>
            <ul className="small">
              {getTechniques(name as CharacterId).map(t => (<li key={t.name}>{t.name}</li>))}
            </ul>
          </div>
        ))}
      </div>

      <div className="row">
        <div className="badge">P1: {p1 ?? "?"}</div>
        <div className="badge">P2: {p2 ?? "?"}</div>
        <button className="button" disabled={!p1 || !p2} onClick={() => setStarted(true)}>?????? (<kbd>Enter</kbd>)</button>
        <button className="button secondary" onClick={resetSelect}>?????</button>
      </div>

      <div className="footer" style={{marginTop:16}}>
        ?????????? ? P1: <kbd>A</kbd>/<kbd>D</kbd> ??????, <kbd>W</kbd> ??????, ?????: <kbd>J</kbd>, <kbd>U</kbd>, <kbd>I</kbd>, <kbd>O</kbd>. P2: <kbd>?</kbd>/<kbd>?</kbd>, <kbd>?</kbd>, ?????: <kbd>/</kbd>, <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>. ??????????: <kbd>R</kbd>.
      </div>
    </div>
  );

  if (!started || !fighters) {
    return renderSelection();
  }

  const f0 = fighters[0];
  const f1 = fighters[1];

  const p1Tech = getTechniques(f0.name);
  const p2Tech = getTechniques(f1.name);

  return (
    <div className="container">
      <div className="header">
        <div className="h1">Naruto Sprite Fighter</div>
        <div className="row small">
          <div className="badge">P1: {f0.name}</div>
          <div className="badge">P2: {f1.name}</div>
          <button className="button secondary" onClick={() => { setStarted(false); setFighters(null); setWinner(null); }}>??????? ??????</button>
        </div>
      </div>

      <div className="arena-wrap">
        <div className="sidepanel">
          <div className="small" style={{marginBottom:6}}>P1 HP</div>
          <div className="hp"><div className="hp-fill" style={{width: f0.hp+"%"}}/></div>
          <div className="caption" style={{marginTop:10}}>??????? P1</div>
          <div className="cooldowns">
            {p1Tech.map(t => {
              const next = f0.cooldowns[t.name] ?? 0;
              const remain = Math.max(0, Math.ceil((next - performance.now())/1000));
              return <div key={t.name} className="cd" title={t.name}>{remain}s</div>;
            })}
          </div>

          <div className="caption" style={{marginTop:16}}>?????????? P1</div>
          <div className="small"><kbd>A</kbd>/<kbd>D</kbd>, <kbd>W</kbd>, <kbd>J</kbd>, <kbd>U</kbd>, <kbd>I</kbd>, <kbd>O</kbd></div>

          <div className="caption" style={{marginTop:20}}>?????????? P2</div>
          <div className="small"><kbd>?</kbd>/<kbd>?</kbd>, <kbd>?</kbd>, <kbd>/</kbd>, <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd></div>

          <div className="caption" style={{marginTop:20}}>
            ?????????? ???: <kbd>R</kbd>
          </div>
        </div>

        <div className="canvas-wrap">
          <canvas ref={canvasRef} width={W} height={H} />
          <div className="caption">{winner ? winner + " ??????? R ??? ????????." : ""}</div>
        </div>

        <div className="sidepanel">
          <div className="small" style={{marginBottom:6}}>P2 HP</div>
          <div className="hp"><div className="hp-fill" style={{width: f1.hp+"%", background: "linear-gradient(90deg, #22d3ee, #38bdf8)"}}/></div>
          <div className="caption" style={{marginTop:10}}>??????? P2</div>
          <div className="cooldowns">
            {p2Tech.map(t => {
              const next = f1.cooldowns[t.name] ?? 0;
              const remain = Math.max(0, Math.ceil((next - performance.now())/1000));
              return <div key={t.name} className="cd" title={t.name}>{remain}s</div>;
            })}
          </div>
        </div>
      </div>

      <div className="footer">Canvas 2D ???? ??? ???????? ? ????? ? ??????? ????????? ???????.</div>
    </div>
  );
}
