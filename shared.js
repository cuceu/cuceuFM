/* ═══════════════════════════════════════════════════════════════
   CUCEU — Shared JavaScript
   Clock, page transitions, dark mode, keyboard shortcuts.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ── DARK MODE ────────────────────────────────────────────────
// Single source of truth: localStorage key 'cuceu-theme'
const CuceuTheme = (() => {
    const STORAGE_KEY = 'cuceu-theme';

    function get() {
        return localStorage.getItem(STORAGE_KEY);
    }

    function set(mode) {
        localStorage.setItem(STORAGE_KEY, mode);
    }

    function isDark() {
        const saved = get();
        if (saved === 'dark') return true;
        if (saved === 'light') return false;
        // Fallback: respect OS preference
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    }

    /** Apply dark mode state to body + optional callback */
    function apply(onChangeCallback) {
        const dark = isDark();
        document.body.classList.toggle('dark-mode', dark);
        if (onChangeCallback) onChangeCallback(dark);
    }

    /** Toggle dark mode + persist + optional callback */
    function toggle(onChangeCallback) {
        const nowDark = !document.body.classList.contains('dark-mode');
        document.body.classList.toggle('dark-mode', nowDark);
        set(nowDark ? 'dark' : 'light');
        if (onChangeCallback) onChangeCallback(nowDark);
    }

    /** Bind a toggle button element */
    function bindToggle(buttonEl, onChangeCallback) {
        if (!buttonEl) return;
        buttonEl.addEventListener('click', () => toggle(onChangeCallback));
    }

    // Migrate old keys on first load
    function migrateOldKeys() {
        const oldFmDark = localStorage.getItem('cuceu-fm-dark');
        const oldTheme = localStorage.getItem('theme');
        if (!get()) {
            if (oldFmDark === '1' || oldTheme === 'dark') {
                set('dark');
            } else if (oldFmDark === '0' || oldTheme === 'light') {
                set('light');
            }
        }
        // Clean up old keys
        localStorage.removeItem('cuceu-fm-dark');
        localStorage.removeItem('theme');
    }

    migrateOldKeys();

    return { get, set, isDark, apply, toggle, bindToggle };
})();

// ── CLOCK ────────────────────────────────────────────────────
const CuceuClock = (() => {
    const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    let intervalId = null;

    function format() {
        const n = new Date();
        const h = n.getHours() % 12 || 12;
        const m = n.getMinutes().toString().padStart(2, '0');
        const ap = n.getHours() >= 12 ? 'PM' : 'AM';
        return `${DAYS[n.getDay()]} | ${h}:${m} ${ap}`;
    }

    /** Start clock updates on all elements matching selector */
    function start(selector = '.cuceu-clock-text') {
        function tick() {
            const text = format();
            document.querySelectorAll(selector).forEach(el => {
                el.textContent = text;
            });
        }
        tick();
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(tick, 1000);
    }

    return { format, start };
})();

// ── PAGE TRANSITIONS ─────────────────────────────────────────
const CuceuTransitions = (() => {
    const EXIT_DURATION = 600; // ms

    function init() {
        document.querySelectorAll('.internal-link').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                document.body.classList.add('is-exiting');
                const href = link.href;
                setTimeout(() => {
                    window.location.assign(href);
                }, EXIT_DURATION);
            });
        });

        // Handle bfcache restoration
        window.addEventListener('pageshow', e => {
            if (e.persisted) {
                document.body.classList.remove('is-exiting');
            }
        });
    }

    return { init, EXIT_DURATION };
})();

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    CuceuTheme.apply();
    CuceuClock.start();
    CuceuTransitions.init();
});
