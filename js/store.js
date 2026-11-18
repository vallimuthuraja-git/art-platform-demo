import { nowSeconds } from './format.js';
export const MEDIUMS = ['Watercolor', 'Gouache', 'Ink & wash', 'Oil pastel', 'Photograph', 'Charcoal', 'Pastel', 'Other'];
export const STATUSES = ['draft', 'listed', 'auction', 'sold', 'archived'];
export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'];
export const PUBLIC_STATUSES = new Set(['listed', 'auction', 'sold']);
let seq = 0;
export function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}`;
}
// The one source of truth for the minimum next bid (issue #8).
export function minimumBid(currentCents) {
    return currentCents + Math.max(100, Math.floor(currentCents * 0.05));
}
// Quick-bid chips round UP to the next whole ₹100 so they always clear the
// server minimum, even when 5% is fractional.
export function quickBids(currentCents) {
    const min = minimumBid(currentCents);
    return [1.05, 1.15, 1.3].map((m) => Math.max(min, Math.ceil((currentCents * m) / 100) * 100));
}
export function visibleArtworks(state) {
    return state.artworks.filter((a) => !a.deleted_at);
}
export function artworkById(state, id) {
    return state.artworks.find((a) => a.id === id && !a.deleted_at);
}
export function auctionForArtwork(state, artworkId) {
    return state.auctions.find((au) => au.artwork_id === artworkId);
}
// Move due auctions in both directions (issue #12): pending → active at
// starts_at, active → ended at ends_at, settling the winner or returning the
// work to listed.
export function settleDue(state, now = nowSeconds()) {
    let settled = 0;
    for (const au of state.auctions) {
        if (au.status === 'pending' && au.starts_at <= now)
            au.status = 'active';
        if (au.status === 'active' && au.ends_at <= now) {
            settleAuction(state, au, now);
            settled++;
        }
    }
    return settled;
}
export function settleAuction(state, au, now = nowSeconds()) {
    const art = state.artworks.find((a) => a.id === au.artwork_id);
    au.status = 'ended';
    const winner = au.current_bidder_id;
    // A self-bid must never produce an order against the seller (issue #10).
    const selfBid = winner != null && art != null && winner === art.user_id;
    if (winner && !selfBid && art) {
        au.winner_id = winner;
        art.status = 'sold';
        art.sold_at = now;
        state.orders.push({
            id: uid('o'), artwork_id: art.id, buyer_id: winner, seller_id: art.user_id,
            amount_cents: au.current_bid_cents, currency: 'INR', status: 'pending',
            payment_provider: null, payment_id: null, created_at: now, updated_at: now
        });
    }
    else {
        au.winner_id = null;
        if (art)
            art.status = 'listed';
    }
}
export function placeBid(state, auctionId, userId, amountCents, now = nowSeconds()) {
    settleDue(state, now);
    const au = state.auctions.find((a) => a.id === auctionId);
    if (!au)
        return { ok: false, error: 'Auction not found' };
    if (au.status !== 'active')
        return { ok: false, error: `Auction has ${au.status === 'ended' ? 'ended' : au.status}` };
    const art = state.artworks.find((a) => a.id === au.artwork_id);
    if (art && art.user_id === userId)
        return { ok: false, error: 'You cannot bid on your own work' };
    if (au.current_bidder_id === userId)
        return { ok: false, error: 'You are already the highest bidder' };
    if (now > au.ends_at)
        return { ok: false, error: 'Auction has ended' };
    const min = minimumBid(au.current_bid_cents);
    if (!Number.isInteger(amountCents) || amountCents < min) {
        return { ok: false, error: `Minimum bid is ${inr(min)}`, min_bid_cents: min };
    }
    au.current_bid_cents = amountCents;
    au.current_bidder_id = userId;
    au.bid_count += 1;
    state.bids.push({ id: uid('b'), auction_id: auctionId, user_id: userId, amount_cents: amountCents, created_at: now });
    return { ok: true };
}
export function createAuction(state, userId, artworkId, startPriceCents, startsAt, endsAt, now = nowSeconds()) {
    const art = artworkById(state, artworkId);
    if (!art || art.user_id !== userId)
        return { ok: false, error: 'Artwork not found or not yours' };
    // Duplicate is a conflict, checked before the status rule (issue #9).
    if (auctionForArtwork(state, artworkId))
        return { ok: false, error: 'This work is already under the hammer' };
    if (art.status !== 'draft' && art.status !== 'listed')
        return { ok: false, error: 'Artwork must be in draft or listed status' };
    if (!Number.isInteger(startPriceCents) || startPriceCents <= 0)
        return { ok: false, error: 'Enter a starting price greater than zero' };
    if (startsAt >= endsAt)
        return { ok: false, error: 'End time must be after start time' };
    state.auctions.push({
        id: uid('au'), artwork_id: artworkId, start_price_cents: startPriceCents,
        current_bid_cents: startPriceCents, current_bidder_id: null, bid_count: 0,
        starts_at: startsAt, ends_at: endsAt, status: startsAt <= now ? 'active' : 'pending', winner_id: null
    });
    art.status = 'auction';
    return { ok: true };
}
export function endAuction(state, userId, auctionId, now = nowSeconds()) {
    const au = state.auctions.find((a) => a.id === auctionId);
    if (!au)
        return { ok: false, error: 'Auction not found' };
    const art = state.artworks.find((a) => a.id === au.artwork_id);
    if (!art || (art.user_id !== userId && state.users.find((u) => u.id === userId)?.role !== 'admin')) {
        return { ok: false, error: 'Forbidden' };
    }
    if (au.status !== 'active' && au.status !== 'pending')
        return { ok: false, error: 'Auction is not active' };
    settleAuction(state, au, now);
    return { ok: true };
}
function cleanInput(input) {
    const title = (input.title ?? '').trim();
    if (!title)
        return { ok: false, error: 'Give the work a title.' };
    if (title.length > 200)
        return { ok: false, error: 'Title must be 200 characters or fewer.' };
    if (!Number.isInteger(input.price_cents) || input.price_cents <= 0)
        return { ok: false, error: 'Enter a price greater than zero.' };
    const tags = (input.tags ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
    const medium = (input.medium ?? '').trim();
    return { ok: true, value: { ...input, title, price_cents: input.price_cents, tags, medium, description: (input.description ?? '').trim() } };
}
export function createArtwork(state, userId, input, now = nowSeconds()) {
    const cleaned = cleanInput(input);
    if (!cleaned.ok)
        return { ok: false, error: cleaned.error };
    const v = cleaned.value;
    // Create accepts draft/listed only — auction/sold have their own flows (#7).
    const status = v.status === 'listed' ? 'listed' : 'draft';
    const art = {
        id: uid('a'), user_id: userId, title: v.title, description: v.description ?? '',
        price_cents: v.price_cents, currency: 'INR', status, image: 'tea-garden',
        tags: v.tags ?? [], dimensions: v.dimensions ?? null, medium: v.medium || 'Other',
        created_at: now, listed_at: status === 'listed' ? now : null, sold_at: null, deleted_at: null
    };
    state.artworks.push(art);
    return { ok: true, artwork: art };
}
export function updateArtwork(state, userId, id, patch, now = nowSeconds()) {
    const art = artworkById(state, id);
    if (!art)
        return { ok: false, error: 'Artwork not found' };
    const user = state.users.find((u) => u.id === userId);
    if (art.user_id !== userId && user?.role !== 'admin')
        return { ok: false, error: 'Forbidden' };
    if (patch.title !== undefined) {
        const t = patch.title.trim();
        if (!t)
            return { ok: false, error: 'Give the work a title.' };
        art.title = t.slice(0, 200);
    }
    if (patch.description !== undefined)
        art.description = patch.description.trim();
    if (patch.price_cents !== undefined) {
        if (!Number.isInteger(patch.price_cents) || patch.price_cents <= 0)
            return { ok: false, error: 'Enter a price greater than zero.' };
        art.price_cents = patch.price_cents;
    }
    if (patch.medium !== undefined)
        art.medium = patch.medium.trim();
    if (patch.tags !== undefined)
        art.tags = patch.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
    if (patch.dimensions !== undefined)
        art.dimensions = patch.dimensions;
    if (patch.status !== undefined && patch.status !== art.status) {
        art.status = patch.status;
        // First listing and manual sale both stamp their timestamp (#28).
        if (patch.status === 'listed' && !art.listed_at)
            art.listed_at = now;
        if (patch.status === 'sold' && !art.sold_at)
            art.sold_at = now;
    }
    return { ok: true };
}
// Soft delete → the undo toast can restore it (#18).
export function deleteArtwork(state, userId, id, now = nowSeconds()) {
    const art = artworkById(state, id);
    if (!art)
        return { ok: false, error: 'Artwork not found' };
    const user = state.users.find((u) => u.id === userId);
    if (art.user_id !== userId && user?.role !== 'admin')
        return { ok: false, error: 'Forbidden' };
    art.deleted_at = now;
    return { ok: true };
}
export function restoreArtwork(state, id) {
    const art = state.artworks.find((a) => a.id === id);
    if (!art)
        return { ok: false, error: 'Artwork not found' };
    art.deleted_at = null;
    return { ok: true };
}
export function advanceOrder(state, userId, id, status, payment, now = nowSeconds()) {
    const user = state.users.find((u) => u.id === userId);
    if (user?.role !== 'admin')
        return { ok: false, error: 'Forbidden' };
    const order = state.orders.find((o) => o.id === id);
    if (!order)
        return { ok: false, error: 'Order not found' };
    if (!ORDER_STATUSES.includes(status))
        return { ok: false, error: 'Unknown order status' };
    order.status = status;
    if (payment?.provider)
        order.payment_provider = payment.provider;
    if (payment?.id)
        order.payment_id = payment.id;
    order.updated_at = now;
    return { ok: true };
}
export function login(state, email, password) {
    const u = state.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u || u.password !== password)
        return null;
    return u;
}
export function changePassword(state, userId, current, next) {
    const u = state.users.find((x) => x.id === userId);
    if (!u)
        return { ok: false, error: 'Not signed in' };
    if (u.password !== current)
        return { ok: false, error: 'Current password is incorrect' };
    if (next.length < 8)
        return { ok: false, error: 'New password must be at least 8 characters' };
    if (next === current)
        return { ok: false, error: 'New password must differ from the current one' };
    u.password = next;
    return { ok: true };
}
function inr(cents) {
    return `₹${(cents / 100).toLocaleString('en-IN')}`;
}
// ---- Persistence wrapper -------------------------------------------------
const STATE_KEY = 'ap_demo_state_v1';
const SESSION_KEY = 'ap_demo_session_v1';
export class Store {
    state;
    listeners = new Set();
    constructor(state) {
        this.state = state;
    }
    static async load() {
        try {
            const raw = localStorage.getItem(STATE_KEY);
            if (raw)
                return new Store(JSON.parse(raw));
        }
        catch { /* fall through to seed */ }
        const res = await fetch('seed.json');
        const seed = await res.json();
        const now = nowSeconds();
        // Seed timestamps are offsets from "now" so the demo always has a live
        // auction and recent history, whenever it is opened.
        const shift = (t) => (t == null ? null : now + t);
        const state = {
            seeded_at: now,
            users: seed.users,
            artworks: seed.artworks.map((a) => ({
                ...a, created_at: shift(a.created_at), listed_at: shift(a.listed_at),
                sold_at: shift(a.sold_at), deleted_at: null
            })),
            auctions: seed.auctions.map((a) => ({ ...a, starts_at: shift(a.starts_at), ends_at: shift(a.ends_at) })),
            bids: seed.bids.map((b) => ({ ...b, created_at: shift(b.created_at) })),
            orders: seed.orders.map((o) => ({ ...o, created_at: shift(o.created_at), updated_at: shift(o.updated_at) }))
        };
        const store = new Store(state);
        store.save();
        return store;
    }
    save() {
        try {
            localStorage.setItem(STATE_KEY, JSON.stringify(this.state));
        }
        catch { /* private mode */ }
    }
    reset() {
        localStorage.removeItem(STATE_KEY);
        localStorage.removeItem(SESSION_KEY);
    }
    subscribe(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }
    commit(fn) {
        const result = fn(this.state);
        if (result.ok) {
            this.save();
            for (const l of this.listeners)
                l();
        }
        return result;
    }
    // Session
    currentUser() {
        try {
            const id = localStorage.getItem(SESSION_KEY);
            return this.state.users.find((u) => u.id === id) ?? null;
        }
        catch {
            return null;
        }
    }
    signIn(email, password) {
        const u = login(this.state, email, password);
        if (u) {
            try {
                localStorage.setItem(SESSION_KEY, u.id);
            }
            catch { /* ignore */ }
        }
        return u;
    }
    signOut() {
        try {
            localStorage.removeItem(SESSION_KEY);
        }
        catch { /* ignore */ }
    }
}
