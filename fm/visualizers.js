/* ═══════════════════════════════════════════════════════════════
   CUCEU FM — Visualizers
   Audio-reactive scenes registered with CuceuViz (viz-core.js):

     AURORA — stacked signal ridgelines (Unknown Pleasures style):
              hairline waveform rows that occlude one another, peaks
              tipping into acid orange. Raw / monochrome to match the
              site. Flowy, no strobe, no row-swapping.

   Occlusion is done with the WebGL depth buffer: each row draws an
   INVISIBLE fill (colorWrite:false) under its ridge that writes depth,
   so rows behind get hidden — but nothing ever paints over the page
   background or the now-playing artwork (the canvas stays transparent).
   Works in light + dark (line colour flips, acid stays).
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(() => {

    const M = 160;                 // points across each ridgeline
    const C_OFF  = [0.957, 0.949, 0.925];  // #f4f2ec off-white (dark theme)
    const C_INK  = [0.078, 0.063, 0.051];  // near-black ink   (light theme)
    const C_ACID = [1.0, 0.302, 0.0];      // #ff4d00 acid peaks

    // ── value noise (smooth, deterministic) ──────────────────────
    function hash(n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
    function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; }
    function noise2(x, y) { return (noise1(x * 1.7 + y * 0.3) + noise1(y * 1.9 - x * 0.4)) * 0.5; }

    // ── ROW FACTORY ──────────────────────────────────────────────
    // Each row = an invisible depth-writing fill + a vertex-coloured line.
    function createRow(scene, j, N) {
        const baseY = 0.09 + (j / Math.max(1, N - 1)) * 0.52;   // front (bottom) → back (top)
        const z = -(j / Math.max(1, N - 1)) * 1.0;              // front nearer camera

        // Fill: ribbon from ridge down to below-screen, depth only.
        const fillPos = new Float32Array(2 * M * 3);
        for (let i = 0; i < M; i++) {
            const x = i / (M - 1);
            fillPos[i * 3]         = x; fillPos[i * 3 + 1]         = baseY; fillPos[i * 3 + 2]         = z;
            fillPos[(M + i) * 3]   = x; fillPos[(M + i) * 3 + 1]   = -0.3;  fillPos[(M + i) * 3 + 2]   = z;
        }
        const idx = [];
        for (let i = 0; i < M - 1; i++) {
            idx.push(i, M + i, i + 1, i + 1, M + i, M + i + 1);
        }
        const fillGeo = new THREE.BufferGeometry();
        fillGeo.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));
        fillGeo.setIndex(idx);
        const fillMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, depthTest: true });
        const fill = new THREE.Mesh(fillGeo, fillMat);
        fill.renderOrder = 0;
        scene.add(fill);

        // Line: the ridge curve. RGBA vertex colours (alpha = depth dim).
        const linePos = new Float32Array(M * 3);
        const lineCol = new Float32Array(M * 4);
        for (let i = 0; i < M; i++) {
            const x = i / (M - 1);
            linePos[i * 3] = x; linePos[i * 3 + 1] = baseY; linePos[i * 3 + 2] = z + 0.003;
        }
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
        lineGeo.setAttribute('color', new THREE.BufferAttribute(lineCol, 4));
        const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: true });
        const line = new THREE.Line(lineGeo, lineMat);
        line.renderOrder = 1;
        scene.add(line);

        return { line, fill, linePos, lineCol, fillPos, baseY, energy: 0 };
    }

    CuceuViz.register({
        id: 'aurora',
        label: 'Aurora',
        settings: [
            { key: 'rows',   label: 'Rows',       section: 'look',  min: 12,  max: 30, step: 1,   default: 22, rebuild: true },
            { key: 'flow',   label: 'Flow',       section: 'look',  min: 0.15, max: 1.4, step: 0.05, default: 0.45 },
            { key: 'height', label: 'Wave Height', section: 'audio', min: 0.3, max: 3,  step: 0.1, default: 1 },
            { key: 'react',  label: 'Reactivity', section: 'audio', min: 0.2, max: 3,  step: 0.1, default: 1.4 },
            { key: 'smooth', label: 'Smooth Bass', section: 'audio', min: 0,  max: 1,  step: 0.05, default: 0.35 }
        ],

        init(ctx) {
            const N = ctx.settings.rows;
            // Normalised ortho space: x,y ∈ [0,1] (y up), depth in z.
            ctx.camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 100);
            ctx.camera.position.z = 10;

            const rows = [];
            for (let j = 0; j < N; j++) rows.push(createRow(ctx.scene, j, N));
            ctx.state.rows = rows;
            ctx.state.N = N;
            ctx.state.dark = ctx.dark;
            ctx.state.kick = 0;
        },

        setTheme(ctx, dark) {
            ctx.state.dark = dark;   // line colours are recomputed each frame
        },

        update(ctx, dt, elapsed, audio) {
            const s = ctx.settings, st = ctx.state, N = st.N;
            const spec = audio.spectrumLog ? audio.spectrumLog(N) : null;
            const base = st.dark ? C_OFF : C_INK;
            const fstep = Math.min(1, dt * 60);   // frame-rate compensation

            // Smoothed kick: a gentle soft-attack on top of viz-core's decaying
            // beatEnv — pumps the bass rows on each beat. Musical, not the jerky
            // strobe the old aurora had.
            st.kick += ((audio.beatEnv || 0) - st.kick) * Math.min(1, 0.3 * fstep);

            for (let j = 0; j < N; j++) {
                const row = st.rows[j];
                const raw = spec ? spec[j] : (audio.level || 0);
                const lowness = 1 - j / Math.max(1, N - 1);          // 1 = front/bass

                // Fast attack → JUMPS with the music; smooth release → settles
                // without jerking. Smooth Bass lengthens the fall, front rows
                // fall a touch slower still (the low end swells).
                const attack = 0.55;
                const release = (0.05 + s.smooth * 0.13) * (1 - lowness * 0.35);
                const k = Math.min(1, (raw > row.energy ? attack : release) * fstep);
                row.energy += (raw - row.energy) * k;

                // Amplitude is MOSTLY the music now: near-flat in silence → tall
                // when loud, plus a bass-weighted kick pump on the beat.
                const drive = Math.pow(row.energy, 1.1) * s.react;
                const beat  = st.kick * lowness * 0.55 * s.react;
                const amp = (0.012 + (drive + beat) * 0.36) * s.height;
                const phaseJ = elapsed * s.flow * 0.22 - j * 0.16;

                const lp = row.linePos, lc = row.lineCol, fp = row.fillPos;
                const depthA = 0.30 + 0.70 * lowness;   // front brighter, back fainter

                for (let i = 0; i < M; i++) {
                    const x = i / (M - 1);
                    // Gentle centre bias (edges keep ~45%) so it isn't a fixed
                    // mountain — the music drives the height, not the curve.
                    const env = 0.45 + 0.55 * Math.exp(-Math.pow((x - 0.5) * 1.5, 2));
                    const roll = noise2(x * 5.0 + j * 0.7, phaseJ * 0.6);
                    const jag = Math.abs(noise2(x * 21.0 + j * 1.7, phaseJ * 1.1) - 0.5) * 2;
                    const h = (roll * 0.6 + jag * 0.45) * env * amp;
                    const y = row.baseY + h;

                    lp[i * 3 + 1] = y;
                    fp[i * 3 + 1] = y;

                    const acid = h > 0.06;
                    const col = acid ? C_ACID : base;
                    const a = acid ? Math.max(depthA, 0.9) : Math.min(1, depthA + row.energy * 0.25);
                    lc[i * 4]     = col[0];
                    lc[i * 4 + 1] = col[1];
                    lc[i * 4 + 2] = col[2];
                    lc[i * 4 + 3] = a;
                }

                row.line.geometry.attributes.position.needsUpdate = true;
                row.line.geometry.attributes.color.needsUpdate = true;
                row.fill.geometry.attributes.position.needsUpdate = true;
            }
        }
    });

})();
