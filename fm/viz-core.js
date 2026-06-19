/* ═══════════════════════════════════════════════════════════════
   CUCEU FM — Visualizer Core
   One shared WebGL renderer, audio band analysis, settings engine.
   Visualizers register themselves via CuceuViz.register (see
   visualizers.js). Requires THREE (global) and CuceuStore (shared.js).
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const CuceuViz = (() => {
    const SETTINGS_KEY = 'cuceu-viz-settings';
    const DEMO_KEY = 'cuceu-viz-demo';

    const registry = new Map();

    let renderer = null;
    let container = null;
    let provider = null;        // { getFrequencyData, getSampleRate, getFrequencyBinCount }
    let active = null;          // { def, ctx }
    let animId = null;
    let lastTime = 0;
    let elapsed = 0;
    let resizeObs = null;
    let pageHidden = false;

    const isMobile = () => window.innerWidth < 600;

    /* ── AUDIO ANALYSIS ─────────────────────────────────────── */

    const BANDS = [
        ['bass',   20,   140],
        ['lowMid', 140,  400],
        ['mid',    400,  2000],
        ['treble', 2000, 8000],
        ['air',    8000, 16000]
    ];

    const audio = {
        bass: 0, lowMid: 0, mid: 0, treble: 0, air: 0,
        level: 0, beat: false, beatEnv: 0,
        spectrum: null,
        spectrumLog: (n) => logBuckets(n)
    };

    let dataArray = null;
    let agcMax = 0.25;
    let bassAvg = 0;
    let lastBeatAt = 0;
    const smoothed = {};
    const logCache = new Map();

    // iOS Safari won't feed live HTTP streams into the analyser (zeros).
    // When we're playing but the spectrum stays silent, synthesize one so
    // the visuals still dance.
    let isPlaying = false;
    let silentFrames = 0;
    let synthFallback = false;
    let darkTheme = true;

    function isDemoMode() {
        try { return localStorage.getItem(DEMO_KEY) === '1'; } catch { return false; }
    }

    function sampleRate() {
        return provider && provider.getSampleRate ? provider.getSampleRate() : 44100;
    }

    function ensureDataArray() {
        const bins = provider && provider.getFrequencyBinCount ? provider.getFrequencyBinCount() : 512;
        if (!dataArray || dataArray.length !== bins) {
            dataArray = new Uint8Array(bins);
            audio.spectrum = dataArray;
            logCache.clear();
        }
    }

    // Synthesized spectrum so visualizers can be tested with the stream offline.
    function fillDemoSpectrum(now) {
        const n = dataArray.length;
        const beatPhase = (now % 500) / 500;
        const kick = Math.pow(1 - beatPhase, 3);
        const sway = 0.5 + 0.5 * Math.sin(now * 0.0007);
        for (let i = 0; i < n; i++) {
            const u = i / n;
            const bassEnv = Math.exp(-u * 18) * kick * 230;
            const midEnv = Math.exp(-Math.pow((u - 0.18 - sway * 0.1) * 9, 2)) *
                           (120 + 80 * Math.sin(now * 0.003 + u * 40));
            const trebEnv = Math.exp(-Math.pow((u - 0.55) * 4, 2)) *
                            (40 + 70 * sway) * (0.6 + 0.4 * Math.random());
            dataArray[i] = Math.max(0, Math.min(255, bassEnv + Math.max(0, midEnv) + trebEnv));
        }
    }

    function bandRaw(minHz, maxHz) {
        const nyquist = sampleRate() / 2;
        const n = dataArray.length;
        const lo = Math.max(0, Math.floor(minHz / nyquist * n));
        const hi = Math.min(n - 1, Math.ceil(maxHz / nyquist * n));
        if (hi <= lo) return 0;
        let sum = 0;
        for (let i = lo; i <= hi; i++) sum += dataArray[i];
        return sum / ((hi - lo + 1) * 255);
    }

    function updateAudio(now) {
        ensureDataArray();
        if (isDemoMode()) {
            fillDemoSpectrum(now);
        } else if (provider && provider.getFrequencyData) {
            provider.getFrequencyData(dataArray);
            if (isPlaying) {
                let sum = 0;
                for (let i = 0; i < dataArray.length; i += 8) sum += dataArray[i];
                if (sum === 0) {
                    silentFrames++;
                    if (silentFrames > 150) synthFallback = true;   // ~2.5s @60fps
                } else {
                    silentFrames = 0;
                    synthFallback = false;
                }
                if (synthFallback) fillDemoSpectrum(now);
            }
        }

        let levelSum = 0;
        for (const [name, lo, hi] of BANDS) {
            const raw = bandRaw(lo, hi);
            levelSum += raw;
            // Soft AGC: normalize against a slowly-decaying rolling max
            agcMax = Math.max(raw, agcMax * 0.9995, 0.12);
            const norm = Math.min(1, raw / agcMax);
            const prev = smoothed[name] || 0;
            const k = norm > prev ? 0.35 : 0.08; // fast attack, slow release
            smoothed[name] = prev + (norm - prev) * k;
            audio[name] = smoothed[name];
        }
        audio.level = Math.min(1, levelSum / BANDS.length / Math.max(agcMax, 0.12));

        // Beat detection: bass spike vs ~1s rolling average, 250ms refractory
        bassAvg = bassAvg * 0.98 + audio.bass * 0.02;
        audio.beat = false;
        if (audio.bass > bassAvg * 1.35 && audio.bass > 0.15 && now - lastBeatAt > 250) {
            audio.beat = true;
            audio.beatEnv = 1;
            lastBeatAt = now;
        }
        audio.beatEnv *= 0.92;
    }

    function logBuckets(n) {
        let out = logCache.get(n);
        if (!out) { out = new Float32Array(n); logCache.set(n, out); }
        if (!dataArray) return out;
        const fLo = 30, fHi = 16000;
        const nyquist = sampleRate() / 2;
        const bins = dataArray.length;
        for (let j = 0; j < n; j++) {
            const f0 = fLo * Math.pow(fHi / fLo, j / n);
            const f1 = fLo * Math.pow(fHi / fLo, (j + 1) / n);
            const b0 = Math.max(0, Math.floor(f0 / nyquist * bins));
            const b1 = Math.min(bins - 1, Math.max(b0, Math.ceil(f1 / nyquist * bins)));
            let sum = 0;
            for (let i = b0; i <= b1; i++) sum += dataArray[i];
            const raw = sum / ((b1 - b0 + 1) * 255);
            out[j] = Math.min(1, raw / Math.max(agcMax, 0.12));
        }
        return out;
    }

    /* ── SETTINGS ENGINE ────────────────────────────────────── */

    function storedSettings() {
        return CuceuStore.get(SETTINGS_KEY, {});
    }

    function getSettings(vizId) {
        const def = registry.get(vizId);
        if (!def) return {};
        const saved = storedSettings()[vizId] || {};
        const out = {};
        for (const s of def.settings || []) {
            out[s.key] = saved[s.key] !== undefined ? saved[s.key] : s.default;
        }
        return out;
    }

    function setSetting(vizId, key, value) {
        const all = storedSettings();
        all[vizId] = all[vizId] || {};
        all[vizId][key] = value;
        CuceuStore.set(SETTINGS_KEY, all);

        if (active && active.def.id === vizId) {
            const spec = (active.def.settings || []).find(s => s.key === key);
            active.ctx.settings[key] = value;
            if (spec && spec.rebuild) restart(vizId);
        }
    }

    function resetSettings(vizId) {
        const all = storedSettings();
        delete all[vizId];
        CuceuStore.set(SETTINGS_KEY, all);
        if (active && active.def.id === vizId) restart(vizId);
    }

    function buildSettingsPanel(vizId, mount) {
        const def = registry.get(vizId);
        if (!def || !mount) return;
        mount.innerHTML = '';
        const values = getSettings(vizId);
        const sections = [['look', 'LOOK'], ['audio', 'AUDIO REACT']];

        for (const [secKey, secLabel] of sections) {
            const items = (def.settings || []).filter(s => (s.section || 'look') === secKey);
            if (!items.length) continue;
            const head = document.createElement('div');
            head.className = 'viz-set-section';
            head.textContent = secLabel;
            mount.appendChild(head);

            for (const s of items) {
                const row = document.createElement('label');
                row.className = 'viz-set-row';

                // Header row: label on left, value readout on right
                const headerRow = document.createElement('div');
                headerRow.className = 'viz-set-header';
                const label = document.createElement('span');
                label.className = 'viz-set-label';
                label.textContent = s.label;
                headerRow.appendChild(label);

                if (s.type === 'select') {
                    row.appendChild(headerRow);
                    const sel = document.createElement('select');
                    sel.className = 'viz-set-select';
                    for (const opt of s.options) {
                        const o = document.createElement('option');
                        o.value = opt.value;
                        o.textContent = opt.label;
                        sel.appendChild(o);
                    }
                    sel.value = values[s.key];
                    sel.addEventListener('change', () => setSetting(vizId, s.key, sel.value));
                    row.appendChild(sel);
                } else {
                    // Value readout badge
                    const valBadge = document.createElement('span');
                    valBadge.className = 'viz-set-value';
                    valBadge.textContent = values[s.key];
                    headerRow.appendChild(valBadge);
                    row.appendChild(headerRow);

                    const input = document.createElement('input');
                    input.type = 'range';
                    input.className = 'aero-slider viz-set-range';
                    input.min = s.min;
                    input.max = s.max;
                    input.step = s.step;
                    input.value = values[s.key];
                    input.addEventListener('input', () => {
                        const v = parseFloat(input.value);
                        valBadge.textContent = v;
                        setSetting(vizId, s.key, v);
                    });
                    row.appendChild(input);
                }
                mount.appendChild(row);
            }
        }

        const reset = document.createElement('button');
        reset.className = 'viz-set-reset';
        reset.type = 'button';
        reset.textContent = 'RESET';
        reset.addEventListener('click', () => {
            resetSettings(vizId);
            buildSettingsPanel(vizId, mount);
        });
        mount.appendChild(reset);
    }

    /* ── RENDERER / LIFECYCLE ───────────────────────────────── */

    function ensureRenderer() {
        if (renderer) return;
        // Transparent canvas: the page background (theme-aware) shows through
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.id = 'viz-canvas';
        renderer.domElement.style.cssText =
            'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
        container.appendChild(renderer.domElement);

        resizeObs = new ResizeObserver(() => {
            if (!renderer) return;
            const w = container.clientWidth, h = container.clientHeight;
            renderer.setSize(w, h);
            if (active && active.ctx.camera) {
                active.ctx.camera.aspect = w / h;
                active.ctx.camera.updateProjectionMatrix();
            }
            if (active && active.def.resize) active.def.resize(active.ctx, w, h);
        });
        resizeObs.observe(container);
    }

    function disposeScene(scene) {
        scene.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
            for (const m of mats) {
                if (m.map && !m.map.userData?.shared) m.map.dispose();
                m.dispose();
            }
        });
    }

    function frame(now) {
        animId = requestAnimationFrame(frame);
        if (!active) return;
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        elapsed += dt;
        updateAudio(now);
        active.def.update(active.ctx, dt, elapsed, audio);
        renderer.render(active.ctx.scene, active.ctx.camera);
    }

    function start(vizId) {
        const def = registry.get(vizId);
        if (!def || !container) return false;
        stop();
        ensureRenderer();

        const w = container.clientWidth, h = container.clientHeight;
        renderer.setSize(w, h);
        renderer.domElement.classList.add('visible');

        const ctx = {
            scene: new THREE.Scene(),
            camera: null,
            renderer,
            settings: getSettings(vizId),
            quality: isMobile() ? 0.5 : 1,
            width: w,
            height: h,
            dark: darkTheme,
            state: {}
        };
        def.init(ctx);
        if (def.setTheme) def.setTheme(ctx, darkTheme);

        active = { def, ctx };
        lastTime = performance.now();
        if (!pageHidden && animId === null) animId = requestAnimationFrame(frame);
        return true;
    }

    function restart(vizId) {
        if (active && active.def.id === vizId) start(vizId);
    }

    function stop() {
        if (animId !== null) { cancelAnimationFrame(animId); animId = null; }
        if (active) {
            if (active.def.dispose) active.def.dispose(active.ctx);
            disposeScene(active.ctx.scene);
            active = null;
        }
        if (renderer) renderer.domElement.classList.remove('visible');
    }

    document.addEventListener('visibilitychange', () => {
        pageHidden = document.hidden;
        if (pageHidden) {
            if (animId !== null) { cancelAnimationFrame(animId); animId = null; }
        } else if (active && animId === null) {
            lastTime = performance.now();
            animId = requestAnimationFrame(frame);
        }
    });

    /* ── PUBLIC API ─────────────────────────────────────────── */

    return {
        register(def) { registry.set(def.id, def); },
        list() { return [...registry.values()].map(d => ({ id: d.id, label: d.label })); },
        setup(opts) {
            container = opts.container;
            provider = opts.provider;
        },
        start,
        stop,
        activeId() { return active ? active.def.id : null; },
        setPlaying(p) {
            isPlaying = !!p;
            if (!isPlaying) { silentFrames = 0; synthFallback = false; }
        },
        setTheme(dark) {
            darkTheme = !!dark;
            if (active) {
                active.ctx.dark = darkTheme;
                if (active.def.setTheme) active.def.setTheme(active.ctx, darkTheme);
            }
        },
        getSettings,
        setSetting,
        resetSettings,
        buildSettingsPanel
    };
})();
