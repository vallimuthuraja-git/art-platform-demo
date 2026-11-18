// Boot: load the mock store, render the shell, route on the hash.
// Hash routing keeps deep links working on GitHub Pages with no 404 hack.
import { Store, visibleArtworks, settleDue } from './store.js';
import { openPalette, isPaletteOpen, initImageFallback, toast } from './ui.js';
import * as views from './views.js';
import { escapeHtml } from './format.js';
const NAV = [
    { href: '#/', label: 'Works', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', match: (p) => p === '/' },
    { href: '#/auctions', label: 'Auctions', icon: 'M12 3.5v8.5h8.5A8.5 8.5 0 1 1 12 3.5ZM15 3.8A8.5 8.5 0 0 1 20.2 9H15z', match: (p) => p.startsWith('/auction') },
    { href: '#/insights', label: 'Insights', icon: 'M4.5 19.5h15M7.5 16v-4.5M12 16V7.5M16.5 16v-6.5', match: (p) => p === '/insights' },
    { href: '#/admin', label: 'Ledger', icon: 'M4.5 8.5h14M15 5l3.5 3.5L15 12M19.5 15.5h-14M9 12l-3.5 3.5L9 19', match: (p) => p.startsWith('/admin') || p === '/orders' },
    { href: '#/settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 1-.1 1.2l2 1.6-2 3.4-2.4-1a7.5 7.5 0 0 1-2 1.2l-.4 2.6h-4l-.4-2.6a7.5 7.5 0 0 1-2-1.2l-2.4 1-2-3.4 2-1.6a7.4 7.4 0 0 1 0-2.4l-2-1.6 2-3.4 2.4 1a7.5 7.5 0 0 1 2-1.2L10 2h4l.4 2.6a7.5 7.5 0 0 1 2 1.2l2.4-1 2 3.4-2 1.6c.06.4.1.8.1 1.2Z', match: (p) => p === '/settings' },
    { href: '#/help', label: 'Help', icon: 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z', match: (p) => p === '/help' }
];
const MARK = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 16v-8M12 4l4 4M8 16l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
let store;
let cleanup = null;
function route() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [pathPart, queryPart] = hash.split('?');
    const path = pathPart || '/';
    const params = new URLSearchParams(queryPart ?? '');
    const seg = path.split('/').filter(Boolean);
    if (path === '/')
        return { path, page: views.catalogue, title: 'Works' };
    if (path === '/auctions')
        return { path, page: views.auctionsList, title: 'Auctions' };
    if (seg[0] === 'auction' && seg[1])
        return { path, page: views.auctionDetail(seg[1]), title: 'Auction' };
    if (seg[0] === 'artwork' && seg[1])
        return { path, page: views.artworkDetail(seg[1]), title: 'Work' };
    if (path === '/login')
        return { path, page: views.loginPage(params.get('next') ?? '#/admin'), title: 'Sign in' };
    if (path === '/admin')
        return { path, page: views.ledger, title: 'Ledger' };
    if (path === '/admin/new')
        return { path, page: views.newArtwork, title: 'New work' };
    if (seg[0] === 'admin' && seg[1] === 'artwork' && seg[2])
        return { path, page: views.editArtwork(seg[2]), title: 'Edit work' };
    if (path === '/insights')
        return { path, page: views.insights, title: 'Insights' };
    if (path === '/orders')
        return { path, page: views.ordersPage, title: 'Orders' };
    if (path === '/settings')
        return { path, page: views.settings, title: 'Settings' };
    if (path === '/help')
        return { path, page: views.help, title: 'Help' };
    return { path, page: views.notFound, title: 'Not found' };
}
function renderShell(path, title) {
    const me = store.currentUser();
    const initials = me ? (me.display_name || me.email).slice(0, 2).toUpperCase() : 'HS';
    const shell = document.getElementById('shell');
    shell.innerHTML = `
    <div class="slab">
      <aside class="side" aria-label="From the Studio">
        <div class="side__top">
          <a class="side__brand" href="#/" aria-label="From the Studio — Works">
            <span class="mark" aria-hidden="true">${MARK}</span>
            <span class="side__name"><b>From the Studio</b><small>demo · mocked data</small></span>
          </a>
          <button class="side__fold" id="fold" aria-label="Collapse sidebar" aria-pressed="${document.documentElement.dataset.rail === 'true'}" data-tip="Collapse" data-tip-side="right">
            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9.5 4.5v15M16 10l-2 2 2 2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>
          </button>
        </div>
        <nav class="nav" aria-label="Sections">
          <span class="nav__pill" aria-hidden="true"></span>
          ${NAV.map((item) => `
            <a class="nav__item" href="${item.href}" aria-current="${item.match(path) ? 'page' : 'false'}" data-tip="${item.label}" data-tip-side="right">
              <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${item.icon}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span class="nav__label">${item.label}</span>
            </a>`).join('')}
        </nav>
        <a class="safe" href="#/admin">
          <small>${me ? escapeHtml(me.display_name || me.email) : 'Studio host'}</small>
          <b>Studio ledger</b>
          <span>Inventory · orders · auctions</span>
        </a>
        <button class="side__me" id="me-btn" aria-label="${me ? 'Sign out' : 'Sign in as host'}" data-tip="${me ? 'Sign out' : 'Sign in'}" data-tip-side="right">
          <span class="av av--staff" aria-hidden="true">${initials}${me ? '<i class="av__dot"></i>' : ''}</span>
          <span class="me__text"><b>${me ? escapeHtml(me.display_name || me.email) : 'Host'}</b><small>${me ? 'signed in' : 'studio sign-in'}</small></span>
        </button>
      </aside>
      <div class="stage">
        <header class="head">
          <a class="head__mark" href="#/" aria-label="From the Studio — Works"><span class="mark" aria-hidden="true">${MARK}</span></a>
          <span class="head__title">${escapeHtml(title)}</span>
          <button class="head__search" type="button" id="search-btn" aria-label="Search the works (Ctrl+K)" aria-keyshortcuts="Control+K Meta+K">
            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
            <span>${path === '/' ? 'Search the works' : 'Search'}</span>
            <kbd class="kbd">⌘K</kbd>
          </button>
          <div class="head__tools">
            <button class="rbtn rbtn--flat" type="button" id="theme-btn" aria-label="Switch theme" data-tip="${document.documentElement.dataset.theme === 'dark' ? 'Daylight' : 'Night'}">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
            <a class="rbtn rbtn--accent" href="#/admin/new" aria-label="Add a work" data-tip="Add a work">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </a>
          </div>
        </header>
        <main class="main" id="main-content" tabindex="-1"></main>
      </div>
    </div>
    <nav class="tabbar" aria-label="Quick">
      <span class="tabbar__pill" aria-hidden="true"></span>
      ${NAV.slice(0, 4).map((item) => `
        <a href="${item.href}" aria-current="${item.match(path) ? 'page' : 'false'}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${item.icon}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          ${item.label}
        </a>`).join('')}
      <a href="#/settings" aria-current="${path === '/settings' ? 'page' : 'false'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.8l2 2.1 2.9-.4.7 2.8 2.6 1.4-1 2.8 1 2.8-2.6 1.4-.7 2.8-2.9-.4-2 2.1-2-2.1-2.9.4-.7-2.8-2.6-1.4 1-2.8-1-2.8 2.6-1.4.7-2.8 2.9.4Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
        More
      </a>
    </nav>`;
    document.getElementById('fold')?.addEventListener('click', () => {
        const next = document.documentElement.dataset.rail !== 'true';
        document.documentElement.dataset.rail = next ? 'true' : 'false';
        try {
            localStorage.setItem('ap_rail', next ? '1' : '0');
        }
        catch { /* ignore */ }
        renderShell(path, title);
        mountPage();
    });
    document.getElementById('theme-btn')?.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try {
            localStorage.setItem('ap_theme', next);
        }
        catch { /* ignore */ }
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0c1210' : '#dfe6e1');
        renderShell(path, title);
        mountPage();
    });
    document.getElementById('me-btn')?.addEventListener('click', () => {
        if (store.currentUser()) {
            store.signOut();
            toast('Signed out.');
            navigate('#/');
        }
        else {
            navigate('#/login');
        }
    });
    document.getElementById('search-btn')?.addEventListener('click', (e) => openSearch(e.currentTarget));
    placePill();
}
function openSearch(trigger) {
    const items = visibleArtworks(store.state)
        .filter((a) => a.status === 'listed' || a.status === 'auction')
        .map((a) => ({ id: a.id, title: a.title, medium: a.medium, tags: a.tags }));
    openPalette(items, (id) => navigate(`#/artwork/${id}`), trigger);
}
// Sliding accent pill under the current nav item / tab.
function placePill() {
    const pill = document.querySelector('.nav__pill');
    const active = document.querySelector('.nav__item[aria-current="page"]');
    if (pill && active && pill.parentElement) {
        const navBox = pill.parentElement.getBoundingClientRect();
        const box = active.getBoundingClientRect();
        pill.style.opacity = '1';
        pill.style.height = box.height + 'px';
        pill.style.transform = `translateY(${box.top - navBox.top}px)`;
    }
    const tabPill = document.querySelector('.tabbar__pill');
    const tabActive = document.querySelector('.tabbar a[aria-current="page"]');
    if (tabPill && tabActive && tabPill.parentElement) {
        const bar = tabPill.parentElement.getBoundingClientRect();
        const box = tabActive.getBoundingClientRect();
        tabPill.style.opacity = '1';
        tabPill.style.width = box.width + 'px';
        tabPill.style.height = box.height + 'px';
        tabPill.style.transform = `translate(${box.left - bar.left - 6}px, 6px)`;
    }
}
function navigate(hash) {
    if (location.hash === hash)
        mountRoute();
    else
        location.hash = hash;
}
function mountPage() {
    const main = document.getElementById('main-content');
    if (!main)
        return;
    const { page } = route();
    const ctx = { store, navigate, rerender: mountRoute };
    try {
        cleanup?.();
        cleanup = page(main, ctx) ?? null;
    }
    catch (e) {
        console.error(e);
        views.renderError(main, 'A page failed to render. Your data is safe.');
    }
}
function mountRoute() {
    const { path, title } = route();
    renderShell(path, title);
    mountPage();
    document.getElementById('main-content')?.scrollTo?.(0, 0);
}
async function boot() {
    initImageFallback();
    store = await Store.load();
    settleDue(store.state);
    store.save();
    window.addEventListener('hashchange', mountRoute);
    window.addEventListener('resize', placePill);
    // ⌘K / Ctrl+K opens the search palette from any route (issue #19).
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (!isPaletteOpen())
                openSearch(document.getElementById('search-btn') ?? undefined);
        }
    });
    // Error boundary: a render error shows a themed card, not a white screen (#33).
    window.addEventListener('error', (e) => {
        const main = document.getElementById('main-content');
        if (main && e.message)
            views.renderError(main, 'Something went wrong on this page.');
    });
    // Skip link: move focus to the content region (issue #32).
    document.querySelector('.skip')?.addEventListener('click', (e) => {
        e.preventDefault();
        const main = document.getElementById('main-content');
        main?.focus();
        main?.scrollIntoView();
    });
    mountRoute();
}
boot().catch((e) => {
    console.error(e);
    const shell = document.getElementById('shell');
    if (shell)
        shell.innerHTML = '<div class="empty"><b>The demo could not start.</b>Try reloading the page.</div>';
});
