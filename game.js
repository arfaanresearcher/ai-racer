// ============================================================
// AI RACER - Complete Pseudo-3D Racing Game
// ============================================================
(() => {
    "use strict";

    // ===== CONFIG =====
    const TOTAL_LAPS = 3;
    const SEG_LENGTH = 200;
    const RUMBLE_LENGTH = 3;
    const DRAW_DIST = 300;
    const LANES = 3;
    const ROAD_W = 2000;
    const FIELD_OF_VIEW = 100;
    const CAM_HEIGHT = 1000;

    const THEMES = {
        city: {
            skyTop: '#070720', skyBot: '#1a0a3e',
            grass1: '#161628', grass2: '#111120',
            road1: '#3d3d55', road2: '#333348',
            rumble1: '#ff006e', rumble2: '#444460',
            lane: 'rgba(255,255,255,0.15)',
            startLine: '#ffffff',
            fog: '#0a0a2e',
            hasSky: true,
            palette: ['#ff006e', '#00d4ff', '#ffbe00', '#7b2dff', '#00ff88'],
        },
        desert: {
            skyTop: '#e55039', skyBot: '#ff8c42',
            grass1: '#d4a96a', grass2: '#c49858',
            road1: '#555', road2: '#4a4a4a',
            rumble1: '#cc0000', rumble2: '#fff',
            lane: 'rgba(255,255,255,0.25)',
            startLine: '#fff',
            fog: '#ff8c42',
            hasSky: false,
            palette: ['#ff6b35', '#e55039', '#ffc045', '#8b4513', '#daa520'],
        },
        neon: {
            skyTop: '#000005', skyBot: '#0a0020',
            grass1: '#0a0a18', grass2: '#060612',
            road1: '#151530', road2: '#101025',
            rumble1: '#ff00ff', rumble2: '#00ffff',
            lane: 'rgba(0,255,255,0.25)',
            startLine: '#ff00ff',
            fog: '#050510',
            hasSky: true,
            palette: ['#ff00ff', '#00ffff', '#ff006e', '#7b2dff', '#00ff88'],
        },
    };

    const CAR_STATS = {
        speed:    { maxSpd: 13000, accel: 8000, decel: 9000, offroad: 5000, handling: 1.0, color: '#ff006e', name: 'SPEED' },
        balanced: { maxSpd: 11000, accel: 7000, decel: 10000, offroad: 6000, handling: 1.3, color: '#00d4ff', name: 'BALANCED' },
        tank:     { maxSpd: 9500,  accel: 6000, decel: 12000, offroad: 7500, handling: 1.6, color: '#ffbe00', name: 'TANK' },
    };

    const DIFF = {
        easy:   { aiMul: 0.70, aiCount: 3 },
        medium: { aiMul: 0.85, aiCount: 5 },
        hard:   { aiMul: 0.97, aiCount: 7 },
    };

    // ===== STATE =====
    let canvas, ctx, W, H;
    let state = 'menu';
    let selDiff = 'medium', selTrack = 'city', selCar = 'speed';
    let theme;

    let segments = [];
    let totalLength = 0;
    let player = {};
    let keys = {};
    let aiCars = [];
    let raceTime = 0, bestLap = Infinity, topSpeed = 0;
    let lapTimes = [];
    let particles = [];
    let stars = [];
    let skyBuildings = [];
    let lastTS = 0;
    let cameraDepth = 0;

    // ===== INIT =====
    function init() {
        canvas = document.getElementById('gameCanvas');
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
        window.addEventListener('keydown', e => {
            keys[e.code] = true;
            if (e.code === 'KeyP' && (state === 'racing' || state === 'paused')) togglePause();
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
        });
        window.addEventListener('keyup', e => { keys[e.code] = false; });
        setupUI();
        makeStars();
    }

    function resize() {
        canvas.width = W = window.innerWidth;
        canvas.height = H = window.innerHeight;
        cameraDepth = 1 / Math.tan((FIELD_OF_VIEW / 2) * Math.PI / 180);
    }

    function setupUI() {
        document.querySelectorAll('.diff-btn').forEach(b => b.addEventListener('click', () => {
            document.querySelectorAll('.diff-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active'); selDiff = b.dataset.diff;
        }));
        document.querySelectorAll('.track-btn').forEach(b => b.addEventListener('click', () => {
            document.querySelectorAll('.track-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active'); selTrack = b.dataset.track;
        }));
        document.querySelectorAll('.car-btn').forEach(b => b.addEventListener('click', () => {
            document.querySelectorAll('.car-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active'); selCar = b.dataset.car;
        }));
        document.getElementById('start-btn').addEventListener('click', startGame);
        document.getElementById('restart-btn').addEventListener('click', startGame);
        document.getElementById('menu-btn').addEventListener('click', goMenu);
        document.getElementById('pause-quit-btn').addEventListener('click', goMenu);
    }

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }
    function goMenu() { state = 'menu'; showScreen('start-screen'); }

    function makeStars() {
        stars = [];
        for (let i = 0; i < 250; i++) {
            stars.push({ x: Math.random(), y: Math.random() * 0.5, s: Math.random() * 2 + 0.5, b: Math.random(), t: Math.random() * 100 });
        }
    }

    // ===== TRACK BUILDER =====
    function addSegment(curve, y) {
        const n = segments.length;
        segments.push({
            index: n,
            p1: { world: { y: lastY(), z: n * SEG_LENGTH }, camera: {}, screen: {} },
            p2: { world: { y: y, z: (n + 1) * SEG_LENGTH }, camera: {}, screen: {} },
            curve: curve,
            sprites: [],
            cars: [],
            color: Math.floor(n / RUMBLE_LENGTH) % 2 ? {
                road: theme.road1, grass: theme.grass1, rumble: theme.rumble1,
            } : {
                road: theme.road2, grass: theme.grass2, rumble: theme.rumble2,
            },
        });
    }
    function lastY() { return segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y; }

    function addRoad(enter, hold, leave, curve, y) {
        const total = enter + hold + leave;
        for (let n = 0; n < enter; n++) addSegment(easeIn(n, enter, curve), easeInOut(n, total, y));
        for (let n = 0; n < hold; n++) addSegment(curve, easeInOut(enter + n, total, y));
        for (let n = 0; n < leave; n++) addSegment(easeOut(n, leave, curve), easeInOut(enter + hold + n, total, y));
    }

    function easeIn(a, b, c) { return c * (a / b); }
    function easeOut(a, b, c) { return c * (1 - a / b); }
    function easeInOut(a, b, c) { return c * ((-Math.cos(a / b * Math.PI) / 2) + 0.5); }

    function buildTrack() {
        segments = [];
        // Starting straight
        addRoad(10, 50, 10, 0, 0);
        // Gentle right curve
        addRoad(20, 40, 20, 2, 0);
        // Hill up
        addRoad(15, 30, 15, 0, 1500);
        // Sharp left + downhill
        addRoad(15, 40, 15, -4, -1500);
        // S-curves
        addRoad(15, 30, 15, 3, 500);
        addRoad(15, 30, 15, -3, -500);
        // Long straight
        addRoad(10, 60, 10, 0, 0);
        // Tight right
        addRoad(20, 30, 20, 5, 800);
        // Down straight
        addRoad(10, 40, 10, -1, -800);
        // Chicane
        addRoad(10, 20, 10, 6, 0);
        addRoad(10, 20, 10, -6, 0);
        // Gentle left
        addRoad(20, 40, 20, -2, 500);
        // Big hill
        addRoad(15, 40, 15, 1, 2000);
        // Descent
        addRoad(15, 40, 15, -1, -2000);
        // Final straight
        addRoad(10, 50, 10, 0, 0);

        totalLength = segments.length * SEG_LENGTH;

        // Add scenery
        addScenery();
    }

    function addScenery() {
        const types = theme === THEMES.desert
            ? ['cactus', 'rock', 'post']
            : ['tree', 'building', 'post', 'sign'];

        for (let i = 10; i < segments.length; i++) {
            if (Math.random() < 0.12) {
                const side = Math.random() > 0.5 ? 1 : -1;
                segments[i].sprites.push({
                    type: types[Math.floor(Math.random() * types.length)],
                    offset: side * (1.1 + Math.random() * 3),
                    seed: Math.random(),
                });
            }
        }
    }

    // ===== PLAYER / AI SETUP =====
    function resetPlayer() {
        const s = CAR_STATS[selCar];
        player = {
            x: 0, z: 0, speed: 0,
            maxSpd: s.maxSpd, accel: s.accel, decel: s.decel,
            offroad: s.offroad, handling: s.handling,
            color: s.color,
            boost: 100, boosting: false,
            lap: 1, lapZ: 0, finished: false,
        };
    }

    function resetAI() {
        aiCars = [];
        const d = DIFF[selDiff];
        const cols = ['#ff3366', '#33ccff', '#ffcc00', '#cc33ff', '#33ff99', '#ff6633', '#3366ff'];
        for (let i = 0; i < d.aiCount; i++) {
            const factor = d.aiMul * (0.88 + Math.random() * 0.24);
            aiCars.push({
                x: (Math.random() - 0.5) * 1.4,
                z: SEG_LENGTH * (5 + i * 8),
                speed: player.maxSpd * factor * 0.5,
                maxSpd: player.maxSpd * factor,
                color: cols[i % cols.length],
                targetX: 0, steerT: 0,
                lap: 1, finished: false,
                name: `AI-${String.fromCharCode(65 + i)}`,
            });
        }
    }

    // ===== START GAME =====
    function startGame() {
        theme = THEMES[selTrack];
        buildTrack();
        resetPlayer();
        resetAI();
        skyBuildings = [];
        for (let i = 0; i < 30; i++) skyBuildings.push({
            x: Math.random() * 2, w: 0.02 + Math.random() * 0.06,
            h: 0.05 + Math.random() * 0.25,
            c: theme.palette[Math.floor(Math.random() * theme.palette.length)],
        });
        raceTime = 0; lapTimes = []; bestLap = Infinity; topSpeed = 0;
        particles = [];
        showScreen('game-screen');
        state = 'countdown';
        runCountdown();
    }

    function runCountdown() {
        const el = document.getElementById('countdown');
        const txt = document.getElementById('countdown-text');
        el.classList.remove('hidden');
        let c = 3;
        txt.textContent = c; txt.style.color = '#fff';
        txt.style.animation = 'none'; void txt.offsetWidth; txt.style.animation = 'countPulse 0.8s ease-out';

        lastTS = performance.now();
        const renderLoop = () => { if (state === 'countdown') { render(); requestAnimationFrame(renderLoop); } };
        requestAnimationFrame(renderLoop);

        const iv = setInterval(() => {
            c--;
            if (c > 0) {
                txt.textContent = c;
                txt.style.animation = 'none'; void txt.offsetWidth; txt.style.animation = 'countPulse 0.8s ease-out';
            } else if (c === 0) {
                txt.textContent = 'GO!'; txt.style.color = '#00ff88';
                txt.style.animation = 'none'; void txt.offsetWidth; txt.style.animation = 'countPulse 0.8s ease-out';
            } else {
                clearInterval(iv);
                el.classList.add('hidden'); txt.style.color = '';
                state = 'racing';
                player.lapZ = performance.now();
                lastTS = performance.now();
                requestAnimationFrame(loop);
            }
        }, 1000);
    }

    // ===== GAME LOOP =====
    function loop(ts) {
        if (state !== 'racing' && state !== 'paused') return;
        if (state === 'paused') { requestAnimationFrame(loop); return; }
        const dt = Math.min((ts - lastTS) / 1000, 0.05);
        lastTS = ts;
        update(dt);
        render();
        if (state === 'racing') requestAnimationFrame(loop);
    }

    // ===== UPDATE =====
    function update(dt) {
        raceTime += dt;
        const up    = keys['ArrowUp']    || keys['KeyW'];
        const down  = keys['ArrowDown']  || keys['KeyS'];
        const left  = keys['ArrowLeft']  || keys['KeyA'];
        const right = keys['ArrowRight'] || keys['KeyD'];
        const boost = keys['Space'];

        // Speed
        let maxS = player.maxSpd;
        if (boost && player.boost > 0) {
            player.boosting = true;
            player.boost = Math.max(0, player.boost - 50 * dt);
            maxS *= 1.5;
        } else {
            player.boosting = false;
            player.boost = Math.min(100, player.boost + 8 * dt);
        }

        // Off-road
        const isOffroad = Math.abs(player.x) > 1.1;
        if (isOffroad) maxS = player.offroad;

        if (up) player.speed += player.accel * dt;
        else if (down) player.speed -= player.decel * dt;
        else player.speed -= player.decel * 0.3 * dt;

        player.speed = Math.max(0, Math.min(player.speed, maxS));

        // Steering
        const speedPct = player.speed / player.maxSpd;
        const dx = dt * player.handling * 3 * speedPct;
        if (left) player.x -= dx;
        if (right) player.x += dx;

        // Centrifugal force from curves
        const segIdx = findSegment(player.z);
        const seg = segments[segIdx % segments.length];
        player.x -= (seg.curve / 8000) * (player.speed / player.maxSpd) * player.speed * dt;

        player.x = Math.max(-2.5, Math.min(2.5, player.x));

        // Move
        player.z += player.speed * dt;

        // Lap tracking
        while (player.z >= totalLength) {
            player.z -= totalLength;
            const lt = (performance.now() - player.lapZ) / 1000;
            lapTimes.push(lt);
            if (lt < bestLap) bestLap = lt;
            player.lap++;
            player.lapZ = performance.now();
            showLapNotif(player.lap);
            if (player.lap > TOTAL_LAPS) { finishRace(); return; }
        }

        const displaySpd = Math.round(player.speed / 70);
        if (displaySpd > topSpeed) topSpeed = displaySpd;

        // Particles
        if (player.boosting) {
            for (let i = 0; i < 3; i++) particles.push(makeParticle(W/2, H*0.73, '#00d4ff', '#00ff88'));
        }
        if (isOffroad && player.speed > 1000) {
            particles.push(makeParticle(W/2, H*0.74, theme.grass1, theme.grass2));
        }
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy; p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // AI
        for (const ai of aiCars) {
            ai.steerT -= dt;
            if (ai.steerT <= 0) { ai.targetX = (Math.random() - 0.5) * 1.2; ai.steerT = 1 + Math.random() * 2; }
            ai.x += (ai.targetX - ai.x) * 1.5 * dt;
            const aiSeg = segments[findSegment(ai.z) % segments.length];
            let am = ai.maxSpd;
            if (Math.abs(aiSeg.curve) > 3) am *= 0.7;
            else if (Math.abs(aiSeg.curve) > 1) am *= 0.85;
            ai.speed += (am - ai.speed) * 2 * dt;
            ai.speed = Math.max(0, ai.speed);
            ai.z += ai.speed * dt;
            while (ai.z >= totalLength) { ai.z -= totalLength; ai.lap++; if (ai.lap > TOTAL_LAPS) ai.finished = true; }
        }

        updateHUD();
    }

    function findSegment(z) { return Math.floor(z / SEG_LENGTH) % segments.length; }

    function makeParticle(x, y, c1, c2) {
        return {
            x: x + (Math.random() - 0.5) * 40, y: y + Math.random() * 10,
            vx: (Math.random() - 0.5) * 4, vy: -1 - Math.random() * 3,
            life: 0.3 + Math.random() * 0.4, maxLife: 0.5,
            color: Math.random() > 0.5 ? c1 : c2, size: 2 + Math.random() * 4,
        };
    }

    function togglePause() {
        if (state === 'racing') {
            state = 'paused';
            document.getElementById('pause-overlay').classList.remove('hidden');
        } else if (state === 'paused') {
            state = 'racing';
            document.getElementById('pause-overlay').classList.add('hidden');
            lastTS = performance.now();
            requestAnimationFrame(loop);
        }
    }

    function showLapNotif(lap) {
        const el = document.getElementById('lap-notification');
        const t = document.getElementById('lap-text');
        t.textContent = lap > TOTAL_LAPS ? 'FINAL LAP!' : `LAP ${lap}/${TOTAL_LAPS}`;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 1500);
    }

    function getPosition() {
        let pos = 1;
        const pp = (player.lap - 1) * totalLength + player.z;
        for (const ai of aiCars) {
            if (ai.finished) { pos++; continue; }
            const ap = (ai.lap - 1) * totalLength + ai.z;
            if (ap > pp) pos++;
        }
        return pos;
    }

    function ordinal(n) { const s = ['th','st','nd','rd']; const v = n % 100; return n + (s[(v-20)%10]||s[v]||s[0]); }
    function fmtTime(t) { if (!isFinite(t)) return '--:--'; return `${Math.floor(t/60)}:${(t%60).toFixed(1).padStart(4,'0')}`; }

    function updateHUD() {
        document.getElementById('hud-lap').textContent = `${Math.min(player.lap,TOTAL_LAPS)}/${TOTAL_LAPS}`;
        document.getElementById('hud-position').textContent = ordinal(getPosition());
        document.getElementById('hud-time').textContent = fmtTime(raceTime);
        document.getElementById('hud-speed').textContent = Math.round(player.speed / 70);
        document.getElementById('hud-best').textContent = fmtTime(bestLap);
        document.getElementById('boost-fill').style.width = `${player.boost}%`;
    }

    function finishRace() {
        state = 'finished';
        const pos = getPosition();
        document.getElementById('result-position').textContent = ordinal(pos);
        document.getElementById('result-time').textContent = fmtTime(raceTime);
        document.getElementById('result-best').textContent = fmtTime(bestLap);
        document.getElementById('result-speed').textContent = `${topSpeed} km/h`;
        document.getElementById('results-title').textContent = pos === 1 ? '🏆 VICTORY!' : pos <= 3 ? 'PODIUM FINISH!' : 'RACE COMPLETE';
        setTimeout(() => showScreen('results-screen'), 1000);
    }

    // ===== RENDER =====
    function render() {
        ctx.clearRect(0, 0, W, H);
        const baseSegIdx = findSegment(player.z);
        const basePercent = (player.z % SEG_LENGTH) / SEG_LENGTH;
        const playerY = interpolate(segments[baseSegIdx % segments.length].p1.world.y, segments[baseSegIdx % segments.length].p2.world.y, basePercent);
        let maxy = H;
        let x = 0, dx = 0;

        // Sky
        drawSky();

        // Project and draw segments back-to-front
        // First pass: project all
        for (let n = 0; n < DRAW_DIST; n++) {
            const idx = (baseSegIdx + n) % segments.length;
            const seg = segments[idx];
            const looped = (baseSegIdx + n) >= segments.length;
            const camZ = player.z - (looped ? totalLength : 0);

            projectPoint(seg.p1, player.x * ROAD_W, playerY + CAM_HEIGHT, camZ);
            projectPoint(seg.p2, player.x * ROAD_W, playerY + CAM_HEIGHT, camZ);

            // Apply curve offset
            x += dx;
            dx += seg.curve;
            seg.p1.screen.X += x;
            seg.p2.screen.X += x + dx;
            seg.clip = 0;

            seg.cars = [];
        }

        // Add cars to segments
        for (const ai of aiCars) {
            const aiIdx = findSegment(ai.z);
            const drawIdx = (aiIdx - baseSegIdx + segments.length) % segments.length;
            if (drawIdx < DRAW_DIST && drawIdx > 0) {
                const segRef = segments[aiIdx % segments.length];
                segRef.cars.push(ai);
            }
        }

        // Store projected data for drawing
        const projected = [];
        for (let n = 0; n < DRAW_DIST; n++) {
            const idx = (baseSegIdx + n) % segments.length;
            const seg = segments[idx];
            projected.push({ seg, idx, n });
        }

        // Draw near to far (painter's algorithm: far first, near overwrites)
        // But we need to handle hills: track clipY from BOTTOM going UP
        let clipY = H; // bottom of visible area

        for (let n = DRAW_DIST - 1; n > 0; n--) {
            const { seg, idx } = projected[n];
            const p1 = seg.p1.screen;
            const p2 = seg.p2.screen;

            if (p1.scale <= 0 || p2.scale <= 0) continue;

            // For hill clipping: skip segments hidden behind hills closer to camera
            // We track the minimum Y seen so far going from far to near
            // Far segments are at the top (small Y). If a nearer segment's p2.Y
            // is above (smaller than) our current clip, that means a hill is blocking

            // Grass
            ctx.fillStyle = seg.color.grass;
            ctx.fillRect(0, p2.Y, W, p1.Y - p2.Y + 1);

            // Road
            const rw1 = p1.W * 1.2;
            const rw2 = p2.W * 1.2;

            // Rumble
            drawQuad(ctx, seg.color.rumble,
                p1.X - rw1, p1.Y, rw1 * 2,
                p2.X - rw2, p2.Y, rw2 * 2);

            // Road surface
            drawQuad(ctx, seg.color.road,
                p1.X - p1.W, p1.Y, p1.W * 2,
                p2.X - p2.W, p2.Y, p2.W * 2);

            // Lane markings
            if (Math.floor(idx / RUMBLE_LENGTH) % 2 === 0) {
                const lw1 = p1.W / 50;
                const lw2 = p2.W / 50;
                for (let l = 1; l < LANES; l++) {
                    const laneX1 = p1.X - p1.W + (p1.W * 2 * l / LANES);
                    const laneX2 = p2.X - p2.W + (p2.W * 2 * l / LANES);
                    drawQuad(ctx, theme.lane,
                        laneX1 - lw1, p1.Y, lw1 * 2,
                        laneX2 - lw2, p2.Y, lw2 * 2);
                }
            }

            // Start/finish line
            if (idx === 0 || idx === 1) {
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.fillRect(p2.X - p2.W, p2.Y - 1, p2.W * 2, 3);
            }

            // Scenery
            for (const sp of seg.sprites) {
                drawScenerySprite(sp, p2);
            }

            // AI cars on this segment
            for (const ai of seg.cars) {
                drawCarSprite(ai, p2);
            }
        }

        // Player car
        drawPlayerCar();

        // Particles on top
        drawParticles();

        // Speed lines
        if (player.speed > player.maxSpd * 0.7) {
            const alpha = ((player.speed / player.maxSpd) - 0.7) / 0.3 * 0.25;
            ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
            ctx.lineWidth = 1;
            for (let i = 0; i < 8; i++) {
                const lx = Math.random() * W;
                const ly = H * 0.2 + Math.random() * H * 0.5;
                ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + (Math.random()-0.5)*5, ly + 30 + Math.random()*40); ctx.stroke();
            }
        }
    }

    function interpolate(a, b, t) { return a + (b - a) * t; }

    function projectPoint(point, camX, camY, camZ) {
        const tx = point.world.x || 0;
        const ty = point.world.y || 0;
        const tz = point.world.z || 0;
        point.camera = {
            x: tx - camX,
            y: ty - camY,
            z: tz - camZ,
        };
        const scale = point.camera.z <= cameraDepth ? 0 : cameraDepth / point.camera.z;
        point.screen = {
            scale: scale,
            X: Math.round(W / 2 + scale * point.camera.x * W / 2),
            Y: Math.round(H / 2 - scale * point.camera.y * H / 2),
            W: Math.round(scale * ROAD_W * W / 2),
        };
    }

    function drawQuad(ctx, color, x1, y1, w1, x2, y2, w2) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + w1, y1);
        ctx.lineTo(x2 + w2, y2);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.fill();
    }

    function drawSky() {
        const grad = ctx.createLinearGradient(0, 0, 0, H * 0.5);
        grad.addColorStop(0, theme.skyTop);
        grad.addColorStop(1, theme.skyBot);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H * 0.5);

        if (theme.hasSky) {
            const t = performance.now() / 1000;
            // Stars
            for (const s of stars) {
                const sx = ((s.x - (player.x * 0.05)) % 1 + 1) % 1 * W;
                const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.5 + s.t * 60));
                ctx.fillStyle = `rgba(255,255,255,${alpha})`;
                ctx.fillRect(sx, s.y * H, s.s, s.s);
            }
            // Silhouette buildings
            for (const b of skyBuildings) {
                const bx = ((b.x - player.x * 0.03) % 2 + 2) % 2 * W - W * 0.5;
                const bh = b.h * H;
                ctx.fillStyle = b.c + '12';
                ctx.fillRect(bx, H * 0.5 - bh, b.w * W, bh);
                ctx.fillStyle = b.c + '25';
                for (let wy = H * 0.5 - bh + 8; wy < H * 0.5 - 4; wy += 14) {
                    for (let wx = bx + 4; wx < bx + b.w * W - 4; wx += 10) {
                        if (((wx * 7 + wy * 13) | 0) % 3 !== 0) ctx.fillRect(wx, wy, 4, 6);
                    }
                }
            }
        }
    }

    function drawScenerySprite(sp, p) {
        const sc = p.scale * 15000;
        if (sc < 3) return;
        const sx = p.X + sp.offset * p.W;
        const sy = p.Y;

        ctx.save();
        switch (sp.type) {
            case 'tree': {
                ctx.fillStyle = '#3a1a0a';
                ctx.fillRect(sx - sc*0.03, sy - sc*0.5, sc*0.06, sc*0.5);
                ctx.fillStyle = '#1a6b2a';
                ctx.beginPath(); ctx.arc(sx, sy - sc*0.6, sc*0.2, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#228b3a';
                ctx.beginPath(); ctx.arc(sx - sc*0.06, sy - sc*0.7, sc*0.15, 0, Math.PI*2); ctx.fill();
                break;
            }
            case 'building': {
                const bw = sc * 0.25, bh = sc * (0.4 + sp.seed * 0.6);
                const bc = theme.palette[Math.floor(sp.seed * theme.palette.length)];
                ctx.fillStyle = bc + '30';
                ctx.fillRect(sx - bw/2, sy - bh, bw, bh);
                ctx.fillStyle = bc + '60';
                for (let wy = sy - bh + 4; wy < sy - 4; wy += sc*0.06) {
                    for (let wx = sx - bw/2 + 3; wx < sx + bw/2 - 3; wx += sc*0.05) {
                        ctx.fillRect(wx, wy, sc*0.025, sc*0.03);
                    }
                }
                break;
            }
            case 'post': {
                ctx.fillStyle = '#888';
                ctx.fillRect(sx - 1.5, sy - sc*0.4, 3, sc*0.4);
                ctx.fillStyle = theme.palette[0];
                ctx.beginPath(); ctx.arc(sx, sy - sc*0.4, sc*0.03, 0, Math.PI*2); ctx.fill();
                break;
            }
            case 'sign': {
                ctx.fillStyle = '#666';
                ctx.fillRect(sx - 1.5, sy - sc*0.35, 3, sc*0.35);
                ctx.fillStyle = theme.palette[Math.floor(sp.seed * 5)];
                ctx.fillRect(sx - sc*0.07, sy - sc*0.35, sc*0.14, sc*0.08);
                break;
            }
            case 'cactus': {
                ctx.fillStyle = '#2d7a3a';
                ctx.fillRect(sx - sc*0.02, sy - sc*0.4, sc*0.04, sc*0.4);
                ctx.fillRect(sx - sc*0.1, sy - sc*0.35, sc*0.08, sc*0.03);
                ctx.fillRect(sx + sc*0.02, sy - sc*0.25, sc*0.08, sc*0.03);
                ctx.fillRect(sx - sc*0.1, sy - sc*0.42, sc*0.03, sc*0.07);
                ctx.fillRect(sx + sc*0.07, sy - sc*0.35, sc*0.03, sc*0.1);
                break;
            }
            case 'rock': {
                ctx.fillStyle = '#7a7a6a';
                ctx.beginPath();
                ctx.ellipse(sx, sy - sc*0.05, sc*0.1, sc*0.06, 0, 0, Math.PI*2);
                ctx.fill();
                break;
            }
        }
        ctx.restore();
    }

    function drawCarSprite(ai, p) {
        const sc = p.scale * 10000;
        if (sc < 4) return;
        const relX = ai.x - player.x;
        const cx = p.X + relX * p.W;
        const cy = p.Y;
        const cw = sc * 0.16;
        const ch = sc * 0.08;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 2, cw + 2, ch * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.fillStyle = ai.color;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cx - cw, cy - ch, cw * 2, ch, ch * 0.3);
        else { ctx.rect(cx - cw, cy - ch, cw * 2, ch); }
        ctx.fill();

        // Windshield
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(cx - cw * 0.5, cy - ch * 0.85, cw, ch * 0.45);

        // Taillights
        ctx.fillStyle = '#ff2222';
        ctx.fillRect(cx - cw, cy - ch * 0.4, cw * 0.12, ch * 0.2);
        ctx.fillRect(cx + cw * 0.88, cy - ch * 0.4, cw * 0.12, ch * 0.2);
    }

    function drawPlayerCar() {
        const cx = W / 2;
        const cy = H * 0.73;
        const cw = 50;
        const ch = 28;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 14, cw + 8, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Steering tilt
        const steerDir = (keys['ArrowLeft'] || keys['KeyA'] ? 1 : 0) - (keys['ArrowRight'] || keys['KeyD'] ? 1 : 0);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1 + steerDir * 0.025, 1);

        // Body gradient
        const grad = ctx.createLinearGradient(-cw, -ch, cw, ch);
        grad.addColorStop(0, player.color);
        grad.addColorStop(0.5, lighten(player.color, 35));
        grad.addColorStop(1, player.color);
        ctx.fillStyle = grad;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-cw, -ch, cw * 2, ch * 1.8, 10);
        else ctx.rect(-cw, -ch, cw * 2, ch * 1.8);
        ctx.fill();

        // Cockpit
        ctx.fillStyle = 'rgba(0,150,255,0.25)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-cw*0.5, -ch*0.8, cw, ch*0.65, 4);
        else ctx.rect(-cw*0.5, -ch*0.8, cw, ch*0.65);
        ctx.fill();

        // Spoiler
        ctx.fillStyle = darken(player.color, 50);
        ctx.fillRect(-cw * 0.85, -ch * 1.02, cw * 1.7, ch * 0.12);

        // Headlights
        ctx.shadowColor = player.boosting ? '#00ffff' : '#ffee88';
        ctx.shadowBlur = player.boosting ? 25 : 12;
        ctx.fillStyle = player.boosting ? '#00ffff' : '#ffee88';
        ctx.fillRect(-cw*0.75, -ch*0.98, cw*0.18, ch*0.1);
        ctx.fillRect(cw*0.57, -ch*0.98, cw*0.18, ch*0.1);
        ctx.shadowBlur = 0;

        // Taillights
        ctx.fillStyle = '#ff2233';
        ctx.shadowColor = '#ff2233';
        ctx.shadowBlur = 8;
        ctx.fillRect(-cw*0.8, ch*0.48, cw*0.18, ch*0.12);
        ctx.fillRect(cw*0.62, ch*0.48, cw*0.18, ch*0.12);
        ctx.shadowBlur = 0;

        // Boost flame
        if (player.boosting) {
            const fLen = 25 + Math.random() * 20;
            const fg = ctx.createLinearGradient(0, ch*0.6, 0, ch*0.6 + fLen);
            fg.addColorStop(0, '#00d4ff');
            fg.addColorStop(0.4, '#0088ff');
            fg.addColorStop(1, 'transparent');
            ctx.fillStyle = fg;
            ctx.beginPath();
            ctx.moveTo(-cw*0.25, ch*0.6);
            ctx.lineTo(cw*0.25, ch*0.6);
            ctx.lineTo((Math.random()-0.5)*12, ch*0.6 + fLen);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // Helpers
    function lighten(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        return `rgb(${Math.min(255,(n>>16)+amt)},${Math.min(255,((n>>8)&0xff)+amt)},${Math.min(255,(n&0xff)+amt)})`;
    }
    function darken(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        return `rgb(${Math.max(0,(n>>16)-amt)},${Math.max(0,((n>>8)&0xff)-amt)},${Math.max(0,(n&0xff)-amt)})`;
    }

    // ===== START =====
    window.addEventListener('load', init);
})();
