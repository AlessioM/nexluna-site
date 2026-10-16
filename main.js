"use strict";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------
 * Background: a tiny orbital battle. Ships orbit a planet under real
 * inverse-square gravity, burn to keep their orbit, and fire shells that
 * curve around the planet — the same idea as the game, in ~200 lines.
 * ------------------------------------------------------------------ */
(() => {
  const canvas = document.getElementById("space");
  const ctx = canvas.getContext("2d");
  const COLORS = ["#3ee0d8", "#ff5a8a", "#ffc94a", "#7ee07a", "#8b6cf6"];
  const DT = 1 / 120;
  let W = 0, H = 0, dpr = 1, S = 0, GM = 0, planetR = 0, cx = 0, cy = 0;
  let stars = [], ships = [], shells = [], sparks = [];
  let scrollY = window.scrollY, running = true, last = 0, acc = 0, t = 0;

  const rand = (a, b) => a + Math.random() * (b - a);

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const wide = W > 920;
    S = wide ? Math.min(W * 0.55, H * 0.95) : Math.min(W * 0.95, H * 0.48);
    cx = wide ? W * 0.72 : W * 0.5;
    cy = wide ? H * 0.52 : H * 0.24;
    planetR = S * 0.12;
    const period = 13, r0 = S * 0.32;              // orbital period at r0, seconds
    GM = (4 * Math.PI * Math.PI * r0 ** 3) / (period * period);
    stars = Array.from({ length: Math.round((W * H) / 5200) }, () => ({
      x: Math.random() * W, y: Math.random() * H * 1.5,
      r: rand(0.3, 1.5), z: rand(0.15, 1), ph: rand(0, 6.28), sp: rand(0.6, 2.2),
    }));
    ships = COLORS.map((color, i) => {
      const r = S * [0.27, 0.36, 0.44, 0.31, 0.5][i];
      const a = rand(0, Math.PI * 2);
      const dir = i === 1 ? -1 : 1;                 // one rival flies the other way round
      const v = Math.sqrt(GM / r) * rand(0.93, 1.06);
      return {
        color, x: Math.cos(a) * r, y: Math.sin(a) * r,
        vx: -Math.sin(a) * v * dir, vy: Math.cos(a) * v * dir,
        rMin: r * 0.8, rMax: r * 1.25, burn: 0, cool: rand(1, 4), aim: 0, ax: 0, ay: 0,
        flash: 0, trail: [],
      };
    });
    shells = []; sparks = [];
  }

  function gravity(b) {
    const d2 = b.x * b.x + b.y * b.y, d = Math.sqrt(d2), g = GM / (d2 * d);
    b.vx -= b.x * g * DT; b.vy -= b.y * g * DT;
    return d;
  }

  function step() {
    t += DT;
    for (const s of ships) {
      const d = gravity(s);
      const climb = (s.x * s.vx + s.y * s.vy) / d;
      // a little autopilot, like the program on the page: keep the orbit in a band
      s.burn = 0;
      if ((d < s.rMin && climb < 0) || d < planetR * 1.6) {
        s.vx += (s.x / d) * S * 0.25 * DT; s.vy += (s.y / d) * S * 0.25 * DT; s.burn = 1;
      } else if (d > s.rMax && climb > 0) {
        s.vx -= (s.x / d) * S * 0.2 * DT; s.vy -= (s.y / d) * S * 0.2 * DT; s.burn = 1;
      }
      s.x += s.vx * DT; s.y += s.vy * DT;
      s.cool -= DT; s.aim = Math.max(0, s.aim - DT); s.flash = Math.max(0, s.flash - DT);
      if (s.cool <= 0) fire(s);
    }
    for (const sh of shells) {
      const d = gravity(sh);
      sh.x += sh.vx * DT; sh.y += sh.vy * DT; sh.life -= DT;
      if (d < planetR) { sh.life = 0; burst(sh.x, sh.y, "#ffb057", 6); continue; }
      for (const s of ships) {
        if (s === sh.from) continue;
        if ((s.x - sh.x) ** 2 + (s.y - sh.y) ** 2 < (S * 0.022) ** 2) {
          sh.life = 0; s.flash = 0.35; burst(sh.x, sh.y, sh.color, 14); break;
        }
      }
    }
    shells = shells.filter((sh) => sh.life > 0);
    for (const p of sparks) { p.x += p.vx * DT; p.y += p.vy * DT; p.vx *= 0.985; p.vy *= 0.985; p.life -= DT; }
    sparks = sparks.filter((p) => p.life > 0);
  }

  function fire(s) {
    s.cool = rand(1.6, 3.6);
    let best = null, bd = Infinity;
    for (const o of ships) {
      if (o === s) continue;
      const d = (o.x - s.x) ** 2 + (o.y - s.y) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return;
    const speed = S * 0.55, flight = Math.sqrt(bd) / speed;   // "aim ahead of nearest enemy"
    const tx = best.x + (best.vx - s.vx) * flight, ty = best.y + (best.vy - s.vy) * flight;
    const dx = tx - s.x, dy = ty - s.y, n = Math.hypot(dx, dy) || 1;
    s.aim = 0.45; s.ax = dx / n; s.ay = dy / n;
    shells.push({ x: s.x, y: s.y, vx: s.vx + (dx / n) * speed, vy: s.vy + (dy / n) * speed,
      life: 3.2, color: s.color, from: s, trail: [] });
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28), v = rand(0.05, 0.22) * S;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.8), color });
    }
  }

  function drawPlanet(px, py) {
    const glow = ctx.createRadialGradient(px, py, planetR * 0.8, px, py, planetR * 3);
    glow.addColorStop(0, "rgba(255,150,60,0.22)"); glow.addColorStop(1, "rgba(255,150,60,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(px, py, planetR * 3, 0, 6.29); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, planetR, 0, 6.29); ctx.clip();
    const body = ctx.createRadialGradient(px - planetR * 0.3, py - planetR * 0.3, planetR * 0.1, px, py, planetR);
    body.addColorStop(0, "#ffbf6a"); body.addColorStop(1, "#ff8a3d");
    ctx.fillStyle = body; ctx.fillRect(px - planetR, py - planetR, planetR * 2, planetR * 2);
    ctx.fillStyle = "rgba(240,100,55,0.55)";
    for (const [oy, h] of [[-0.42, 0.07], [-0.05, 0.08], [0.32, 0.07]])
      ctx.fillRect(px - planetR * 0.8, py + planetR * oy, planetR * 1.6, planetR * h);
    ctx.fillStyle = "rgba(225,85,50,0.75)";                  // shaded crescent, like the game's planets
    ctx.beginPath(); ctx.arc(px, py, planetR, -0.9, 2.5); ctx.arc(px - planetR * 0.16, py - planetR * 0.1, planetR * 0.98, 2.5, -0.9, true); ctx.fill();
    ctx.fillStyle = "rgba(255,226,170,0.85)";
    ctx.beginPath(); ctx.arc(px - planetR * 0.33, py - planetR * 0.33, planetR * 0.17, 0, 6.29); ctx.fill();
    ctx.beginPath(); ctx.arc(px - planetR * 0.1, py - planetR * 0.33, planetR * 0.06, 0, 6.29); ctx.fill();
    ctx.restore();
  }

  function drawTrail(trail, px, py, color, width) {
    for (let i = 1; i < trail.length; i++) {
      ctx.strokeStyle = color; ctx.globalAlpha = (i / trail.length) * 0.55; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(px + trail[i - 1][0], py + trail[i - 1][1]); ctx.lineTo(px + trail[i][0], py + trail[i][1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawShip(s, px, py) {
    const x = px + s.x, y = py + s.y, k = S * 0.016;
    let hx = s.vx, hy = s.vy;
    if (s.aim > 0) { hx = s.ax; hy = s.ay; }
    const ang = Math.atan2(hy, hx);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    if (s.burn) {
      ctx.fillStyle = "#ffd36b"; ctx.globalAlpha = 0.6 + Math.random() * 0.4;
      ctx.beginPath(); ctx.moveTo(-k * 0.6, -k * 0.35); ctx.lineTo(-k * (1.6 + Math.random() * 0.7), 0); ctx.lineTo(-k * 0.6, k * 0.35); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.shadowColor = s.color; ctx.shadowBlur = 14;
    ctx.fillStyle = s.flash > 0 ? "#ffffff" : s.color;
    ctx.beginPath(); ctx.moveTo(k * 1.3, 0); ctx.lineTo(-k * 0.8, -k * 0.8); ctx.lineTo(-k * 0.35, 0); ctx.lineTo(-k * 0.8, k * 0.8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const st of stars) {
      const y = ((st.y - scrollY * st.z * 0.25) % (H * 1.5) + H * 1.5) % (H * 1.5);
      if (y > H) continue;
      ctx.globalAlpha = 0.35 + 0.45 * (reduceMotion ? 0.7 : (Math.sin(t * st.sp + st.ph) + 1) / 2) * st.z;
      ctx.fillStyle = "#dfe4ff"; ctx.beginPath(); ctx.arc(st.x, y, st.r, 0, 6.29); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const px = cx, py = cy - scrollY * 0.55;               // the system drifts up as you scroll
    if (py < -S) return;
    const fade = Math.max(0, Math.min(1, 1 - scrollY / (H * 1.1)));
    ctx.globalAlpha = 1;
    ctx.save(); ctx.globalAlpha = 0.25 + 0.75 * fade;
    for (const s of ships) drawTrail(s.trail, px, py, s.color, 1.6);
    drawPlanet(px, py);
    for (const sh of shells) {
      drawTrail(sh.trail, px, py, sh.color, 1.2);
      ctx.fillStyle = "#fff"; ctx.shadowColor = sh.color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(px + sh.x, py + sh.y, S * 0.005 + 1, 0, 6.29); ctx.fill(); ctx.shadowBlur = 0;
    }
    for (const s of ships) drawShip(s, px, py);
    for (const p of sparks) { ctx.globalAlpha = Math.min(1, p.life * 2) * (0.25 + 0.75 * fade); ctx.fillStyle = p.color; ctx.fillRect(px + p.x - 1.2, py + p.y - 1.2, 2.4, 2.4); }
    ctx.restore();
  }

  let trailTick = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; acc += dt;
    while (acc >= DT) { step(); acc -= DT; }
    if (++trailTick % 2 === 0) {
      for (const s of ships) { s.trail.push([s.x, s.y]); if (s.trail.length > 70) s.trail.shift(); }
      for (const sh of shells) { sh.trail.push([sh.x, sh.y]); if (sh.trail.length > 14) sh.trail.shift(); }
    }
    draw();
    requestAnimationFrame(frame);
  }

  layout();
  if (reduceMotion) {
    // one still frame: pre-run the battle a few seconds so trails exist
    for (let i = 0; i < 600; i++) { step(); if (i % 4 === 0) for (const s of ships) { s.trail.push([s.x, s.y]); if (s.trail.length > 70) s.trail.shift(); } }
    draw();
  } else {
    requestAnimationFrame((n) => { last = n; frame(n); });
  }
  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { layout(); if (reduceMotion) draw(); }, 150); });
  window.addEventListener("scroll", () => { scrollY = window.scrollY; if (reduceMotion) draw(); }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (reduceMotion) return;
    running = !document.hidden;
    if (running) requestAnimationFrame((n) => { last = n; frame(n); });
  });
})();

