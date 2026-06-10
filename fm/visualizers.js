/* ═══════════════════════════════════════════════════════════════
   CUCEU FM — Visualizers
   Five audio-reactive scenes registered with CuceuViz (viz-core.js):

     STARLIGHT — galaxy night: twinkle starfield + spiral galaxy
     HALO      — glowing spectrum ring with reflection + shockwaves
     AURORA    — borealis light curtains, one per frequency band
     NEBULA    — simplex flow-field particle cloud with bass bursts
     PRISM     — wireframe spectrum tunnel

   Inspired by the Windows XP/Vista Media Player visualizations.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(() => {

    /* ── SHARED TEXTURES ────────────────────────────────────── */

    const texCache = new Map();

    function radialTexture(name, stops) {
        if (texCache.has(name)) return texCache.get(name);
        const size = 128;
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const g = cv.getContext('2d');
        const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        for (const [at, color] of stops) grad.addColorStop(at, color);
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(cv);
        tex.userData = { shared: true };
        texCache.set(name, tex);
        return tex;
    }

    const bokehTex = () => radialTexture('bokeh', [
        [0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.6)'],
        [0.7, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']
    ]);
    const glowTex = () => radialTexture('glow', [
        [0, 'rgba(255,210,160,1)'], [0.3, 'rgba(255,176,102,0.55)'],
        [0.7, 'rgba(208,115,41,0.12)'], [1, 'rgba(208,115,41,0)']
    ]);

    const C = (hex) => new THREE.Color(hex);
    const lerpC = (out, a, b, t) => out.copy(a).lerp(b, Math.max(0, Math.min(1, t)));

    /* ═══════════════════════════════════════════════════════
       STARLIGHT — galaxy night
       ═══════════════════════════════════════════════════════ */

    CuceuViz.register({
        id: 'starlight',
        label: 'Starlight',
        settings: [
            { key: 'density',  label: 'Galaxy Density', section: 'look',  min: 0,   max: 1.5, step: 0.1, default: 1, rebuild: true },
            { key: 'spin',     label: 'Spin',           section: 'look',  min: 0,   max: 2,   step: 0.05, default: 0.4 },
            { key: 'coreGlow', label: 'Core Glow',      section: 'look',  min: 0,   max: 2,   step: 0.1, default: 1 },
            { key: 'starSize', label: 'Star Size',      section: 'look',  min: 0.5, max: 4,   step: 0.1, default: 1 },
            { key: 'sense',    label: 'Sensitivity',    section: 'audio', min: 0,   max: 3,   step: 0.1, default: 1 },
            { key: 'twinkle',  label: 'Twinkle Speed',  section: 'audio', min: 0.1, max: 3,   step: 0.1, default: 1 }
        ],

        init(ctx) {
            const { scene, settings, quality } = ctx;
            ctx.camera = new THREE.PerspectiveCamera(60, ctx.width / ctx.height, 1, 4000);
            ctx.camera.position.z = 620;

            // Twinkle starfield (per-particle phase/speed shader)
            const starCount = Math.round(9000 * quality);
            const pos = new Float32Array(starCount * 3);
            const sizes = new Float32Array(starCount);
            const phases = new Float32Array(starCount);
            const speeds = new Float32Array(starCount);
            for (let i = 0; i < starCount; i++) {
                pos[i * 3] = (Math.random() - 0.5) * 2200;
                pos[i * 3 + 1] = (Math.random() - 0.5) * 1600;
                pos[i * 3 + 2] = (Math.random() - 0.5) * 1600 - 200;
                sizes[i] = 1.2 + Math.random() * 2.6;
                phases[i] = Math.random() * Math.PI * 2;
                speeds[i] = 0.5 + Math.random() * 2;
            }
            const starGeom = new THREE.BufferGeometry();
            starGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            starGeom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
            starGeom.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
            starGeom.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

            const starMat = new THREE.ShaderMaterial({
                uniforms: {
                    uTexture: { value: bokehTex() },
                    uTime: { value: 0 },
                    uTreble: { value: 0 },
                    uPixelRatio: { value: ctx.renderer.getPixelRatio() },
                    uSizeMult: { value: settings.starSize },
                    uSpeedMult: { value: settings.twinkle }
                },
                vertexShader: `
                    attribute float aSize;
                    attribute float aPhase;
                    attribute float aSpeed;
                    uniform float uTime;
                    uniform float uTreble;
                    uniform float uPixelRatio;
                    uniform float uSizeMult;
                    uniform float uSpeedMult;
                    varying float vAlpha;
                    void main() {
                        float flickerSpeed = aSpeed * (1.0 + uTreble * 4.0) * uSpeedMult;
                        float flicker = sin(uTime * flickerSpeed + aPhase) * 0.5 + 0.5;
                        float minA = max(0.15 - uTreble * 0.1, 0.05);
                        float maxA = 0.5 + uTreble * 0.5;
                        vAlpha = mix(minA, maxA, flicker);
                        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                        gl_PointSize = max(aSize * uSizeMult * uPixelRatio * (280.0 / -mvPos.z), 0.5);
                        gl_Position = projectionMatrix * mvPos;
                    }`,
                fragmentShader: `
                    uniform sampler2D uTexture;
                    varying float vAlpha;
                    void main() {
                        vec4 tex = texture2D(uTexture, gl_PointCoord);
                        gl_FragColor = vec4(vec3(0.78, 0.86, 1.0) * tex.r, tex.a * vAlpha);
                    }`,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            scene.add(new THREE.Points(starGeom, starMat));

            // Spiral galaxy disk: two logarithmic arms
            const diskCount = Math.round(6000 * settings.density * quality);
            const galaxy = new THREE.Group();
            if (diskCount > 0) {
                const dPos = new Float32Array(diskCount * 3);
                const dCol = new Float32Array(diskCount * 3);
                const core = C('#ffd9a8'), midC = C('#f0913c'), rim = C('#cfe4ff');
                const tmp = new THREE.Color();
                for (let i = 0; i < diskCount; i++) {
                    const arm = i % 2;
                    const t = Math.pow(Math.random(), 1.6);
                    const r = 30 + t * 430;
                    const spread = (1 - t * 0.6) * 0.5;
                    const theta = arm * Math.PI + t * 4.4 +
                        (Math.random() + Math.random() - 1) * spread;
                    dPos[i * 3] = Math.cos(theta) * r + (Math.random() - 0.5) * 14;
                    dPos[i * 3 + 1] = (Math.random() + Math.random() - 1) * 16 * (1 - t * 0.7);
                    dPos[i * 3 + 2] = Math.sin(theta) * r + (Math.random() - 0.5) * 14;
                    if (t < 0.35) lerpC(tmp, core, midC, t / 0.35);
                    else lerpC(tmp, midC, rim, (t - 0.35) / 0.65);
                    dCol[i * 3] = tmp.r; dCol[i * 3 + 1] = tmp.g; dCol[i * 3 + 2] = tmp.b;
                }
                const diskGeom = new THREE.BufferGeometry();
                diskGeom.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
                diskGeom.setAttribute('color', new THREE.BufferAttribute(dCol, 3));
                const diskMat = new THREE.PointsMaterial({
                    size: 5, map: bokehTex(), vertexColors: true,
                    transparent: true, opacity: 0.75,
                    blending: THREE.AdditiveBlending, depthWrite: false
                });
                galaxy.add(new THREE.Points(diskGeom, diskMat));
                ctx.state.diskMat = diskMat;
            }

            // Breathing amber core
            const coreSprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: glowTex(), transparent: true, opacity: 0.9,
                blending: THREE.AdditiveBlending, depthWrite: false
            }));
            coreSprite.scale.setScalar(150);
            galaxy.add(coreSprite);

            galaxy.rotation.x = 0.55;
            scene.add(galaxy);

            ctx.state.starMat = starMat;
            ctx.state.galaxy = galaxy;
            ctx.state.core = coreSprite;
            ctx.state.spinVel = 0;
            ctx.state.dolly = 0;
        },

        update(ctx, dt, elapsed, audio) {
            const s = ctx.settings, st = ctx.state;
            const sense = s.sense;

            st.starMat.uniforms.uTime.value = elapsed;
            st.starMat.uniforms.uTreble.value = Math.min(1, audio.treble * sense);
            st.starMat.uniforms.uSizeMult.value = s.starSize;
            st.starMat.uniforms.uSpeedMult.value = s.twinkle;

            if (audio.beat) st.spinVel += 0.05 * sense;
            st.spinVel *= 0.95;
            st.galaxy.rotation.y += dt * (s.spin * 0.12 + st.spinVel);

            if (st.diskMat) st.diskMat.opacity = 0.55 + Math.min(1, audio.mid * sense) * 0.45;
            st.core.scale.setScalar(150 * s.coreGlow * (0.85 + audio.bass * sense * 0.6));
            st.core.material.opacity = Math.min(1, 0.55 + audio.bass * sense * 0.5) * Math.min(1, s.coreGlow);

            const dollyTarget = audio.bass * sense * 45;
            st.dolly += (dollyTarget - st.dolly) * 0.08;
            ctx.camera.position.z = 620 - st.dolly;
        }
    });

    /* ═══════════════════════════════════════════════════════
       HALO — spectrum ring
       ═══════════════════════════════════════════════════════ */

    const HALO_PALETTES = {
        ember: ['#8f4a14', '#ffd9a8'],
        gold:  ['#d07329', '#ffd23f'],
        ghost: ['#3a4150', '#ffffff']
    };

    CuceuViz.register({
        id: 'halo',
        label: 'Halo',
        settings: [
            { key: 'bars',     label: 'Bars',        section: 'look',  min: 48,  max: 192, step: 16,   default: 96,  rebuild: true },
            { key: 'radius',   label: 'Radius',      section: 'look',  min: 100, max: 280, step: 10,   default: 170, rebuild: true },
            { key: 'rotation', label: 'Rotation',    section: 'look',  min: 0,   max: 2,   step: 0.05, default: 0.25 },
            { key: 'palette',  label: 'Color',       section: 'look',  type: 'select', default: 'ember',
              options: [{ value: 'ember', label: 'Ember' }, { value: 'gold', label: 'Gold' }, { value: 'ghost', label: 'Ghost' }] },
            { key: 'breathe',  label: 'Bass Breathe', section: 'audio', min: 0,  max: 2,   step: 0.1,  default: 1 },
            { key: 'glow',     label: 'Glow',         section: 'audio', min: 0,  max: 2,   step: 0.1,  default: 1 }
        ],

        init(ctx) {
            const { scene, settings } = ctx;
            ctx.camera = new THREE.PerspectiveCamera(60, ctx.width / ctx.height, 1, 3000);
            // Frame scales with ring size so big radii still fit in view
            const dist = settings.radius * 2.6 + 170;
            ctx.camera.position.set(0, settings.radius * 1.5, dist);
            ctx.camera.lookAt(0, 30, 0);

            const root = new THREE.Group();
            root.position.y = -50;
            scene.add(root);

            const n = settings.bars;
            const geom = new THREE.BoxGeometry(5, 1, 5);
            const bars = [], mirrors = [];
            for (let i = 0; i < n; i++) {
                const angle = (i / n) * Math.PI * 2;
                const mat = new THREE.MeshBasicMaterial({ color: 0xd07329 });
                const bar = new THREE.Mesh(geom, mat);
                bar.position.set(Math.cos(angle) * settings.radius, 0.5, Math.sin(angle) * settings.radius);
                root.add(bar);
                bars.push(bar);

                const mMat = new THREE.MeshBasicMaterial({ color: 0xd07329, transparent: true, opacity: 0.22 });
                const mirror = new THREE.Mesh(geom, mMat);
                mirror.position.copy(bar.position);
                root.add(mirror);
                mirrors.push(mirror);
            }

            const centerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
                map: glowTex(), transparent: true, opacity: 0.3,
                blending: THREE.AdditiveBlending, depthWrite: false
            }));
            centerGlow.scale.setScalar(settings.radius * 1.5);
            root.add(centerGlow);

            // Pooled beat shockwave rings on the floor plane
            const waves = [];
            for (let i = 0; i < 3; i++) {
                const ring = new THREE.Mesh(
                    new THREE.RingGeometry(0.92, 1, 64),
                    new THREE.MeshBasicMaterial({
                        color: 0xffb066, transparent: true, opacity: 0,
                        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
                    })
                );
                ring.rotation.x = -Math.PI / 2;
                ring.position.y = 0.5;
                ring.visible = false;
                root.add(ring);
                waves.push({ mesh: ring, life: -1 });
            }

            ctx.state = {
                root, bars, mirrors, waves, centerGlow,
                heights: new Float32Array(n),
                colA: new THREE.Color(), colB: new THREE.Color(), tmp: new THREE.Color()
            };
        },

        update(ctx, dt, elapsed, audio) {
            const s = ctx.settings, st = ctx.state;
            const n = st.bars.length;
            const spec = audio.spectrumLog(n);
            const [hexA, hexB] = HALO_PALETTES[s.palette] || HALO_PALETTES.ember;
            st.colA.set(hexA); st.colB.set(hexB);

            for (let i = 0; i < n; i++) {
                const v = spec[i];
                const target = 4 + v * 150;
                st.heights[i] += (target - st.heights[i]) * 0.35;
                const h = st.heights[i];
                const bar = st.bars[i], mirror = st.mirrors[i];
                bar.scale.y = h;
                bar.position.y = h / 2;
                mirror.scale.y = h;
                mirror.position.y = -h / 2;
                // Quadratic bias keeps mids amber; pale tips only on true peaks
                lerpC(st.tmp, st.colA, st.colB, v * v * (0.6 + s.glow * 0.55));
                bar.material.color.copy(st.tmp);
                mirror.material.color.copy(st.tmp);
            }

            st.root.rotation.y += dt * s.rotation * 0.7;
            st.root.scale.setScalar(1 + audio.bass * 0.18 * s.breathe);

            st.centerGlow.material.opacity = Math.min(1, (0.18 + audio.level * 0.55) * s.glow);
            st.centerGlow.scale.setScalar(s.radius * (1.2 + audio.level * 0.5));

            if (audio.beat) {
                const free = st.waves.find(w => w.life < 0);
                if (free) { free.life = 0; free.mesh.visible = true; }
            }
            for (const w of st.waves) {
                if (w.life < 0) continue;
                w.life += dt;
                const t = w.life / 0.7;
                if (t >= 1) { w.life = -1; w.mesh.visible = false; continue; }
                w.mesh.scale.setScalar(s.radius * (0.5 + t * 2.2));
                w.mesh.material.opacity = 0.65 * (1 - t) * s.glow;
            }
        }
    });

    /* ═══════════════════════════════════════════════════════
       AURORA — borealis light curtains
       ═══════════════════════════════════════════════════════ */

    const AURORA_PALETTES = {
        ember:    [['#d07329', '#ffd9a8'], ['#8f4a14', '#f0913c'], ['#b85c1a', '#ffb066'], ['#d07329', '#ffe2bd']],
        borealis: [['#d07329', '#ffb066'], ['#9a5a18', '#7fd4c0'], ['#c06820', '#ffd9a8'], ['#7a4512', '#9bc4e8']],
        ghost:    [['#5a6472', '#e8ecf2'], ['#434b58', '#c9d2dd'], ['#5a6472', '#ffffff'], ['#39404b', '#aab4c2']]
    };
    const AURORA_BANDS = ['bass', 'lowMid', 'mid', 'treble'];

    CuceuViz.register({
        id: 'aurora',
        label: 'Aurora',
        settings: [
            { key: 'ribbons', label: 'Ribbons', section: 'look',  min: 2,   max: 6, step: 1,   default: 4, rebuild: true },
            { key: 'drift',   label: 'Drift',   section: 'look',  min: 0,   max: 3, step: 0.1, default: 0.8 },
            { key: 'palette', label: 'Palette', section: 'look',  type: 'select', default: 'ember',
              options: [{ value: 'ember', label: 'Ember' }, { value: 'borealis', label: 'Borealis' }, { value: 'ghost', label: 'Ghost' }] },
            { key: 'height',  label: 'Wave Height', section: 'audio', min: 0.3, max: 3, step: 0.1, default: 1 },
            { key: 'shimmer', label: 'Shimmer',     section: 'audio', min: 0,   max: 2, step: 0.1, default: 1 }
        ],

        init(ctx) {
            const { scene, settings } = ctx;
            ctx.camera = new THREE.PerspectiveCamera(60, ctx.width / ctx.height, 1, 3000);
            ctx.camera.position.z = 520;

            const count = settings.ribbons;
            const ribbons = [];
            for (let i = 0; i < count; i++) {
                const geom = new THREE.PlaneGeometry(1500, 240, 160, 1);
                const mat = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: { value: 0 },
                        uScroll: { value: Math.random() * 20 },
                        uPhase: { value: i * 13.7 },
                        uAmp: { value: 40 },
                        uColorA: { value: new THREE.Color() },
                        uColorB: { value: new THREE.Color() },
                        uGlow: { value: 0.6 },
                        uShimmer: { value: 0 },
                        uHue: { value: 0 }
                    },
                    vertexShader: `
                        uniform float uTime;
                        uniform float uScroll;
                        uniform float uPhase;
                        uniform float uAmp;
                        varying vec2 vUv;
                        varying float vWave;
                        void main() {
                            vUv = uv;
                            vec3 p = position;
                            float x = p.x * 0.004 + uScroll + uPhase;
                            float w = sin(x * 1.7) * 0.55
                                    + sin(x * 3.1 + uTime * 0.35) * 0.3
                                    + sin(x * 5.3 - uTime * 0.21) * 0.15;
                            vWave = w;
                            p.y += w * uAmp;
                            p.z += sin(x * 2.3 + uTime * 0.25) * 22.0;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
                        }`,
                    fragmentShader: `
                        uniform vec3 uColorA;
                        uniform vec3 uColorB;
                        uniform float uGlow;
                        uniform float uShimmer;
                        uniform float uTime;
                        uniform float uHue;
                        varying vec2 vUv;
                        varying float vWave;
                        void main() {
                            float d = abs(vUv.y - 0.5) * 2.0;
                            float glowBand = exp(-d * d * 7.0) * 0.30;     // soft halo
                            float core    = exp(-d * d * 60.0) * 0.55;    // crisp curtain core
                            float edge = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x);
                            // Fold lighting: curtain brightens where the wave crests
                            float fold = 0.55 + 0.45 * vWave;
                            float shimmer = 1.0 + uShimmer * 0.25 * sin(vUv.x * 42.0 + uTime * 6.0);
                            vec3 col = mix(uColorA, uColorB, vUv.x) + uHue * vec3(0.3, 0.15, 0.0);
                            gl_FragColor = vec4(col * uGlow * shimmer * (0.7 + fold * 0.6),
                                                (glowBand + core) * edge * fold);
                        }`,
                    transparent: true,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
                const mesh = new THREE.Mesh(geom, mat);
                const spread = count > 1 ? (i / (count - 1) - 0.5) : 0;
                mesh.position.y = spread * 260;
                mesh.position.z = -i * 40;
                mesh.rotation.z = spread * 0.22;
                scene.add(mesh);
                ribbons.push({ mat, amp: 40, band: AURORA_BANDS[i % AURORA_BANDS.length] });
            }
            ctx.state.ribbons = ribbons;
        },

        update(ctx, dt, elapsed, audio) {
            const s = ctx.settings, st = ctx.state;
            const palette = AURORA_PALETTES[s.palette] || AURORA_PALETTES.ember;
            st.ribbons.forEach((r, i) => {
                const u = r.mat.uniforms;
                u.uTime.value = elapsed;
                u.uScroll.value += dt * s.drift * 0.18;
                const target = 18 + audio[r.band] * 130 * s.height;
                r.amp += (target - r.amp) * 0.12;
                u.uAmp.value = r.amp;
                u.uGlow.value = 0.32 + audio.level * 0.55;
                u.uShimmer.value = audio.treble * s.shimmer;
                u.uHue.value = audio.beatEnv * 0.6;
                const [a, b] = palette[i % palette.length];
                u.uColorA.value.set(a);
                u.uColorB.value.set(b);
            });
        }
    });

    /* ═══════════════════════════════════════════════════════
       NEBULA — flow-field particle cloud
       ═══════════════════════════════════════════════════════ */

    const NEBULA_PALETTES = {
        ember: ['#8f4a14', '#ffd9a8'],
        solar: ['#d07329', '#ffd23f'],
        mono:  ['#555555', '#ffffff']
    };

    function makeNoise3() {
        const SN = window.SimplexNoise;
        if (typeof window.createNoise3D === 'function') return window.createNoise3D();
        if (SN) {
            if (typeof SN.createNoise3D === 'function') return SN.createNoise3D();
            if (typeof SN === 'function') {
                const inst = new SN();
                if (inst.noise3D) return (x, y, z) => inst.noise3D(x, y, z);
                if (inst.noise3d) return (x, y, z) => inst.noise3d(x, y, z);
            }
        }
        // Cheap fallback if the simplex-noise CDN fails to load
        return (x, y, z) => (Math.sin(x * 2.1 + z * 1.3) + Math.sin(y * 1.7 + x * 0.9 + z * 0.6)) * 0.5;
    }

    CuceuViz.register({
        id: 'nebula',
        label: 'Nebula',
        settings: [
            { key: 'particles', label: 'Particles', section: 'look', min: 2000, max: 12000, step: 1000, default: 6000, rebuild: true },
            { key: 'trail',     label: 'Trail',     section: 'look', min: 1,    max: 6,     step: 1,    default: 3,    rebuild: true },
            { key: 'palette',   label: 'Palette',   section: 'look', type: 'select', default: 'ember',
              options: [{ value: 'ember', label: 'Ember' }, { value: 'solar', label: 'Solar' }, { value: 'mono', label: 'Mono' }] },
            { key: 'speed',     label: 'Flow Speed', section: 'audio', min: 0.1, max: 3, step: 0.1, default: 1 },
            { key: 'turb',      label: 'Turbulence', section: 'audio', min: 0.1, max: 3, step: 0.1, default: 1 },
            { key: 'burst',     label: 'Bass Burst', section: 'audio', min: 0,   max: 3, step: 0.1, default: 1 }
        ],

        init(ctx) {
            const { scene, settings, quality } = ctx;
            ctx.camera = new THREE.PerspectiveCamera(65, ctx.width / ctx.height, 1, 3000);
            ctx.camera.position.z = 480;

            const count = Math.round(settings.particles * quality);
            const group = new THREE.Group();
            scene.add(group);

            const positions = new Float32Array(count * 3);
            const velocities = new Float32Array(count * 3);
            const colors = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                positions[i * 3] = (Math.random() - 0.5) * 500;
                positions[i * 3 + 1] = (Math.random() - 0.5) * 500;
                positions[i * 3 + 2] = (Math.random() - 0.5) * 500;
            }

            // Trail layers: layer 0 is the live head, deeper layers are
            // older position snapshots at decreasing opacity.
            const layerCount = settings.trail;
            const layers = [];
            for (let t = 0; t < layerCount; t++) {
                const geom = new THREE.BufferGeometry();
                const arr = t === 0 ? positions : new Float32Array(positions);
                geom.setAttribute('position', new THREE.BufferAttribute(arr, 3));
                geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                const mat = new THREE.PointsMaterial({
                    size: t === 0 ? 5 : 4,
                    map: bokehTex(),
                    vertexColors: true,
                    transparent: true,
                    opacity: Math.max(0.06, 0.7 - (t / layerCount) * 0.65),
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                const pts = new THREE.Points(geom, mat);
                group.add(pts);
                layers.push(pts);
            }

            ctx.state = {
                group, layers, positions, velocities, colors, count,
                noise: makeNoise3(), burstEnv: 0,
                colA: new THREE.Color(), colB: new THREE.Color(),
                tmp: new THREE.Color(), white: new THREE.Color(1, 1, 1)
            };
        },

        update(ctx, dt, elapsed, audio) {
            const s = ctx.settings, st = ctx.state;
            const { positions, velocities, colors, count, noise } = st;

            // Snapshot trails (deepest first so each inherits the previous frame)
            for (let t = st.layers.length - 1; t >= 1; t--) {
                const dst = st.layers[t].geometry.attributes.position;
                const src = st.layers[t - 1].geometry.attributes.position;
                dst.array.set(src.array);
                dst.needsUpdate = true;
            }

            // Bass burst envelope: fast attack, ~250ms release
            if (audio.bass > 0.6) st.burstEnv = Math.min(1, st.burstEnv + dt / 0.12) * audio.bass;
            else st.burstEnv *= Math.exp(-dt / 0.25);

            const f = 0.004;
            const tt = elapsed * 0.45;
            const turb = s.turb * (1 + audio.mid * 2) * 60;
            const maxSpeed = s.speed * 170 * (1 + audio.treble);
            const [hexA, hexB] = NEBULA_PALETTES[s.palette] || NEBULA_PALETTES.ember;
            st.colA.set(hexA); st.colB.set(hexB);

            for (let i = 0; i < count; i++) {
                const ix = i * 3;
                let x = positions[ix], y = positions[ix + 1], z = positions[ix + 2];
                let vx = velocities[ix], vy = velocities[ix + 1], vz = velocities[ix + 2];

                vx += noise(x * f, y * f, tt) * turb * dt;
                vy += noise(y * f + 100, z * f, tt) * turb * dt;
                vz += noise(z * f + 200, x * f, tt) * turb * dt;

                if (st.burstEnv > 0.01) {
                    const d = Math.sqrt(x * x + y * y + z * z) || 1;
                    const push = st.burstEnv * s.burst * 260 * dt / d;
                    vx += x * push; vy += y * push; vz += z * push;
                }

                const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
                if (sp > maxSpeed) {
                    const k = maxSpeed / sp;
                    vx *= k; vy *= k; vz *= k;
                }
                vx *= 0.985; vy *= 0.985; vz *= 0.985;

                x += vx * dt; y += vy * dt; z += vz * dt;

                // Respawn escapees on an inner shell, not the centre
                if (x * x + y * y + z * z > 520 * 520) {
                    const r = 80 + Math.random() * 80;
                    const a = Math.random() * Math.PI * 2;
                    const b = Math.acos(Math.random() * 2 - 1);
                    x = r * Math.sin(b) * Math.cos(a);
                    y = r * Math.sin(b) * Math.sin(a);
                    z = r * Math.cos(b);
                    vx = vy = vz = 0;
                }

                positions[ix] = x; positions[ix + 1] = y; positions[ix + 2] = z;
                velocities[ix] = vx; velocities[ix + 1] = vy; velocities[ix + 2] = vz;

                const speedNorm = Math.min(1, sp / (maxSpeed || 1));
                lerpC(st.tmp, st.colA, st.colB, speedNorm);
                if (speedNorm > 0.88) st.tmp.lerp(st.white, audio.treble * 0.7);
                colors[ix] = st.tmp.r; colors[ix + 1] = st.tmp.g; colors[ix + 2] = st.tmp.b;
            }

            const head = st.layers[0].geometry.attributes;
            head.position.needsUpdate = true;
            for (const layer of st.layers) layer.geometry.attributes.color.needsUpdate = true;

            st.group.rotation.y = elapsed * 0.045;
            st.group.rotation.z = elapsed * 0.018;
        }
    });

    /* ═══════════════════════════════════════════════════════
       PRISM — spectrum tunnel
       ═══════════════════════════════════════════════════════ */

    const PRISM_PALETTES = {
        ember: ['#b35f1d', '#ffb066'],
        heat:  ['#cc3300', '#ffd23f'],
        ghost: ['#5c7185', '#ffffff']
    };

    CuceuViz.register({
        id: 'prism',
        label: 'Prism',
        settings: [
            { key: 'depth',   label: 'Depth',   section: 'look',  min: 32,  max: 96, step: 8,    default: 64, rebuild: true },
            { key: 'twist',   label: 'Twist',   section: 'look',  min: 0,   max: 2,  step: 0.05, default: 0.6 },
            { key: 'palette', label: 'Palette', section: 'look',  type: 'select', default: 'ember',
              options: [{ value: 'ember', label: 'Ember' }, { value: 'heat', label: 'Heat' }, { value: 'ghost', label: 'Ghost' }] },
            { key: 'speed',   label: 'Fly Speed', section: 'audio', min: 0.2, max: 3, step: 0.1, default: 1 },
            { key: 'glow',    label: 'Glow',      section: 'audio', min: 0,   max: 2, step: 0.1, default: 1 }
        ],

        init(ctx) {
            const { scene, settings, quality } = ctx;
            ctx.camera = new THREE.PerspectiveCamera(65, ctx.width / ctx.height, 1, 5000);
            ctx.camera.position.z = 90;
            ctx.camera.lookAt(0, 0, -400);

            const R = settings.depth;
            const S = quality < 1 ? 64 : 96;
            const SPACING = 38;

            // Rings + longitudinal spokes (every 6th vertex) for tunnel depth
            const LONG_STEP = 6;
            const LSEG = Math.ceil(S / LONG_STEP);
            const verts = (R * S + (R - 1) * LSEG) * 2;
            const positions = new Float32Array(verts * 3);
            const colors = new Float32Array(verts * 3);
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const mat = new THREE.LineBasicMaterial({
                vertexColors: true, transparent: true, opacity: 0.85,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            scene.add(new THREE.LineSegments(geom, mat));

            ctx.state = {
                R, S, SPACING, LONG_STEP,
                positions, colors, geom,
                radii: new Float32Array(R * S).fill(130),
                energy: new Float32Array(R * S),
                head: 0, zOff: 0,
                colA: new THREE.Color(), colB: new THREE.Color(),
                tmp: new THREE.Color(), white: new THREE.Color(1, 1, 1),
                baseFov: 65
            };
        },

        update(ctx, dt, elapsed, audio) {
            const s = ctx.settings, st = ctx.state;
            const { R, S, SPACING, positions, colors, radii, energy } = st;

            // Conveyor: advance the tunnel, stamping the live spectrum
            // into the mouth ring each time a ring's width is travelled.
            st.zOff += dt * 130 * s.speed * (1 + audio.bass);
            while (st.zOff >= SPACING) {
                st.zOff -= SPACING;
                st.head = (st.head - 1 + R) % R;
                const spec = audio.spectrumLog(S);
                const row = st.head * S;
                for (let i = 0; i < S; i++) {
                    radii[row + i] = 130 + spec[i] * 95;
                    energy[row + i] = spec[i];
                }
            }

            const [hexA, hexB] = PRISM_PALETTES[s.palette] || PRISM_PALETTES.ember;
            st.colA.set(hexA); st.colB.set(hexB);

            let p = 0, c = 0;
            for (let j = 0; j < R; j++) {
                const row = ((st.head + j) % R) * S;
                const z = -j * SPACING + st.zOff - 40;
                const twist = s.twist * j * 0.06 + elapsed * 0.15;
                const fade = Math.pow(1 - j / R, 1.5);
                for (let i = 0; i < S; i++) {
                    const i2 = (i + 1) % S;
                    const a1 = (i / S) * Math.PI * 2 + twist;
                    const a2 = (i2 / S) * Math.PI * 2 + twist;
                    const r1 = radii[row + i];
                    const r2 = radii[row + i2];
                    positions[p++] = Math.cos(a1) * r1; positions[p++] = Math.sin(a1) * r1; positions[p++] = z;
                    positions[p++] = Math.cos(a2) * r2; positions[p++] = Math.sin(a2) * r2; positions[p++] = z;

                    // Floor of 0.2 keeps quiet sections faintly glowing
                    lerpC(st.tmp, st.colA, st.colB, 0.2 + energy[row + i] * (0.5 + s.glow * 0.6));
                    if (j < 2) st.tmp.lerp(st.white, audio.beatEnv * 0.8);
                    st.tmp.multiplyScalar(fade * (0.85 + s.glow * 0.5));
                    colors[c++] = st.tmp.r; colors[c++] = st.tmp.g; colors[c++] = st.tmp.b;
                    colors[c++] = st.tmp.r; colors[c++] = st.tmp.g; colors[c++] = st.tmp.b;
                }
            }

            // Longitudinal spokes between consecutive rings
            for (let j = 0; j < R - 1; j++) {
                const rowA = ((st.head + j) % R) * S;
                const rowB = ((st.head + j + 1) % R) * S;
                const zA = -j * SPACING + st.zOff - 40;
                const zB = zA - SPACING;
                const twistA = s.twist * j * 0.06 + elapsed * 0.15;
                const twistB = s.twist * (j + 1) * 0.06 + elapsed * 0.15;
                const fade = Math.pow(1 - j / R, 1.5);
                for (let i = 0; i < S; i += st.LONG_STEP) {
                    const aA = (i / S) * Math.PI * 2 + twistA;
                    const aB = (i / S) * Math.PI * 2 + twistB;
                    const rA = radii[rowA + i];
                    const rB = radii[rowB + i];
                    positions[p++] = Math.cos(aA) * rA; positions[p++] = Math.sin(aA) * rA; positions[p++] = zA;
                    positions[p++] = Math.cos(aB) * rB; positions[p++] = Math.sin(aB) * rB; positions[p++] = zB;

                    lerpC(st.tmp, st.colA, st.colB, 0.2 + energy[rowA + i] * (0.5 + s.glow * 0.6));
                    st.tmp.multiplyScalar(fade * 0.8);
                    colors[c++] = st.tmp.r; colors[c++] = st.tmp.g; colors[c++] = st.tmp.b;
                    colors[c++] = st.tmp.r; colors[c++] = st.tmp.g; colors[c++] = st.tmp.b;
                }
            }
            st.geom.attributes.position.needsUpdate = true;
            st.geom.attributes.color.needsUpdate = true;

            // Beat FOV kick
            const fov = st.baseFov + audio.beatEnv * 7;
            if (Math.abs(ctx.camera.fov - fov) > 0.05) {
                ctx.camera.fov = fov;
                ctx.camera.updateProjectionMatrix();
            }
        }
    });

})();
