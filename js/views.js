import { MEDIUMS, STATUSES, ORDER_STATUSES, PUBLIC_STATUSES, minimumBid, quickBids, visibleArtworks, artworkById, auctionForArtwork, settleDue, placeBid, createAuction, endAuction, createArtwork, updateArtwork, deleteArtwork, restoreArtwork, advanceOrder, changePassword } from './store.js';
import { price, formatDate, formatDateShort, dims, relativeTime, countdown, nowSeconds, todayLabel, escapeHtml } from './format.js';
import { toast, confirmDialog, artImage, skeletonCards, skeletonRows } from './ui.js';
const CONTACT = 'enquiries@fromthestudio.example';
function user(ctx) { return ctx.store.currentUser(); }
function isAdmin(ctx) { return user(ctx)?.role === 'admin'; }
function requireHost(ctx, next) {
    if (!user(ctx)) {
        ctx.navigate(`#/login?next=${encodeURIComponent(next)}`);
        return false;
    }
    return true;
}
function statusPill(status) {
    const cls = status === 'listed' || status === 'active' || status === 'delivered' || status === 'paid' ? 'pill--good'
        : status === 'auction' || status === 'pending' || status === 'shipped' ? 'pill--info'
            : status === 'sold' || status === 'ended' || status === 'cancelled' || status === 'refunded' ? 'pill--bad'
                : 'pill--plain';
    return `<span class="pill small ${cls}">${escapeHtml(status)}</span>`;
}
function emptyState(title, body, action) {
    return `<div class="empty">
    <svg class="empty__ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8.5 12h7M12 8.5v7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    <b>${escapeHtml(title)}</b>${escapeHtml(body)}
    ${action ? `<br /><a class="linkbtn" href="${action.href}">${escapeHtml(action.label)}</a>` : ''}
  </div>`;
}
// ---- Catalogue (issues #16, #22, #37) ---------------------------------------
export const catalogue = (root, ctx) => {
    let medium = 'All';
    let sort = 'newest';
    let shownCount = 24;
    let loading = true;
    const SORTS = {
        newest: (a, b) => (b.listed_at ?? b.created_at) - (a.listed_at ?? a.created_at),
        price_asc: (a, b) => a.price_cents - b.price_cents,
        price_desc: (a, b) => b.price_cents - a.price_cents,
        title: (a, b) => a.title.localeCompare(b.title)
    };
    function listed() {
        return visibleArtworks(ctx.store.state).filter((a) => a.status === 'listed');
    }
    function render() {
        const all = listed();
        const mediums = ['All', ...new Set(all.map((a) => a.medium).filter(Boolean))];
        const filtered = (medium === 'All' ? all : all.filter((a) => a.medium === medium)).slice().sort(SORTS[sort]);
        const shown = filtered.slice(0, shownCount);
        root.innerHTML = `
      <div class="store-hero">
        <h1>From the Studio</h1>
        <p>Small works on paper, one of each. Listed as they are finished — enquiries go straight to the studio, no checkout here.</p>
      </div>
      <div class="store-tools">
        <span class="chip chip--meta">${filtered.length} work${filtered.length === 1 ? '' : 's'} · showing ${shown.length}</span>
        <div class="chiprow" role="group" aria-label="Filter by medium">
          ${mediums.map((m) => `<button class="chip" aria-pressed="${medium === m}" data-medium="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join('')}
        </div>
        <label class="sort-label" for="cat-sort">Sort</label>
        <select id="cat-sort" class="input input--sort" aria-label="Sort works">
          <option value="newest" ${sort === 'newest' ? 'selected' : ''}>Newest</option>
          <option value="price_asc" ${sort === 'price_asc' ? 'selected' : ''}>Price · low to high</option>
          <option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>Price · high to low</option>
          <option value="title" ${sort === 'title' ? 'selected' : ''}>Title A–Z</option>
        </select>
      </div>
      ${loading ? skeletonCards(8) : shown.length === 0
            ? emptyState('Nothing listed yet.', 'Works appear here as the studio finishes them. Check back soon.')
            : `<div class="art-grid" aria-label="Available works">
            ${shown.map((w) => `
              <a class="art-card card" href="#/artwork/${w.id}">
                ${artImage(w.image, w.title)}
                <div class="art-card__body">
                  <b>${escapeHtml(w.title)}</b>
                  <span class="art-card__meta">${escapeHtml(w.medium || 'Work on paper')}${dims(w.dimensions) ? ' · ' + dims(w.dimensions) : ''}</span>
                  <div class="art-card__row">
                    <span class="price">${price(w.price_cents, w.currency)}</span>
                    ${w.tags.length ? `<span class="art-card__tags">${escapeHtml(w.tags.slice(0, 3).join(' · '))}</span>` : ''}
                  </div>
                </div>
              </a>`).join('')}
          </div>
          ${filtered.length > shown.length ? `<div class="load-more"><button class="btn" id="load-more">Load more · ${filtered.length - shown.length} remaining</button></div>` : ''}`}
    `;
        root.querySelectorAll('[data-medium]').forEach((b) => b.addEventListener('click', () => { medium = b.dataset.medium; shownCount = 24; render(); }));
        root.querySelector('#cat-sort')?.addEventListener('change', (e) => {
            sort = e.target.value;
            render();
        });
        root.querySelector('#load-more')?.addEventListener('click', () => { shownCount += 24; render(); });
    }
    render();
    const t = setTimeout(() => { loading = false; render(); }, 400);
    return () => clearTimeout(t);
};
// ---- Artwork detail ----------------------------------------------------------
export const artworkDetail = (id) => (root, ctx) => {
    settleDue(ctx.store.state);
    const w = artworkById(ctx.store.state, id);
    // Private statuses are host-only; everyone else sees the empty state (#1).
    if (!w || (!PUBLIC_STATUSES.has(w.status) && !isAdmin(ctx))) {
        root.innerHTML = emptyState('Not here anymore.', 'That work is no longer listed.', { href: '#/', label: '← Back to the works' });
        return;
    }
    const au = auctionForArtwork(ctx.store.state, w.id);
    const note = w.status === 'listed' ? 'Available to buy'
        : w.status === 'auction' ? 'Bidding open'
            : w.status === 'sold' ? 'In a private collection' : 'Not on show';
    root.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Works</a><span aria-hidden="true">/</span><span>${escapeHtml(w.title)}</span></nav>
    <div class="detail">
      <figure class="detail__media card card--flush">${artImage(w.image, w.title, { lazy: false, sizes: '(max-width: 900px) 92vw, 640px' })}</figure>
      <div class="detail__info">
        <div class="phead phead--tight">
          <div class="phead__text">
            <span class="phead__eyebrow">${formatDate(w.listed_at ?? w.created_at)}</span>
            <h1>${escapeHtml(w.title)}</h1>
            <p>${escapeHtml(w.medium || 'Work on paper')}${dims(w.dimensions) ? ' · ' + dims(w.dimensions) : ''}</p>
          </div>
        </div>
        <div class="card">
          <div class="chead">
            <div class="chead__text"><h2>Price</h2><p>${note}</p></div>
            ${statusPill(w.status)}
          </div>
          <div class="detail__price">${price(w.price_cents, w.currency)}</div>
          ${w.status === 'auction' && au && au.status === 'active'
        ? `<a class="btn btn--primary btn--block" href="#/auction/${au.id}">Go to the auction →</a>`
        : `<a class="btn btn--primary btn--block" href="mailto:${CONTACT}?subject=${encodeURIComponent('Enquiry — ' + w.title)}">Enquire about “${escapeHtml(w.title)}”</a>`}
          <p class="note">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            <span>Questions go straight to the studio — <b>${CONTACT}</b>. No card details are ever taken here.</span>
          </p>
        </div>
        ${w.description ? `<div class="card"><div class="chead"><div class="chead__text"><h2>About this work</h2></div></div><p class="detail__desc">${escapeHtml(w.description)}</p></div>` : ''}
        <div class="card">
          <div class="chead"><div class="chead__text"><h2>Details</h2></div></div>
          <dl class="specs">
            <div><dt>Medium</dt><dd>${escapeHtml(w.medium || '—')}</dd></div>
            <div><dt>Dimensions</dt><dd>${dims(w.dimensions) || '—'}</dd></div>
            <div><dt>Listed</dt><dd>${formatDate(w.listed_at ?? w.created_at)}</dd></div>
            ${w.tags.length ? `<div><dt>Tags</dt><dd>${escapeHtml(w.tags.join(', '))}</dd></div>` : ''}
          </dl>
        </div>
      </div>
    </div>`;
};
// ---- Auctions list -----------------------------------------------------------
export const auctionsList = (root, ctx) => {
    let loading = true;
    function render() {
        settleDue(ctx.store.state);
        const active = ctx.store.state.auctions.filter((a) => a.status === 'active')
            .sort((a, b) => a.ends_at - b.ends_at);
        root.innerHTML = `
      <div class="phead">
        <div class="phead__text">
          <span class="phead__eyebrow">Auctions</span>
          <h1>Open auctions</h1>
          <p>Works under the hammer. Each auction closes automatically at its end time.</p>
        </div>
      </div>
      ${loading ? skeletonCards(4) : active.length === 0
            ? emptyState('No open auctions.', 'Check back when the studio lists one.', { href: '#/', label: 'Browse the works →' })
            : `<div class="art-grid" aria-label="Open auctions">
            ${active.map((a) => {
                const w = artworkById(ctx.store.state, a.artwork_id);
                if (!w)
                    return '';
                return `<a class="art-card card" href="#/auction/${a.id}">
                ${artImage(w.image, w.title)}
                <div class="art-card__body">
                  <b>${escapeHtml(w.title)}</b>
                  <span class="art-card__meta">Current bid ${price(a.current_bid_cents)} · ${a.bid_count} bid${a.bid_count === 1 ? '' : 's'}</span>
                  <div class="art-card__row">
                    <span class="pill pill--info small">Open</span>
                    <span class="small muted">ends ${relativeTime(a.ends_at)}</span>
                  </div>
                </div>
              </a>`;
            }).join('')}
          </div>`}`;
    }
    render();
    const t = setTimeout(() => { loading = false; render(); }, 350);
    return () => clearTimeout(t);
};
// ---- Auction detail (issues #8, #10, #20) -------------------------------------
export const auctionDetail = (id) => (root, ctx) => {
    let amount = '';
    let bidError = '';
    let busy = false;
    function get() {
        settleDue(ctx.store.state);
        return ctx.store.state.auctions.find((a) => a.id === id);
    }
    function render() {
        const au = get();
        if (!au) {
            root.innerHTML = emptyState('Not open anymore.', 'That auction is no longer available.', { href: '#/auctions', label: '← All auctions' });
            return;
        }
        const w = artworkById(ctx.store.state, au.artwork_id);
        if (!w) {
            root.innerHTML = emptyState('Not open anymore.', 'The work was removed.');
            return;
        }
        const me = user(ctx);
        const isOwner = me != null && (me.id === w.user_id || me.role === 'admin');
        const ended = au.status !== 'active';
        const min = minimumBid(au.current_bid_cents);
        const chips = quickBids(au.current_bid_cents);
        const bids = ctx.store.state.bids.filter((b) => b.auction_id === au.id)
            .sort((a, b) => b.amount_cents - a.amount_cents || a.created_at - b.created_at).slice(0, 20);
        const pillCls = au.status === 'active' ? 'pill--good' : au.status === 'pending' ? 'pill--info' : 'pill--bad';
        root.innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/auctions">Auctions</a><span aria-hidden="true">/</span><span>${escapeHtml(w.title)}</span></nav>
      <div class="detail">
        <figure class="detail__media card card--flush">${artImage(w.image, w.title, { lazy: false, sizes: '(max-width: 900px) 92vw, 640px' })}</figure>
        <div class="detail__info">
          <div class="phead phead--tight">
            <div class="phead__text">
              <span class="phead__eyebrow">Auction · ${escapeHtml(au.status)}</span>
              <h1>${escapeHtml(w.title)}</h1>
              <p>${au.bid_count} bid${au.bid_count === 1 ? '' : 's'} · ends ${formatDate(au.ends_at)}</p>
            </div>
          </div>
          <div class="card">
            <div class="chead">
              <div class="chead__text"><h2>Current bid</h2><p>Starts at ${price(au.start_price_cents)}</p></div>
              <span class="pill ${pillCls}" id="au-pill">${ended ? 'Ended' : `<span id="au-countdown">${countdown(au.ends_at)}</span>`}</span>
            </div>
            <div class="detail__price">${price(au.current_bid_cents)}</div>
            ${ended ? `
              <div class="ended-panel" role="status">
                <b>This auction has ended.</b>
                ${au.winner_id
            ? `<span>Won by ${escapeHtml(ctx.store.state.users.find((u) => u.id === au.winner_id)?.display_name ?? 'a bidder')} at ${price(au.current_bid_cents)}.</span>`
            : '<span>No bids were placed — the work is back in the catalogue.</span>'}
                <a class="linkbtn" href="#/artwork/${w.id}">View the work →</a>
              </div>`
            : isOwner ? `
              <div class="ended-panel" role="status">
                <b>This is your work.</b>
                <span>You cannot bid on your own auction. ${me?.role === 'admin' ? 'You can end it early from the ledger.' : ''}</span>
              </div>`
                : `
              <div class="field">
                <label for="bid">Your bid (₹)</label>
                <input id="bid" class="input" type="number" min="${Math.ceil(min / 100)}" step="1" value="${escapeHtml(amount)}" placeholder="${Math.ceil(min / 100)}" />
                <span class="hint">Minimum ${price(min)}</span>
              </div>
              <div class="chiprow" role="group" aria-label="Quick bid">
                ${chips.map((c) => `<button class="chip" data-quick="${c}">${price(c)}</button>`).join('')}
              </div>
              ${bidError ? `<p class="form-error" role="alert">${escapeHtml(bidError)}</p>` : ''}
              <button class="btn btn--primary btn--block bid-submit" id="bid-btn" ${busy ? 'disabled' : ''}>${busy ? 'Placing bid…' : 'Place bid'}</button>`}
          </div>
          <div class="card">
            <div class="chead"><div class="chead__text"><h2>Bid history</h2></div></div>
            ${bids.length ? `<div class="txlist">
              ${bids.map((b) => `
                <div class="txrow">
                  <span class="prodico prodico--sm" aria-hidden="true"><svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5 19.5c.6-3.2 3.4-5 7-5s6.4 1.8 7 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
                  <span class="cell__text"><b>${escapeHtml(ctx.store.state.users.find((u) => u.id === b.user_id)?.display_name ?? 'Bidder')}</b><small>${relativeTime(b.created_at)}</small></span>
                  <span class="amt">${price(b.amount_cents)}</span>
                </div>`).join('')}
            </div>` : '<p class="small muted">No bids yet — the first one sets the pace.</p>'}
          </div>
        </div>
      </div>`;
        root.querySelector('#bid')?.addEventListener('input', (e) => { amount = e.target.value; });
        root.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => { amount = String(Number(b.dataset.quick) / 100); render(); root.querySelector('#bid')?.focus(); }));
        root.querySelector('#bid-btn')?.addEventListener('click', async () => {
            const me2 = user(ctx);
            if (!me2) {
                ctx.navigate(`#/login?next=${encodeURIComponent('#/auction/' + id)}`);
                return;
            }
            const cents = Math.round(Number(amount) * 100);
            if (!Number.isFinite(cents) || cents <= 0) {
                bidError = 'Enter a bid amount.';
                render();
                return;
            }
            busy = true;
            bidError = '';
            render();
            await delay(300); // simulated network
            const res = placeBid(ctx.store.state, id, me2.id, cents);
            busy = false;
            if (!res.ok) {
                bidError = res.error ?? 'Could not place the bid.';
                ctx.store.save();
                render();
                return;
            }
            ctx.store.save();
            amount = '';
            toast('Bid placed — you are the highest bidder.');
            render();
        });
    }
    render();
    // Tick the countdown every second; re-render fully when the auction ends.
    const tick = setInterval(() => {
        const au = get();
        if (!au)
            return;
        const el = root.querySelector('#au-countdown');
        if (au.status !== 'active') {
            render();
            return;
        }
        if (el)
            el.textContent = countdown(au.ends_at);
    }, 1000);
    // Demo activity: a rival bidder occasionally raises the price, so the page
    // shows live updates without a manual refresh (issue #20).
    const rival = setInterval(() => {
        const au = get();
        const me = user(ctx);
        if (!au || au.status !== 'active')
            return;
        const rivals = ctx.store.state.users.filter((u) => u.role === 'user' && u.id !== au.current_bidder_id && u.id !== me?.id);
        const w = artworkById(ctx.store.state, au.artwork_id);
        const rival = rivals.find((r) => r.id !== w?.user_id);
        if (!rival || Math.random() > 0.45)
            return;
        const res = placeBid(ctx.store.state, au.id, rival.id, minimumBid(au.current_bid_cents));
        if (res.ok) {
            ctx.store.save();
            toast(`${rival.display_name} just bid ${price(au.current_bid_cents)}.`);
            render();
        }
    }, 25000);
    return () => { clearInterval(tick); clearInterval(rival); };
};
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
// ---- Login (mocked) -----------------------------------------------------------
export const loginPage = (next) => (root, ctx) => {
    let error = '';
    let busy = false;
    function render() {
        root.innerHTML = `
      <div class="store store--narrow">
        <div class="phead">
          <div class="phead__text">
            <span class="phead__eyebrow">Studio sign-in</span>
            <h1>Host account</h1>
            <p>Manage works, listings and orders here.</p>
          </div>
        </div>
        <div class="card">
          <form class="form" id="login-form">
            <div class="field">
              <label for="email">Email</label>
              <input id="email" class="input" type="email" autocomplete="email" required placeholder="host@fromthestudio.local" />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input id="password" class="input" type="password" autocomplete="current-password" required minlength="8" />
            </div>
            ${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ''}
            <button class="btn btn--primary btn--block" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
        </div>
        <div class="card demo-hint">
          <div class="chead"><div class="chead__text"><h2>Demo accounts</h2><p>This is a mocked demo — any of these sign in.</p></div></div>
          <dl class="specs">
            <div><dt>Host (admin)</dt><dd>host@fromthestudio.local</dd></div>
            <div><dt>Bidder</dt><dd>asha@example.com</dd></div>
            <div><dt>Password (all)</dt><dd>demo1234</dd></div>
          </dl>
          <button class="btn btn--sm demo-fill" id="fill-host">Fill host credentials</button>
        </div>
        <p class="small muted store__foot"><a class="linkbtn" href="#/">← Back to the works</a></p>
      </div>`;
        root.querySelector('#fill-host')?.addEventListener('click', () => {
            root.querySelector('#email').value = 'host@fromthestudio.local';
            root.querySelector('#password').value = 'demo1234';
        });
        root.querySelector('#login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = root.querySelector('#email').value;
            const password = root.querySelector('#password').value;
            busy = true;
            error = '';
            render();
            await delay(350);
            const u = ctx.store.signIn(email, password);
            busy = false;
            if (!u) {
                error = 'Invalid credentials. Use one of the demo accounts below.';
                render();
                return;
            }
            toast(`Signed in as ${u.display_name}.`);
            ctx.navigate(next || '#/admin');
        });
    }
    render();
};
// ---- Ledger (issues #18, #21, #22, #32) ----------------------------------------
export const ledger = (root, ctx) => {
    if (!requireHost(ctx, '#/admin'))
        return;
    let statusFilter = 'All';
    let query = '';
    let sort = 'newest';
    let loading = true;
    const SORTS = {
        newest: (a, b) => b.created_at - a.created_at,
        price_asc: (a, b) => a.price_cents - b.price_cents,
        price_desc: (a, b) => b.price_cents - a.price_cents,
        title: (a, b) => a.title.localeCompare(b.title)
    };
    function works() { return visibleArtworks(ctx.store.state); }
    async function setStatus(w, status) {
        // Consequential transitions need explicit confirmation (#21).
        if (status === 'sold' || status === 'archived' || status === 'auction') {
            const ok = await confirmDialog({
                title: `Move “${w.title}” to ${status}?`,
                body: status === 'sold' ? 'This records a sale and feeds the revenue reports.'
                    : status === 'archived' ? 'The work leaves the catalogue but is kept in the ledger.'
                        : 'Prefer starting an auction from the work’s edit page, where you set the times.',
                confirmLabel: `Move to ${status}`,
                danger: status === 'archived'
            });
            if (!ok)
                return;
        }
        const previous = w.status;
        w.status = status; // optimistic
        render();
        const res = updateArtwork(ctx.store.state, user(ctx).id, w.id, { status });
        if (!res.ok) {
            w.status = previous;
            toast(res.error ?? 'Could not change the status.');
        }
        else {
            ctx.store.save();
            toast(`“${w.title}” is now ${status}.`);
        }
        render();
    }
    async function remove(w) {
        const ok = await confirmDialog({
            title: `Delete “${w.title}”?`,
            body: 'The work leaves the ledger. You can undo this for a few seconds afterwards.',
            confirmLabel: 'Delete',
            danger: true
        });
        if (!ok)
            return;
        const res = deleteArtwork(ctx.store.state, user(ctx).id, w.id);
        if (!res.ok) {
            toast(res.error ?? 'Could not delete.');
            return;
        }
        ctx.store.save();
        render();
        toast(`“${w.title}” deleted.`, {
            label: 'Undo',
            run: () => { restoreArtwork(ctx.store.state, w.id); ctx.store.save(); toast(`“${w.title}” restored.`); render(); }
        });
    }
    function statusMenu(w) {
        const others = STATUSES.filter((s) => s !== w.status);
        return `<div class="status-menu">
      <button class="btn btn--sm status-menu__btn" aria-haspopup="menu" aria-expanded="false" data-menu="${w.id}">Move to…</button>
      <div class="status-menu__list card" role="menu" hidden>
        ${others.map((s) => `<button class="status-menu__item ${s === 'sold' || s === 'archived' ? 'is-consequential' : ''}" role="menuitem" data-set="${w.id}:${s}">${s}</button>`).join('')}
      </div>
    </div>`;
    }
    function render() {
        const all = works();
        const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((w) => w.status === s).length]));
        const filtered = all.filter((w) => (statusFilter === 'All' || w.status === statusFilter) &&
            (!query || w.title.toLowerCase().includes(query.toLowerCase()) || (w.medium || '').toLowerCase().includes(query.toLowerCase()))).slice().sort(SORTS[sort]);
        root.innerHTML = `
      <div class="phead">
        <div class="phead__text">
          <span class="phead__eyebrow">Studio ledger</span>
          <h1>The works</h1>
          <p>${all.length} work${all.length === 1 ? '' : 's'} across all statuses</p>
        </div>
        <div class="phead__actions">
          <a class="btn" href="#/insights">Insights</a>
          <a class="btn" href="#/orders">Orders</a>
          <a class="btn btn--primary" href="#/admin/new">Add a work</a>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi kpi--1"><small>Listed</small><div class="kpi__value">${counts.listed}</div><div class="kpi__foot">${price(all.filter((w) => w.status === 'listed').reduce((s, w) => s + w.price_cents, 0))} on show</div></div>
        <div class="kpi kpi--2"><small>Drafts</small><div class="kpi__value">${counts.draft}</div><div class="kpi__foot">not public yet</div></div>
        <div class="kpi kpi--3"><small>Sold</small><div class="kpi__value">${counts.sold}</div><div class="kpi__foot">${price(all.filter((w) => w.status === 'sold').reduce((s, w) => s + w.price_cents, 0))} taken</div></div>
        <div class="kpi kpi--4"><small>In auction</small><div class="kpi__value">${counts.auction}</div><div class="kpi__foot">${counts.archived} archived</div></div>
      </div>
      <div class="ledger-tools">
        <div class="seg" role="group" aria-label="Filter by status">
          <button aria-pressed="${statusFilter === 'All'}" data-filter="All">All · ${all.length}</button>
          ${STATUSES.map((s) => `<button aria-pressed="${statusFilter === s}" data-filter="${s}">${s} · ${counts[s]}</button>`).join('')}
        </div>
        <input class="input input--search" type="search" placeholder="Filter by title or medium" value="${escapeHtml(query)}" aria-label="Filter works" id="ledger-q" />
        <select class="input input--sort" id="ledger-sort" aria-label="Sort works">
          <option value="newest" ${sort === 'newest' ? 'selected' : ''}>Newest</option>
          <option value="price_asc" ${sort === 'price_asc' ? 'selected' : ''}>Price ↑</option>
          <option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>Price ↓</option>
          <option value="title" ${sort === 'title' ? 'selected' : ''}>Title</option>
        </select>
      </div>
      ${loading ? skeletonRows(6) : filtered.length === 0
            ? emptyState('No works match.', 'Add a work or clear the filters.', { href: '#/admin/new', label: 'Add the first one →' })
            : `<div class="table-wrap card card--flush">
            <table class="table">
              <thead><tr>
                <th class="col-img"><span class="visually-hidden">Image</span></th>
                <th>Work</th><th>Medium</th><th class="col-price">Price</th>
                <th class="col-date">Listed</th><th class="col-status">Status</th><th class="col-actions">Actions</th>
              </tr></thead>
              <tbody>
                ${filtered.map((w) => `
                  <tr>
                    <td class="col-img"><img src="assets/samples/${w.image}-480.webp" alt="" width="48" height="60" loading="lazy" /></td>
                    <td class="col-work">
                      <a class="col-work__link" href="#/admin/artwork/${w.id}"><b>${escapeHtml(w.title)}</b></a>
                      <span class="small muted">#${w.id.slice(0, 8)}</span>
                    </td>
                    <td><span class="small muted">${escapeHtml(w.medium || '—')}</span></td>
                    <td class="col-price">${price(w.price_cents, w.currency)}</td>
                    <td class="small muted col-date">${formatDate(w.listed_at ?? w.created_at)}</td>
                    <td class="col-status">${statusPill(w.status)}</td>
                    <td class="col-actions">
                      <div class="row-actions">
                        ${statusMenu(w)}
                        <a class="btn btn--sm" href="#/admin/artwork/${w.id}" aria-label="Edit ${escapeHtml(w.title)}">Edit</a>
                        <button class="btn btn--sm btn--danger-soft" data-del="${w.id}" aria-label="Delete ${escapeHtml(w.title)}">Delete</button>
                      </div>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}`;
        root.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { statusFilter = b.dataset.filter; render(); }));
        root.querySelector('#ledger-q')?.addEventListener('input', (e) => {
            query = e.target.value;
            render();
            const el = root.querySelector('#ledger-q');
            el?.focus();
            el?.setSelectionRange(query.length, query.length);
        });
        root.querySelector('#ledger-sort')?.addEventListener('change', (e) => { sort = e.target.value; render(); });
        root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { const w = works().find((x) => x.id === b.dataset.del); if (w)
            void remove(w); }));
        // Status menus: open one at a time, close on outside click / Esc.
        root.querySelectorAll('[data-menu]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const list = btn.nextElementSibling;
                const wasOpen = !list.hidden;
                closeMenus();
                if (!wasOpen) {
                    list.hidden = false;
                    btn.setAttribute('aria-expanded', 'true');
                }
            });
        });
        root.querySelectorAll('[data-set]').forEach((item) => {
            item.addEventListener('click', () => {
                const [wid, status] = item.dataset.set.split(':');
                const w = works().find((x) => x.id === wid);
                closeMenus();
                if (w)
                    void setStatus(w, status);
            });
        });
    }
    function closeMenus() {
        root.querySelectorAll('.status-menu__list').forEach((l) => { l.hidden = true; });
        root.querySelectorAll('[data-menu]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    }
    const onDocClick = () => closeMenus();
    const onEsc = (e) => { if (e.key === 'Escape')
        closeMenus(); };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEsc);
    render();
    const t = setTimeout(() => { loading = false; render(); }, 350);
    return () => { clearTimeout(t); document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onEsc); };
};
// ---- Shared artwork form (issue #36: one form, both routes) ---------------------
function artworkFormHtml(w) {
    const isEdit = w != null;
    const statusOptions = isEdit ? STATUSES : ['draft', 'listed'];
    const statusLabels = {
        draft: 'draft — only you see it', listed: 'listed — public catalogue',
        auction: 'auction — bidding open', sold: 'sold — private collection', archived: 'archived — kept, not shown'
    };
    return `
    <form class="form" id="art-form">
      <div class="field">
        <label for="f-title">Title</label>
        <input id="f-title" class="input" required maxlength="200" value="${escapeHtml(w?.title ?? '')}" placeholder="e.g. Monsoon rice field" />
      </div>
      <div class="formgrid">
        <div class="field">
          <label for="f-medium">Medium</label>
          <select id="f-medium" class="input">${MEDIUMS.map((m) => `<option value="${m}" ${w?.medium === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="f-price">Price (₹)</label>
          <input id="f-price" class="input" type="number" min="1" step="0.01" required value="${w ? w.price_cents / 100 : ''}" placeholder="2500" />
        </div>
      </div>
      <div class="formgrid formgrid--3">
        <div class="field"><label for="f-width">Width</label><input id="f-width" class="input" type="number" step="0.1" value="${w?.dimensions?.width ?? ''}" placeholder="21" /></div>
        <div class="field"><label for="f-height">Height</label><input id="f-height" class="input" type="number" step="0.1" value="${w?.dimensions?.height ?? ''}" placeholder="29.7" /></div>
        <div class="field"><label for="f-unit">Unit</label><select id="f-unit" class="input"><option value="cm" ${w?.dimensions?.unit !== 'in' ? 'selected' : ''}>cm</option><option value="in" ${w?.dimensions?.unit === 'in' ? 'selected' : ''}>in</option></select></div>
      </div>
      <div class="field">
        <label for="f-tags">Tags</label>
        <input id="f-tags" class="input" value="${escapeHtml((w?.tags ?? []).join(', '))}" placeholder="landscape, monsoon" />
        <span class="hint">Comma separated, shown as plain words — never badges.</span>
      </div>
      <div class="field">
        <label for="f-desc">Description</label>
        <textarea id="f-desc" class="input" maxlength="5000">${escapeHtml(w?.description ?? '')}</textarea>
      </div>
      <div class="field">
        <label for="f-status">Status</label>
        <select id="f-status" class="input">
          ${statusOptions.map((s) => `<option value="${s}" ${(w?.status ?? 'draft') === s ? 'selected' : ''}>${statusLabels[s]}</option>`).join('')}
        </select>
        ${!isEdit ? '<span class="hint">Auctions and sales have their own flows — start them from the work’s page.</span>' : ''}
      </div>
      <p class="form-error" role="alert" id="f-error" hidden></p>
      <div class="form__actions">
        <button class="btn btn--primary" type="submit" id="f-save">${isEdit ? 'Save changes' : 'Save the work'}</button>
        <a class="linkbtn" href="#/admin">Cancel</a>
      </div>
    </form>`;
}
function readForm(root) {
    const val = (id) => root.querySelector(id).value;
    const w = Number(val('#f-width')), h = Number(val('#f-height'));
    return {
        title: val('#f-title'), description: val('#f-desc'),
        price_cents: Math.round(Number(val('#f-price')) * 100),
        medium: val('#f-medium'),
        tags: val('#f-tags').split(',').map((t) => t.trim()).filter(Boolean),
        dimensions: w > 0 && h > 0 ? { width: w, height: h, unit: val('#f-unit') } : null,
        status: val('#f-status')
    };
}
export const newArtwork = (root, ctx) => {
    if (!requireHost(ctx, '#/admin/new'))
        return;
    root.innerHTML = `
    <div class="phead"><div class="phead__text">
      <span class="phead__eyebrow">Add a work</span><h1>New work</h1>
      <p>It starts as a draft. List it when you are ready to sell it.</p>
    </div></div>
    ${artworkFormHtml(null)}`;
    root.querySelector('#art-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = readForm(root);
        const res = createArtwork(ctx.store.state, user(ctx).id, { ...input, status: input.status === 'listed' ? 'listed' : 'draft' });
        const errEl = root.querySelector('#f-error');
        if (!res.ok) {
            errEl.textContent = res.error ?? 'Could not save.';
            errEl.hidden = false;
            return;
        }
        ctx.store.save();
        toast(`“${res.artwork.title}” saved.`);
        ctx.navigate(`#/admin/artwork/${res.artwork.id}`);
    });
};
// ---- Edit artwork + auction panel (issues #9, #16) ------------------------------
export const editArtwork = (id) => (root, ctx) => {
    if (!requireHost(ctx, `#/admin/artwork/${id}`))
        return;
    const w = artworkById(ctx.store.state, id);
    if (!w) {
        root.innerHTML = `<div class="phead"><div class="phead__text"><span class="phead__eyebrow">Edit</span><h1>No such work</h1></div></div>` +
            emptyState('It may have been deleted.', '', { href: '#/admin', label: 'Back to the ledger →' });
        return;
    }
    function auctionPanel() {
        const au = auctionForArtwork(ctx.store.state, w.id);
        if (au) {
            const ended = au.status === 'ended' || au.status === 'cancelled';
            return `<div class="card">
        <div class="chead"><div class="chead__text"><h2>Auction</h2><p>${au.bid_count} bid${au.bid_count === 1 ? '' : 's'} · current ${price(au.current_bid_cents)}</p></div>${statusPill(au.status)}</div>
        <dl class="specs">
          <div><dt>Starts</dt><dd>${formatDate(au.starts_at)}</dd></div>
          <div><dt>Ends</dt><dd>${formatDate(au.ends_at)} (${relativeTime(au.ends_at)})</dd></div>
          ${au.winner_id ? `<div><dt>Winner</dt><dd>${escapeHtml(ctx.store.state.users.find((u) => u.id === au.winner_id)?.display_name ?? '')}</dd></div>` : ''}
        </dl>
        <div class="form__actions">
          <a class="btn btn--sm" href="#/auction/${au.id}">View auction</a>
          ${!ended ? `<button class="btn btn--sm btn--danger-soft" id="end-auction">End now</button>` : ''}
        </div>
      </div>`;
        }
        if (w.status !== 'draft' && w.status !== 'listed')
            return '';
        const now = new Date();
        const later = new Date(now.getTime() + 3 * 86400000);
        const toLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        return `<div class="card">
      <div class="chead"><div class="chead__text"><h2>Start an auction</h2><p>Set a starting price and the window. Bidding opens at the start time.</p></div></div>
      <form class="form" id="auction-form">
        <div class="field"><label for="au-price">Starting price (₹)</label><input id="au-price" class="input" type="number" min="1" step="0.01" value="${w.price_cents / 100}" required /></div>
        <div class="formgrid">
          <div class="field"><label for="au-start">Starts</label><input id="au-start" class="input" type="datetime-local" value="${toLocal(now)}" required /></div>
          <div class="field"><label for="au-end">Ends</label><input id="au-end" class="input" type="datetime-local" value="${toLocal(later)}" required /></div>
        </div>
        <p class="form-error" role="alert" id="au-error" hidden></p>
        <button class="btn btn--primary btn--sm" type="submit">Start the auction</button>
      </form>
    </div>`;
    }
    function render() {
        root.innerHTML = `
      <div class="phead">
        <div class="phead__text">
          <span class="phead__eyebrow">Edit work · ${escapeHtml(w.status)}</span>
          <h1>${escapeHtml(w.title)}</h1>
          <p>${price(w.price_cents, w.currency)} · listed ${formatDate(w.listed_at ?? w.created_at)}</p>
        </div>
        <div class="phead__actions">
          <a class="btn" href="#/artwork/${w.id}">View public page</a>
          <button class="btn btn--danger-soft" id="del-work">Delete</button>
        </div>
      </div>
      <div class="edit">
        <div class="edit__media">
          <div class="card card--flush">${artImage(w.image, w.title, { lazy: false })}</div>
          <div class="card">
            <div class="chead"><div class="chead__text"><h2>Photograph</h2><p>Demo: uploads are mocked — the sample photo stays.</p></div></div>
            <button class="btn btn--sm" id="mock-upload">Replace the photograph</button>
          </div>
          ${auctionPanel()}
        </div>
        ${artworkFormHtml(w ?? null)}
      </div>`;
        root.querySelector('#art-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = readForm(root);
            // Consequential status changes from the form get a confirmation too.
            if (input.status !== w.status && (input.status === 'sold' || input.status === 'archived' || input.status === 'auction')) {
                const ok = await confirmDialog({
                    title: `Move “${w.title}” to ${input.status}?`,
                    body: input.status === 'sold' ? 'This records a sale and feeds the revenue reports.' : 'This changes where the work appears.',
                    confirmLabel: `Move to ${input.status}`
                });
                if (!ok)
                    return;
            }
            const res = updateArtwork(ctx.store.state, user(ctx).id, w.id, input);
            const errEl = root.querySelector('#f-error');
            if (!res.ok) {
                errEl.textContent = res.error ?? 'Could not save.';
                errEl.hidden = false;
                return;
            }
            ctx.store.save();
            toast('Saved.');
            render();
        });
        root.querySelector('#del-work')?.addEventListener('click', async () => {
            const ok = await confirmDialog({
                title: `Delete “${w.title}”?`,
                body: 'The work leaves the ledger. You can undo this for a few seconds afterwards.',
                confirmLabel: 'Delete', danger: true
            });
            if (!ok)
                return;
            deleteArtwork(ctx.store.state, user(ctx).id, w.id);
            ctx.store.save();
            toast(`“${w.title}” deleted.`, {
                label: 'Undo',
                run: () => { restoreArtwork(ctx.store.state, w.id); ctx.store.save(); toast('Restored.'); }
            });
            ctx.navigate('#/admin');
        });
        root.querySelector('#mock-upload')?.addEventListener('click', () => {
            toast('Demo mode: photograph uploads are mocked.');
        });
        root.querySelector('#end-auction')?.addEventListener('click', async () => {
            const au = auctionForArtwork(ctx.store.state, w.id);
            const ok = await confirmDialog({
                title: 'End this auction now?',
                body: au.current_bidder_id
                    ? `The highest bid (${price(au.current_bid_cents)}) wins and an order is created.`
                    : 'There are no bids — the work returns to the catalogue.',
                confirmLabel: 'End auction', danger: true
            });
            if (!ok)
                return;
            const res = endAuction(ctx.store.state, user(ctx).id, au.id);
            if (!res.ok) {
                toast(res.error ?? 'Could not end the auction.');
                return;
            }
            ctx.store.save();
            toast(au.winner_id ? 'Auction ended — the work is sold and an order was created.' : 'Auction ended — the work is back in the catalogue.');
            render();
        });
        root.querySelector('#auction-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const priceInr = Number(root.querySelector('#au-price').value);
            const starts = Math.floor(new Date(root.querySelector('#au-start').value).getTime() / 1000);
            const ends = Math.floor(new Date(root.querySelector('#au-end').value).getTime() / 1000);
            const res = createAuction(ctx.store.state, user(ctx).id, w.id, Math.round(priceInr * 100), starts, ends);
            const errEl = root.querySelector('#au-error');
            if (!res.ok) {
                errEl.textContent = res.error ?? 'Could not start the auction.';
                errEl.hidden = false;
                return;
            }
            ctx.store.save();
            toast('Auction started.');
            render();
        });
    }
    render();
};
// ---- Insights (issue #29: recent orders rendered) --------------------------------
export const insights = (root, ctx) => {
    if (!requireHost(ctx, '#/insights'))
        return;
    settleDue(ctx.store.state);
    const s = ctx.store.state;
    const arts = visibleArtworks(s);
    const counts = Object.fromEntries(STATUSES.map((st) => [st, arts.filter((a) => a.status === st).length]));
    const soldValue = arts.filter((a) => a.status === 'sold').reduce((t, a) => t + a.price_cents, 0);
    const liveOrders = s.orders.filter((o) => o.status !== 'cancelled' && o.status !== 'refunded');
    const orderValue = liveOrders.reduce((t, o) => t + o.amount_cents, 0);
    const now = nowSeconds();
    // Monthly revenue from sold_at (manual sales included — #28).
    const monthly = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const inMonth = arts.filter((a) => a.status === 'sold' && a.sold_at && formatDateShort(a.sold_at) && new Date(a.sold_at * 1000).toISOString().slice(0, 7) === key);
        monthly.push({ month: key, works: inMonth.length, revenue_cents: inMonth.reduce((t, a) => t + a.price_cents, 0) });
    }
    const byMedium = Object.entries(arts.filter((a) => a.status === 'sold').reduce((acc, a) => {
        const m = a.medium || 'Other';
        acc[m] = acc[m] ?? { works: 0, value: 0 };
        acc[m].works++;
        acc[m].value += a.price_cents;
        return acc;
    }, {})).map(([medium, v]) => ({ medium, ...v })).sort((a, b) => b.value - a.value).slice(0, 6);
    const recentOrders = s.orders.slice().sort((a, b) => b.created_at - a.created_at).slice(0, 6);
    const recentSales = arts.filter((a) => a.status === 'sold').sort((a, b) => (b.sold_at ?? 0) - (a.sold_at ?? 0)).slice(0, 6);
    const activeAuctions = s.auctions.filter((a) => a.status === 'active').sort((a, b) => a.ends_at - b.ends_at).slice(0, 3);
    const stale = arts.filter((a) => a.status === 'listed' && (a.listed_at ?? a.created_at) < now - 45 * 86400).length;
    let range = 'Year';
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const palette = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'];
    function render() {
        const window_ = range === 'Year' ? monthly : range === '6 months' ? monthly.slice(-6) : monthly.slice(-3);
        const maxRev = Math.max(...window_.map((m) => m.revenue_cents), 1);
        const total = window_.reduce((t, m) => t + m.revenue_cents, 0);
        const soldUnits = window_.reduce((t, m) => t + m.works, 0);
        root.innerHTML = `
      <div class="phead"><div class="phead__text">
        <span class="phead__eyebrow">${todayLabel()}</span>
        <h1>How the studio is doing</h1>
        <p>Sales by month, by medium, and what is still unsold.</p>
      </div></div>
      <div class="kpis">
        <div class="kpi kpi--1"><small>Works sold</small><div class="kpi__value">${counts.sold}</div><div class="kpi__foot">${counts.listed} listed now</div></div>
        <div class="kpi kpi--2"><small>Revenue · works</small><div class="kpi__value">${price(soldValue)}</div><div class="kpi__foot">at sale price</div></div>
        <div class="kpi kpi--3"><small>Revenue · orders</small><div class="kpi__value">${price(orderValue)}</div><div class="kpi__foot">${liveOrders.length} orders taken</div></div>
        <div class="kpi kpi--4"><small>Unsold stock</small><div class="kpi__value">${counts.listed + counts.draft}</div><div class="kpi__foot">${stale} listed 45+ days</div></div>
      </div>
      <div class="card">
        <div class="chead">
          <div class="chead__text"><h2>Sales by month</h2><p>${soldUnits} work${soldUnits === 1 ? '' : 's'} · ${price(total)} in this view</p></div>
          <div class="seg" role="group" aria-label="Range">
            ${['Quarter', '6 months', 'Year'].map((r) => `<button aria-pressed="${range === r}" data-range="${r}">${r}</button>`).join('')}
          </div>
        </div>
        <div class="tubes">
          <div class="tubes__plot">
            <div class="tubes__grid" aria-hidden="true">
              ${[1, 0.75, 0.5, 0.25].map((f) => `<div><span>${price(maxRev * f)}</span></div>`).join('')}
              <div><span>₹0</span></div>
            </div>
            <div class="tubes__cols" role="img" aria-label="Works sold per month, ${price(total)} total">
              ${window_.map((m, i) => {
            const label = monthLabels[Number(m.month.slice(5)) - 1];
            const scale = m.revenue_cents === 0 ? 0 : Math.max(m.revenue_cents / maxRev, 0.02);
            return `<div class="tube ${i === window_.length - 1 ? 'is-hi' : ''}">
                  <div class="tube__pair"><span class="tube__sleeve"><i class="tube__fill tube__fill--in" style="transform:scale(1,${scale})"></i></span></div>
                  <span class="tube__label">${label}</span>
                  ${i === window_.length - 1 && m.revenue_cents > 0 ? `<div class="tube__flag" style="bottom: calc(${Math.max((m.revenue_cents / maxRev) * 100, 4)}% + 26px);"><b>${price(m.revenue_cents)}</b><small>${m.works} work${m.works === 1 ? '' : 's'}</small></div>` : ''}
                </div>`;
        }).join('')}
            </div>
          </div>
          ${total === 0 ? '<div class="chart-empty"><b>Nothing sold yet</b><span>Revenue appears here as works are marked sold.</span></div>' : ''}
        </div>
      </div>
      <div class="grid grid--2">
        <div class="card">
          <div class="chead"><div class="chead__text"><h2>By medium</h2><p>Share of works sold</p></div></div>
          ${byMedium.length ? `<div class="cats">${byMedium.map((m, i) => `
            <div class="cat">
              <span class="prodico prodico--sm" style="--cc:var(${palette[i % 6]})" aria-hidden="true"><svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>
              <span class="cat__name">${escapeHtml(m.medium)}</span>
              <span class="cat__pct">${counts.sold ? Math.round((m.works / counts.sold) * 100) : 0}%</span>
              <b>${price(m.value)}</b>
            </div>`).join('')}</div>` : '<p class="small muted">Nothing sold yet.</p>'}
        </div>
        <div class="card">
          <div class="chead"><div class="chead__text"><h2>Recent sales</h2></div></div>
          ${recentSales.length ? `<div class="txlist">${recentSales.map((a, i) => `
            <div class="txrow">
              <span class="prodico prodico--sm" style="--cc:var(${palette[i % 6]})" aria-hidden="true"><svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>
              <span class="cell__text"><b>${escapeHtml(a.title)}</b><small>${escapeHtml(a.medium || 'Work on paper')} · sold ${formatDateShort(a.sold_at)}</small></span>
              <span class="amt">${price(a.price_cents, a.currency)}</span>
            </div>`).join('')}</div>` : '<p class="small muted">No sales recorded yet.</p>'}
        </div>
      </div>
      <div class="card">
        <div class="chead">
          <div class="chead__text"><h2>Recent orders</h2><p>What the auctions produced</p></div>
          <a class="linkbtn" href="#/orders">All orders →</a>
        </div>
        ${recentOrders.length ? `<div class="txlist">${recentOrders.map((o) => {
            const art = s.artworks.find((a) => a.id === o.artwork_id);
            const buyer = s.users.find((u) => u.id === o.buyer_id);
            return `<div class="txrow">
            <span class="cell__text"><b>${escapeHtml(art?.title ?? 'Work')}</b><small>${escapeHtml(buyer?.display_name ?? 'Buyer')} · ${formatDateShort(o.created_at)}</small></span>
            ${statusPill(o.status)}
            <span class="amt">${price(o.amount_cents, o.currency)}</span>
          </div>`;
        }).join('')}</div>` : '<p class="small muted">No orders yet — they appear when an auction ends with a winner.</p>'}
      </div>
      ${activeAuctions.length ? `<div class="card">
        <div class="chead"><div class="chead__text"><h2>Live auctions</h2><p>${activeAuctions.length} open</p></div><a class="linkbtn" href="#/auctions">All auctions</a></div>
        <div class="txlist">${activeAuctions.map((a) => {
            const art = artworkById(s, a.artwork_id);
            return `<a class="txrow" href="#/auction/${a.id}">
            <span class="cell__text"><b>${escapeHtml(art?.title ?? '')}</b><small>Current bid ${price(a.current_bid_cents)} · ${a.bid_count} bid${a.bid_count === 1 ? '' : 's'}</small></span>
            <span class="amt pill pill--info small">ends ${formatDateShort(a.ends_at)}</span>
          </a>`;
        }).join('')}</div>
      </div>` : ''}`;
        root.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => { range = b.dataset.range; render(); }));
    }
    render();
};
// ---- Orders (issue #29) -----------------------------------------------------------
export const ordersPage = (root, ctx) => {
    if (!requireHost(ctx, '#/orders'))
        return;
    if (!isAdmin(ctx)) {
        root.innerHTML = emptyState('Hosts only.', 'Orders are visible to the studio host.', { href: '#/', label: '← Back to the works' });
        return;
    }
    async function advance(o) {
        const next = ORDER_STATUSES.filter((s) => s !== o.status);
        // A small dialog with the status list + optional payment reference.
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML = `
      <div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="ord-title">
        <h2 id="ord-title">Update order</h2>
        <p class="dialog__body">${escapeHtml(ctx.store.state.artworks.find((a) => a.id === o.artwork_id)?.title ?? '')} · ${price(o.amount_cents)}</p>
        <div class="field"><label for="ord-status">Status</label>
          <select id="ord-status" class="input">${next.map((s) => `<option value="${s}" ${s === nextStatus(o.status) ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        <div class="formgrid">
          <div class="field"><label for="ord-provider">Payment provider</label><input id="ord-provider" class="input" value="${escapeHtml(o.payment_provider ?? '')}" placeholder="razorpay / manual" /></div>
          <div class="field"><label for="ord-ref">Payment reference</label><input id="ord-ref" class="input" value="${escapeHtml(o.payment_id ?? '')}" placeholder="pay_…" /></div>
        </div>
        <div class="dialog__actions">
          <button class="btn" data-ord="cancel">Cancel</button>
          <button class="btn btn--primary" data-ord="ok">Save</button>
        </div>
      </div>`;
        document.body.appendChild(overlay);
        const prev = document.activeElement;
        const close = () => { overlay.remove(); prev?.focus?.(); };
        overlay.addEventListener('click', (e) => { if (e.target === overlay)
            close(); });
        overlay.querySelector('[data-ord="cancel"]')?.addEventListener('click', close);
        overlay.querySelector('[data-ord="ok"]')?.addEventListener('click', () => {
            const status = overlay.querySelector('#ord-status').value;
            const provider = overlay.querySelector('#ord-provider').value.trim();
            const ref = overlay.querySelector('#ord-ref').value.trim();
            const res = advanceOrder(ctx.store.state, user(ctx).id, o.id, status, { provider: provider || undefined, id: ref || undefined });
            close();
            if (!res.ok) {
                toast(res.error ?? 'Could not update the order.');
                return;
            }
            ctx.store.save();
            toast(`Order is now ${status}.`);
            render();
        });
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', esc);
            }
        });
        overlay.querySelector('#ord-status').focus();
    }
    function nextStatus(s) {
        const flow = ['pending', 'paid', 'shipped', 'delivered'];
        const i = flow.indexOf(s);
        return i >= 0 && i < flow.length - 1 ? flow[i + 1] : s;
    }
    function render() {
        const orders = ctx.store.state.orders.slice().sort((a, b) => b.created_at - a.created_at);
        root.innerHTML = `
      <div class="phead"><div class="phead__text">
        <span class="phead__eyebrow">Studio ledger</span>
        <h1>Orders</h1>
        <p>${orders.length} order${orders.length === 1 ? '' : 's'} · record-keeping only, payments happen outside the app</p>
      </div><div class="phead__actions"><a class="btn" href="#/admin">← Ledger</a></div></div>
      ${orders.length === 0
            ? emptyState('No orders yet.', 'Orders appear when an auction ends with a winner.')
            : `<div class="table-wrap card card--flush"><table class="table">
            <thead><tr><th>Work</th><th>Buyer</th><th>Amount</th><th>Status</th><th>Payment</th><th class="col-date">Date</th><th class="col-actions">Actions</th></tr></thead>
            <tbody>${orders.map((o) => {
                const art = ctx.store.state.artworks.find((a) => a.id === o.artwork_id);
                const buyer = ctx.store.state.users.find((u) => u.id === o.buyer_id);
                return `<tr>
                <td><b>${escapeHtml(art?.title ?? 'Work')}</b></td>
                <td><span class="small">${escapeHtml(buyer?.display_name ?? '')}</span><br /><span class="small muted">${escapeHtml(buyer?.email ?? '')}</span></td>
                <td class="col-price">${price(o.amount_cents, o.currency)}</td>
                <td>${statusPill(o.status)}</td>
                <td class="small muted">${escapeHtml(o.payment_provider ?? '—')}${o.payment_id ? `<br />${escapeHtml(o.payment_id)}` : ''}</td>
                <td class="small muted col-date">${formatDateShort(o.created_at)}</td>
                <td class="col-actions"><button class="btn btn--sm" data-advance="${o.id}">Update…</button></td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>`}`;
        root.querySelectorAll('[data-advance]').forEach((b) => b.addEventListener('click', () => {
            const o = ctx.store.state.orders.find((x) => x.id === b.dataset.advance);
            if (o)
                void advance(o);
        }));
    }
    render();
};
// ---- Settings (issues #17, #35) ------------------------------------------------------
export const settings = (root, ctx) => {
    // Session read once on mount — never from a reactive loop (#17).
    const me = user(ctx);
    let pwError = '';
    let pwBusy = false;
    function render() {
        const theme = document.documentElement.dataset.theme ?? 'dark';
        const frost = Number(getComputedStyle(document.documentElement).getPropertyValue('--frost')) || 0.5;
        const rail = document.documentElement.dataset.rail === 'true';
        root.innerHTML = `
      <div class="phead"><div class="phead__text">
        <span class="phead__eyebrow">Settings</span><h1>Studio settings</h1>
        <p>Look and feel of this shell. Stays on this device.</p>
      </div></div>
      <div class="card">
        <div class="chead"><div class="chead__text"><h2>Appearance</h2><p>Smoked glass + mint glow, either way.</p></div></div>
        <div class="setrow">
          <div class="setrow__text"><b>Theme</b><small>Dark is the studio default; light is the daylight read.</small></div>
          <div class="seg" role="group" aria-label="Theme">
            <button aria-pressed="${theme === 'light'}" data-theme="light">Light</button>
            <button aria-pressed="${theme === 'dark'}" data-theme="dark">Dark</button>
          </div>
        </div>
        <div class="setrow">
          <div class="setrow__text"><b>Frost · ${Math.round(frost * 100)}%</b><small>Heavier frost = thicker smoked glass over the backdrop.</small></div>
          <input class="range" type="range" min="0" max="1" step="0.05" value="${frost}" id="frost" aria-label="Frost intensity" />
        </div>
        <div class="setrow">
          <div class="setrow__text"><b>Sidebar rail</b><small>Collapse the sidebar to icons only.</small></div>
          <button class="switch" role="switch" aria-checked="${rail}" aria-label="Collapse sidebar rail" id="rail"><span class="switch__knob"></span></button>
        </div>
      </div>
      <div class="card">
        <div class="chead"><div class="chead__text"><h2>Account</h2></div></div>
        ${me ? `
          <div class="setrow setrow--stack">
            <div class="setrow__text"><b>${escapeHtml(me.display_name || me.email)}</b><small>${escapeHtml(me.email)} · ${me.role}</small></div>
            <button class="btn btn--soft" id="signout">Sign out</button>
          </div>
          <form class="form" id="pw-form">
            <div class="chead"><div class="chead__text"><h2>Change password</h2><p>Signing in again is required afterwards.</p></div></div>
            <div class="formgrid">
              <div class="field"><label for="pw-current">Current password</label><input id="pw-current" class="input" type="password" autocomplete="current-password" required /></div>
              <div class="field"><label for="pw-new">New password (min 8)</label><input id="pw-new" class="input" type="password" autocomplete="new-password" minlength="8" required /></div>
            </div>
            ${pwError ? `<p class="form-error" role="alert">${escapeHtml(pwError)}</p>` : ''}
            <button class="btn btn--sm" type="submit" ${pwBusy ? 'disabled' : ''}>${pwBusy ? 'Changing…' : 'Change password'}</button>
          </form>`
            : `<div class="setrow setrow--stack">
            <div class="setrow__text"><b>Not signed in</b><small>Host features are available after sign-in.</small></div>
            <a class="btn btn--primary" href="#/login?next=${encodeURIComponent('#/settings')}">Sign in</a>
          </div>`}
      </div>
      <div class="card">
        <div class="chead"><div class="chead__text"><h2>Demo data</h2><p>Everything you change here is stored in this browser only.</p></div></div>
        <div class="setrow">
          <div class="setrow__text"><b>Reset the demo</b><small>Restore the original sample works, auctions and orders.</small></div>
          <button class="btn btn--danger-soft" id="reset-demo">Reset demo data</button>
        </div>
      </div>
      <div class="card">
        <div class="chead"><div class="chead__text"><h2>Studio</h2></div></div>
        <dl class="specs">
          <div><dt>Contact</dt><dd>${CONTACT}</dd></div>
          <div><dt>Checkout</dt><dd>Enquiry by email — no payments taken here</dd></div>
        </dl>
      </div>`;
        root.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => {
            document.documentElement.dataset.theme = b.dataset.theme;
            try {
                localStorage.setItem('ap_theme', b.dataset.theme);
            }
            catch { /* ignore */ }
            const meta = document.querySelector('meta[name="theme-color"]');
            meta?.setAttribute('content', b.dataset.theme === 'dark' ? '#0c1210' : '#dfe6e1');
            render();
        }));
        root.querySelector('#frost')?.addEventListener('input', (e) => {
            const v = Number(e.target.value);
            document.documentElement.style.setProperty('--frost', String(v));
            try {
                localStorage.setItem('ap_frost', String(v));
            }
            catch { /* ignore */ }
            const label = root.querySelector('.setrow__text b');
            if (label && label.textContent?.startsWith('Frost'))
                label.textContent = `Frost · ${Math.round(v * 100)}%`;
        });
        root.querySelector('#rail')?.addEventListener('click', () => {
            const next = document.documentElement.dataset.rail !== 'true';
            document.documentElement.dataset.rail = next ? 'true' : 'false';
            try {
                localStorage.setItem('ap_rail', next ? '1' : '0');
            }
            catch { /* ignore */ }
            render();
        });
        root.querySelector('#signout')?.addEventListener('click', () => {
            ctx.store.signOut();
            toast('Signed out.');
            ctx.navigate('#/');
        });
        root.querySelector('#reset-demo')?.addEventListener('click', async () => {
            const ok = await confirmDialog({
                title: 'Reset the demo?',
                body: 'All works, bids and orders return to the original sample data.',
                confirmLabel: 'Reset', danger: true
            });
            if (!ok)
                return;
            ctx.store.reset();
            location.reload();
        });
        root.querySelector('#pw-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const current = root.querySelector('#pw-current').value;
            const next = root.querySelector('#pw-new').value;
            pwBusy = true;
            pwError = '';
            render();
            await delay(300);
            const res = changePassword(ctx.store.state, me.id, current, next);
            pwBusy = false;
            if (!res.ok) {
                pwError = res.error ?? 'Could not change the password.';
                render();
                return;
            }
            ctx.store.save();
            ctx.store.signOut();
            toast('Password changed — sign in again with the new one.');
            ctx.navigate('#/login');
        });
    }
    render();
};
// ---- Help ---------------------------------------------------------------------------
export const help = (root) => {
    const faqs = [
        { q: 'How do I add a work?', tag: 'Sign in → Ledger → Add a work', a: 'It starts as a draft. List it when you are ready to sell, or start an auction from its edit page.' },
        { q: 'How do I buy?', tag: 'Enquire directly', a: 'Open a work and tap “Enquire” — your mail opens to the studio. No card details are ever taken here.' },
        { q: 'What are auctions?', tag: 'Host-run bidding', a: 'The host sets a start price and a window. Bids must beat the current bid by at least 5% (or ₹1). The auction closes automatically at its end time; the highest bidder wins and an order is recorded.' },
        { q: 'Is this the real app?', tag: 'Demo', a: 'This is a UI demo with mocked data stored in your browser. Sign in with the demo accounts on the login page; reset everything from Settings.' },
        { q: 'Are the sample works real?', tag: 'Placeholders', a: 'The demo photographs are openly licensed (CC BY / CC BY-SA) images from Wikimedia Commons, credited in each work’s description.' }
    ];
    root.innerHTML = `
    <div class="phead"><div class="phead__text">
      <span class="phead__eyebrow">Help</span><h1>Questions?</h1>
      <p>How the studio's catalogue and auctions work.</p>
    </div></div>
    <div class="card"><div class="ruled">
      ${faqs.map((f) => `<div class="faq"><div class="faq__q"><span>${escapeHtml(f.q)}</span><span class="small muted">${escapeHtml(f.tag)}</span></div><p class="faq__a">${escapeHtml(f.a)}</p></div>`).join('')}
    </div></div>
    <p class="note">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <span>Stuck? Write to <a class="linkbtn" href="mailto:${CONTACT}">${CONTACT}</a>.</span>
    </p>`;
};
// ---- In-app 404 + error boundary (issue #33) -------------------------------------------
export const notFound = (root) => {
    root.innerHTML = `
    <div class="phead"><div class="phead__text">
      <span class="phead__eyebrow">404</span><h1>Not here anymore.</h1>
      <p>That page does not exist in the studio.</p>
    </div></div>
    ${emptyState('Nothing at this address.', 'It may have been moved or removed.', { href: '#/', label: '← Back to the works' })}`;
};
export function renderError(root, message) {
    // Generic text only — no stack traces in front of the host (#33).
    root.innerHTML = `
    <div class="phead"><div class="phead__text">
      <span class="phead__eyebrow">Something broke</span><h1>The studio hit a snag.</h1>
      <p>${escapeHtml(message)}</p>
    </div></div>
    <div class="empty">
      <b>Try reloading the page.</b>
      If it keeps happening, reset the demo data from Settings.
      <br /><br />
      <button class="btn btn--primary" onclick="location.reload()">Reload</button>
      <a class="linkbtn" href="#/">← Back to the works</a>
    </div>`;
}
