/* ═══════════════════════════════════════════════════════════════
   CUCEU FM — Visualizers
   Audio-reactive scenes registered with CuceuViz (viz-core.js):

     AURORA — borealis light curtains, one per frequency band
     ORBIT  — particle rings circling a glowing core

   Inspired by the Windows XP/Vista Media Player visualizations.
   Both support light + dark themes (uDark uniform + blending swap).
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(() => {

    const AURORA_PALETTES = {
        ember:    [['#d07329', '#ffd9a8'], ['#8f4a14', '#f0913c'], ['#b85c1a', '#ffb066'], ['#d07329', '#ffe2bd'], ['#a05520', '#ffcc88'], ['#c46828', '#ffddb0']],
        borealis: [['#d07329', '#ffb066'], ['#9a5a18', '#7fd4c0'], ['#c06820', '#ffd9a8'], ['#7a4512', '#9bc4e8'], ['#b06020', '#88d0b0'], ['#8a5015', '#a8c8e0']],
        ghost:    [['#5a6472', '#e8ecf2'], ['#434b58', '#c9d2dd'], ['#5a6472', '#ffffff'], ['#39404b', '#aab4c2'], ['#4e5868', '#dde2ea'], ['#3f4750', '#b8c2ce']]
    };
    const AURORA_BANDS = ['bass', 'lowMid', 'mid', 'treble', 'air', 'bass'];

    // Band-specific characteristics for per-ribbon differentiation
    const BAND_TRAITS = {
        bass:   { freqMult: 0.7, scrollMul: 0.6,  hueShift: 0.0  },
        lowMid: { freqMult: 0.9, scrollMul: 0.85, hueShift: 0.08 },
        mid:    { freqMult: 1.2, scrollMul: 1.0,  hueShift: 0.15 },
        treble: { freqMult: 1.6, scrollMul: 1.3,  hueShift: 0.25 },
        air:    { freqMult: 2.0, scrollMul: 1.5,  hueShift: 0.35 }
    };

    // ── VERTEX SHADER ────────────────────────────────────────────
    const VERT = `
        uniform float uTime;
        uniform float uScroll;
        uniform float uPhase;
        uniform float uAmp;
        uniform float uFreqMult;
        uniform float uPulse;
        varying vec2 vUv;
        varying float vWave;
        void main() {
            vUv = uv;
            vec3 p = position;
            float fm = uFreqMult;
            float x = p.x * 0.004 + uScroll + uPhase;

            // Multi-octave wave — frequency multiplier differentiates bands
            float w = sin(x * 1.7 * fm) * 0.50
                    + sin(x * 3.1 * fm + uTime * 0.40) * 0.30
                    + sin(x * 5.3 * fm - uTime * 0.25) * 0.15
                    + sin(x * 8.1 * fm + uTime * 0.55) * 0.05;
            vWave = w;
            p.y += w * uAmp;

            // Z-depth sway
            p.z += sin(x * 2.3 + uTime * 0.25) * 22.0;

            // Pulse: beat kicks the ribbon toward the camera
            p.z += uPulse * 45.0;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`;

    // ── FRAGMENT SHADER ──────────────────────────────────────────
    const FRAG = `
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uGlow;
        uniform float uPulse;
        uniform float uTime;
        uniform float uHue;
        uniform float uBandEnergy;
        uniform float uFade;
        uniform float uDark;
        varying vec2 vUv;
        varying float vWave;
        void main() {
            float d = abs(vUv.y - 0.5) * 2.0;

            // Core + halo — pulse dramatically widens the core
            float pulseWiden = 1.0 + uPulse * 2.5;
            float glowBand = exp(-d * d * (7.0 / pulseWiden)) * 0.30;
            float core     = exp(-d * d * (60.0 / pulseWiden)) * 0.55;

            float edge = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x);

            // Fold lighting: curtain brightens where the wave crests
            float fold = 0.55 + 0.45 * vWave;

            // Per-band colour modulation
            vec3 bandTint = vec3(1.0) + uBandEnergy * vec3(uHue * 0.4, uHue * 0.1, -uHue * 0.15);

            // Pulse: big brightness slam + hot-white colour flash
            float pulseBright = 1.0 + uPulse * 3.5;
            vec3 pulseFlash = vec3(uPulse * 0.6);

            vec3 col = mix(uColorA, uColorB, vUv.x) * bandTint + uHue * vec3(0.3, 0.15, 0.0) + pulseFlash;
            float alpha = (glowBand + core) * edge * fold * uFade;

            // Dark theme: additive glow. Light theme: ink curtains —
            // deeper colours, normal blending, slightly denser alpha.
            vec3 darkOut  = col * uGlow * pulseBright * (0.7 + fold * 0.6);
            vec3 lightOut = col * (0.42 + 0.22 * fold) * (1.0 + uPulse * 0.5);
            gl_FragColor = vec4(mix(lightOut, darkOut, uDark),
                                min(1.0, mix(alpha * 1.5, alpha, uDark)));
        }`;

    // ── RIBBON FACTORY ───────────────────────────────────────────
    function createRibbon(scene, index, dark) {
        const band = AURORA_BANDS[index % AURORA_BANDS.length];
        const traits = BAND_TRAITS[band];
        const geom = new THREE.PlaneGeometry(1500, 240, 160, 1);
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime:       { value: 0 },
                uScroll:     { value: Math.random() * 20 },
                uPhase:      { value: index * 13.7 },
                uAmp:        { value: 40 },
                uFreqMult:   { value: traits.freqMult },
                uBandEnergy: { value: 0 },
                uColorA:     { value: new THREE.Color() },
                uColorB:     { value: new THREE.Color() },
                uGlow:       { value: 0.6 },
                uPulse:      { value: 0 },
                uHue:        { value: traits.hueShift },
                uFade:       { value: 0 },   // start invisible, fade in
                uDark:       { value: dark ? 1 : 0 }
            },
            vertexShader: VERT,
            fragmentShader: FRAG,
            transparent: true,
            blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geom, mat);
        scene.add(mesh);

        return {
            mesh, mat, geom, band, traits,
            amp: 40,
            prevEnergy: 0,      // smoothed band energy
            prevRaw: 0,         // last raw energy (transient detection)
            kick: 0,            // per-ribbon transient envelope
            fade: 0,
            fadeTarget: 1,
            removing: false,
            targetY: 0, targetZ: 0, targetRot: 0
        };
    }

    // Slot layout: even vertical spread, alternating tilt so the
    // curtains stay balanced left/right instead of fanning one way.
    // `shift` rotates ribbons through the slots over time.
    function retargetPositions(ribbons, shift) {
        const act = ribbons.filter(r => !r.removing);
        const count = act.length;
        act.forEach((r, vi) => {
            const slot = count > 0 ? (vi + shift) % count : 0;
            const spread = count > 1 ? (slot / (count - 1) - 0.5) : 0;
            r.targetY = spread * 260;
            r.targetZ = -slot * 40;
            r.targetRot = spread * 0.05 * (slot % 2 === 0 ? 1 : -1);
        });
    }

    CuceuViz.register({
        id: 'aurora',
        label: 'Aurora',
        settings: [
            { key: 'ribbons', label: 'Ribbons',     section: 'look',  min: 2,   max: 6, step: 1,   default: 4 },
            { key: 'drift',   label: 'Drift',       section: 'look',  min: 0,   max: 3, step: 0.1, default: 0.8 },
            { key: 'palette', label: 'Palette',     section: 'look',  type: 'select', default: 'ember',
              options: [{ value: 'ember', label: 'Ember' }, { value: 'borealis', label: 'Borealis' }, { value: 'ghost', label: 'Ghost' }] },
            { key: 'height',  label: 'Wave Height', section: 'audio', min: 0.3, max: 3, step: 0.1, default: 1 },
            { key: 'react',   label: 'Reactivity',  section: 'audio', min: 0.2, max: 3, step: 0.1, default: 1.2 },
            { key: 'pulse',   label: 'Pulse',       section: 'audio', min: 0,   max: 2, step: 0.1, default: 1 }
        ],

        init(ctx) {
            const { scene, settings } = ctx;
            ctx.camera = new THREE.PerspectiveCamera(60, ctx.width / ctx.height, 1, 3000);
            ctx.camera.position.z = 520;

            const count = settings.ribbons;
            const ribbons = [];
            for (let i = 0; i < count; i++) {
                const r = createRibbon(scene, i, ctx.dark);
                r.fade = 1;
                r.fadeTarget = 1;
                r.mat.uniforms.uFade.value = 1;
                ribbons.push(r);
            }
            ctx.state.ribbons = ribbons;
            ctx.state.pulseEnv = 0;
            ctx.state.slotShift = 0;
            ctx.state.swapTimer = 0;
            ctx.state.tmpA = new THREE.Color();
            ctx.state.tmpB = new THREE.Color();
            retargetPositions(ribbons, 0);
            // First frame: snap straight to the slots (no glide-in from origin)
            for (const r of ribbons) {
                r.mesh.position.y = r.targetY;
                r.mesh.position.z = r.targetZ;
                r.mesh.rotation.z = r.targetRot;
            }
        },

        setTheme(ctx, dark) {
            for (const r of ctx.state.ribbons) {
                r.mat.uniforms.uDark.value = dark ? 1 : 0;
                r.mat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
            }
            ctx.state.dark = dark;
        },

        update(ctx, dt, elapsed, audio) {
            const s = ctx.settings, st = ctx.state;
            const palette = AURORA_PALETTES[s.palette] || AURORA_PALETTES.ember;

            // ── SMOOTH RIBBON COUNT CHANGES (fade in/out, no rebuild) ──
            const desiredCount = s.ribbons;
            const activeRibbons = st.ribbons.filter(r => !r.removing);
            if (desiredCount !== activeRibbons.length) {
                if (desiredCount > activeRibbons.length) {
                    for (let i = activeRibbons.length; i < desiredCount; i++) {
                        st.ribbons.push(createRibbon(ctx.scene, i, ctx.dark));
                    }
                } else {
                    let toRemove = activeRibbons.length - desiredCount;
                    for (let i = activeRibbons.length - 1; i >= 0 && toRemove > 0; i--) {
                        activeRibbons[i].fadeTarget = 0;
                        activeRibbons[i].removing = true;
                        toRemove--;
                    }
                }
                retargetPositions(st.ribbons, st.slotShift);
            }

            // ── SLOT SWAP: ribbons trade places every ~16s ───────
            st.swapTimer += dt;
            if (st.swapTimer >= 16) {
                st.swapTimer = 0;
                const n = Math.max(1, st.ribbons.filter(r => !r.removing).length);
                st.slotShift = (st.slotShift + 1) % n;
                retargetPositions(st.ribbons, st.slotShift);
            }

            // ── PULSE ENVELOPE (beat-synced) ─────────────────────
            if (audio.beat) st.pulseEnv = 1.0;
            st.pulseEnv *= Math.pow(0.001, dt);

            // Reactivity master: drives attack speed, energy gain, glow
            const react = s.react;
            const attack = Math.min(0.85, 0.15 + react * 0.22);
            const release = 0.04 + react * 0.012;

            // ── PER-RIBBON UPDATE ────────────────────────────────
            const toDispose = [];
            for (let i = 0; i < st.ribbons.length; i++) {
                const r = st.ribbons[i];
                const u = r.mat.uniforms;

                // Fade transitions
                r.fade += (r.fadeTarget - r.fade) * Math.min(1, 2.5 * dt);
                if (Math.abs(r.fade - r.fadeTarget) < 0.005) r.fade = r.fadeTarget;
                u.uFade.value = r.fade;
                if (r.removing && r.fade <= 0.005) { toDispose.push(i); continue; }

                // Graceful glide toward the (possibly swapped) slot
                const posLerp = Math.min(1, 1.4 * dt);
                r.mesh.position.y += (r.targetY - r.mesh.position.y) * posLerp;
                r.mesh.position.z += (r.targetZ - r.mesh.position.z) * posLerp;
                r.mesh.rotation.z += (r.targetRot - r.mesh.rotation.z) * posLerp;

                // Time + per-band scroll speed (bass crawls, air races)
                u.uTime.value = elapsed;
                u.uScroll.value += dt * s.drift * 0.18 * r.traits.scrollMul;

                // Band energy with reactivity-scaled attack/release
                const bandEnergy = audio[r.band] || 0;
                const eLerp = bandEnergy > r.prevEnergy ? attack : release;
                r.prevEnergy += (bandEnergy - r.prevEnergy) * eLerp;
                u.uBandEnergy.value = r.prevEnergy;

                // Per-ribbon transient: a sudden jump in THIS band kicks
                // THIS ribbon — snares ripple treble lines, kicks slam bass
                if (bandEnergy - r.prevRaw > 0.22) r.kick = 1;
                r.prevRaw = bandEnergy;
                r.kick *= Math.pow(0.002, dt);

                // Amplitude: shaped curve = quiet stays calm, peaks punch
                const shaped = Math.pow(r.prevEnergy, 1.3);
                const target = 12 + shaped * 150 * s.height * (0.55 + react * 0.38);
                const ampLerp = target > r.amp ? attack : release;
                r.amp += (target - r.amp) * ampLerp;
                u.uAmp.value = r.amp;

                // Each ribbon lit by its own band, not the flat mix level
                u.uGlow.value = 0.26 + r.prevEnergy * (0.4 + react * 0.35) + audio.level * 0.12;

                // Beat pulse + this ribbon's own transient kick
                u.uPulse.value = Math.min(1.6, st.pulseEnv * s.pulse + r.kick * 0.8);

                // Hue shimmer from beats + band character
                u.uHue.value = audio.beatEnv * 0.6 + r.traits.hueShift * r.prevEnergy;
                u.uFreqMult.value = r.traits.freqMult;

                // Palette colours glide instead of snapping
                const [a, b] = palette[i % palette.length];
                u.uColorA.value.lerp(st.tmpA.set(a), Math.min(1, 2.5 * dt));
                u.uColorB.value.lerp(st.tmpB.set(b), Math.min(1, 2.5 * dt));
            }

            // ── DISPOSE FADED-OUT RIBBONS ────────────────────────
            for (let i = toDispose.length - 1; i >= 0; i--) {
                const idx = toDispose[i];
                const r = st.ribbons[idx];
                ctx.scene.remove(r.mesh);
                r.geom.dispose();
                r.mat.dispose();
                st.ribbons.splice(idx, 1);
            }
        }
    });

})();