/* ------------------------------------------------------------------
 * Block demo: highlight the running block, the way the game does.
 * ------------------------------------------------------------------ */
(() => {
  const all = [...document.querySelectorAll("#blocks .b:not(.c-mid)")];
  if (!all.length || reduceMotion) return;
  const find = (txt) => all.find((b) => b.textContent.replace(/\s+/g, " ").trim().startsWith(txt));
  const intro = ["when match starts", "point prograde", "thrust", "wait 0.3", "stop engine"].map(find);
  const loopTop = find("forever"), ifTop = find("if");
  const thenPath = [ifTop, find("point radial"), all[all.indexOf(find("point radial")) + 1]];
  const elsePath = [ifTop, find("point at"), find("fire"), find("wait 0.5")];
  const seq = [...intro, loopTop];
  for (let i = 0; i < 6; i++) seq.push(...(i % 3 === 1 ? thenPath : elsePath));
  let i = 0, prev = null;
  setInterval(() => {
    if (prev) prev.classList.remove("active");
    prev = seq[i % seq.length]; prev.classList.add("active");
    i = (i + 1) % seq.length;
    if (i === 0) i = intro.length;                       // after the first pass, stay inside forever
  }, 650);
})();

/* ------------------------------------------------------------------
 * Gallery, chapter marquee, lightbox, scroll reveal.
 * ------------------------------------------------------------------ */
