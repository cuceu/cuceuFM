/* ═══════════════════════════════════════════════════════════════
   CUCEU FM — Visualizers
   Audio-reactive scenes registered with CuceuViz (viz-core.js):

     AURORA — borealis light curtains, one per frequency band

   Inspired by the Windows XP/Vista Media Player visualizations.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(() => {

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

})();
