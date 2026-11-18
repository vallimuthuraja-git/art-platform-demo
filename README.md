# From the Studio — UI demo

Static demo of the [art-platform](https://github.com/vallimuthuraja-git/art-platform) catalogue and auction UI. **All data is mocked** and stored in your browser (localStorage); every action — sign-in, bidding, selling, auctions, orders — is simulated locally. No server, no accounts, no payments.

**Live:** https://vallimuthuraja-git.github.io/art-platform-demo/

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Host (admin) | `host@fromthestudio.local` | `demo1234` |
| Bidder | `asha@example.com` | `demo1234` |
| Bidder | `vikram@example.com` | `demo1234` |

Reset everything from **Settings → Reset demo data**.

## What's inside

- Custom zero-dependency UI framework in TypeScript (hash router, template rendering, event delegation) — no SvelteKit, no build-time framework.
- Mock backend mirroring the real API rules: minimum bid = current + max(₹1, 5%), owner cannot bid, auctions auto-close at their end time and create orders, soft delete with undo.
- Responsive image derivatives (480/760/1200w WebP), pre-blurred photographic backdrops, dark/light themes, frost + rail settings, ⌘K search.

Sample photographs are CC BY / CC BY-SA via Wikimedia Commons, credited in each work's description.

Source and build scripts live in the main repo under [`demo/`](https://github.com/vallimuthuraja-git/art-platform/tree/main/demo). This repo holds only the built output.