const SHOTS = [
  ["03_live_code_replay", "Live code", "Your program runs beside the battle — the active block lights up."],
  ["01_orbital_battle", "Orbital battle", "Coded ships trade curving shots around an orange planet."],
  ["02_block_editor", "Block editor", "Snap motion, sensing and combat blocks into a ship program."],
  ["04_campaign", "Campaign", "Ten chapters and 50 missions, each with up to three stars."],
  ["05_block_values", "Live values", "Pick numbers or live sensor readings for any block."],
  ["06_victory", "Victory", "A three-star win over the finished program and replay."],
  ["07_versus", "Versus", "Pick shared rival ships and a duel arena."],
  ["08_tournament", "Tournaments", "Standings for seven programmed ships, with replays of every match."],
];

(() => {
  const gallery = document.getElementById("gallery");
  SHOTS.slice(1).forEach(([file, title, cap], k) => {
    const fig = document.createElement("figure");
    fig.innerHTML = `<button class="shot" data-i="${k + 1}" aria-label="Enlarge: ${title}">
      <img src="img/screens/${file}-800.webp" width="800" height="450" loading="lazy" alt="${cap}"></button>
      <figcaption><b>${title}</b>${cap}</figcaption>`;
    gallery.appendChild(fig);
  });

  const chapters = ["Stay Alive", "First Blood", "Bent Bullets", "Free-for-All", "Squads", "Moons", "Evasion", "Scarcity", "Champions", "Grand Tour"];
  const track = document.getElementById("track");
  const chips = chapters.map((c, i) => `<span class="chip"><b>${i + 1}</b>${c}</span>`).join("");
  track.innerHTML = chips + chips;                       // doubled for a seamless loop
  track.lastElementChild && [...track.children].slice(chapters.length).forEach((el) => el.setAttribute("aria-hidden", "true"));

  const dlg = document.getElementById("lightbox"), img = document.getElementById("lb-img"), cap = document.getElementById("lb-cap");
  let cur = 0;
  const show = (i) => {
    cur = (i + SHOTS.length) % SHOTS.length;
    const [file, title, text] = SHOTS[cur];
    img.src = `img/screens/${file}.webp`; img.alt = text; cap.textContent = `${title} — ${text}`;
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".shot");
    if (b) { show(+b.dataset.i); dlg.showModal(); }
  });
  dlg.querySelector(".lb-close").addEventListener("click", () => dlg.close());
  dlg.querySelector(".lb-prev").addEventListener("click", () => show(cur - 1));
  dlg.querySelector(".lb-next").addEventListener("click", () => show(cur + 1));
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(cur - 1);
    if (e.key === "ArrowRight") show(cur + 1);
  });

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal").forEach((el, i) => { el.style.transitionDelay = `${(i % 3) * 80}ms`; io.observe(el); });
})();
