// Shared UI primitives: toasts (with optional action), confirm dialog with
// focus trap, image fallback, skeletons, and the ⌘K search palette.
import { escapeHtml } from './format.js';
let toastSeq = 0;
let toastItems = [];
export function toast(message, action) {
    const id = ++toastSeq;
    toastItems = [...toastItems.slice(-2), { id, message, action }];
    renderToasts();
    setTimeout(() => {
        toastItems = toastItems.filter((t) => t.id !== id);
        renderToasts();
    }, action ? 7000 : 4200);
}
function renderToasts() {
    let host = document.getElementById('toasts');
    if (!host) {
        host = document.createElement('div');
        host.id = 'toasts';
        host.className = 'toasts';
        host.setAttribute('aria-live', 'polite');
        document.body.appendChild(host);
    }
    host.innerHTML = toastItems.map((t) => `
    <div class="toast" data-toast="${t.id}">
      <span class="toast__msg">${escapeHtml(t.message)}</span>
      ${t.action ? `<button class="linkbtn toast__action" data-toast-action="${t.id}">${escapeHtml(t.action.label)}</button>` : ''}
    </div>`).join('');
    host.querySelectorAll('[data-toast-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const item = toastItems.find((t) => t.id === Number(btn.dataset.toastAction));
            if (item?.action) {
                item.action.run();
                toastItems = toastItems.filter((t) => t.id !== item.id);
                renderToasts();
            }
        });
    });
}
export function confirmDialog(opts) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML = `
      <div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title">${escapeHtml(opts.title)}</h2>
        <p class="dialog__body">${escapeHtml(opts.body)}</p>
        ${opts.typed ? `
          <div class="field dialog__typed">
            <label for="dlg-type">Type “${escapeHtml(opts.typed)}” to confirm</label>
            <input id="dlg-type" class="input" autocomplete="off" />
          </div>` : ''}
        <div class="dialog__actions">
          <button class="btn" data-dlg="cancel">${escapeHtml(opts.cancelLabel ?? 'Cancel')}</button>
          <button class="btn ${opts.danger ? 'btn--danger' : 'btn--primary'}" data-dlg="ok" ${opts.typed ? 'disabled' : ''}>${escapeHtml(opts.confirmLabel ?? 'Confirm')}</button>
        </div>
      </div>`;
        document.body.appendChild(overlay);
        const dialog = overlay.querySelector('.dialog');
        const okBtn = overlay.querySelector('[data-dlg="ok"]');
        const cancelBtn = overlay.querySelector('[data-dlg="cancel"]');
        const typedInput = overlay.querySelector('#dlg-type');
        const previousFocus = document.activeElement;
        function close(result) {
            document.removeEventListener('keydown', onKey, true);
            overlay.remove();
            previousFocus?.focus?.();
            resolve(result);
        }
        function onKey(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                close(false);
                return;
            }
            if (e.key === 'Tab') {
                // Focus trap: cycle within the dialog.
                const focusables = [...dialog.querySelectorAll('button:not([disabled]), input, [href]')];
                if (!focusables.length)
                    return;
                const first = focusables[0], last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
                else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
        document.addEventListener('keydown', onKey, true);
        overlay.addEventListener('click', (e) => { if (e.target === overlay)
            close(false); });
        cancelBtn.addEventListener('click', () => close(false));
        okBtn.addEventListener('click', () => close(true));
        typedInput?.addEventListener('input', () => {
            okBtn.disabled = typedInput.value.trim() !== opts.typed;
        });
        (typedInput ?? cancelBtn).focus();
    });
}
// ---- Image fallback (issue #16) --------------------------------------------
// One delegated handler: a failed image swaps to the placeholder exactly once.
// The placeholder itself failing cannot loop (data-fellback guard).
export const PLACEHOLDER = 'assets/samples/tea-garden-480.webp';
export function initImageFallback() {
    document.addEventListener('error', (e) => {
        const el = e.target;
        if (!(el instanceof HTMLImageElement))
            return;
        if (el.dataset.fellback)
            return;
        el.dataset.fellback = '1';
        el.src = PLACEHOLDER;
        el.removeAttribute('srcset');
        el.classList.add('img--fellback');
    }, true);
}
// Responsive image markup with reserved aspect ratio (issues #16, #37).
export function artImage(image, alt, opts = {}) {
    const base = `assets/samples/${image}`;
    const sizes = opts.sizes ?? '(max-width: 640px) 92vw, (max-width: 1100px) 45vw, 380px';
    return `<img class="${opts.cls ?? ''}" src="${base}-760.webp"
    srcset="${base}-480.webp 480w, ${base}-760.webp 760w, ${base}-1200.webp 1200w"
    sizes="${sizes}" alt="${escapeHtml(alt)}" width="760" height="950"
    ${opts.lazy === false ? '' : 'loading="lazy"'} decoding="async" />`;
}
// ---- Skeletons (issue #22) --------------------------------------------------
export function skeletonCards(n = 8) {
    return `<div class="art-grid" aria-hidden="true">${Array.from({ length: n }, () => `
    <div class="art-card card skeleton-card">
      <div class="skeleton skeleton--img"></div>
      <div class="art-card__body">
        <div class="skeleton skeleton--line"></div>
        <div class="skeleton skeleton--line skeleton--short"></div>
      </div>
    </div>`).join('')}</div>`;
}
export function skeletonRows(n = 6) {
    return `<div class="card" aria-hidden="true">${Array.from({ length: n }, () => `
    <div class="skeleton-row">
      <div class="skeleton skeleton--thumb"></div>
      <div class="skeleton skeleton--line"></div>
      <div class="skeleton skeleton--line skeleton--short"></div>
    </div>`).join('')}</div>`;
}
let paletteOpen = false;
let paletteTrigger = null;
export function openPalette(items, onPick, trigger) {
    if (paletteOpen)
        return;
    paletteOpen = true;
    paletteTrigger = trigger ?? document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'overlay overlay--top';
    overlay.innerHTML = `
    <div class="palette card" role="dialog" aria-modal="true" aria-label="Search the works">
      <div class="palette__bar">
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        <input class="palette__input" type="search" placeholder="Search by title, medium or tag…" aria-label="Search the works" autocomplete="off" />
        <kbd class="kbd">Esc</kbd>
      </div>
      <div class="palette__results" role="listbox" aria-label="Results"></div>
    </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('.palette__input');
    const results = overlay.querySelector('.palette__results');
    let active = 0;
    let shown = [];
    function render() {
        const q = input.value.trim().toLowerCase();
        shown = items.filter((it) => !q || it.title.toLowerCase().includes(q) || it.medium.toLowerCase().includes(q) ||
            it.tags.some((t) => t.toLowerCase().includes(q))).slice(0, 12);
        active = Math.min(active, Math.max(0, shown.length - 1));
        results.innerHTML = shown.length
            ? shown.map((it, i) => `
        <button class="palette__item ${i === active ? 'is-active' : ''}" role="option" aria-selected="${i === active}" data-pick="${it.id}">
          <b>${escapeHtml(it.title)}</b>
          <small>${escapeHtml(it.medium)}${it.tags.length ? ' · ' + escapeHtml(it.tags.slice(0, 3).join(', ')) : ''}</small>
        </button>`).join('')
            : `<div class="palette__empty">No works match “${escapeHtml(input.value)}”.</div>`;
        results.querySelectorAll('[data-pick]').forEach((btn) => {
            btn.addEventListener('click', () => pick(btn.dataset.pick));
            btn.addEventListener('mousemove', () => {
                const idx = shown.findIndex((s) => s.id === btn.dataset.pick);
                if (idx !== active) {
                    active = idx;
                    render();
                    input.focus();
                }
            });
        });
    }
    function pick(id) {
        close();
        onPick(id);
    }
    function close() {
        paletteOpen = false;
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        paletteTrigger?.focus?.();
    }
    function onKey(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
        else if (e.key === 'ArrowDown') {
            e.preventDefault();
            active = Math.min(active + 1, shown.length - 1);
            render();
        }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            active = Math.max(active - 1, 0);
            render();
        }
        else if (e.key === 'Enter' && shown[active]) {
            e.preventDefault();
            pick(shown[active].id);
        }
    }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => { if (e.target === overlay)
        close(); });
    input.addEventListener('input', () => { active = 0; render(); });
    render();
    input.focus();
}
export function isPaletteOpen() { return paletteOpen; }
