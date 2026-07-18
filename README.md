# CityZen

A civic issue-reporting platform. Citizens report neighborhood problems (garbage, broken roads, faulty electricity, downed wires, etc.) with a photo and location; the report is auto-routed to the municipal official (MCD) responsible for that district, who marks it seen and later resolves it with photo proof. Districts and citizens are both ranked on public leaderboards.

Built with [Next.js](https://nextjs.org) and [Supabase](https://supabase.com) (Postgres + Auth + Storage + Realtime), with [Groq](https://groq.com) vision for optional AI-assisted report auto-fill and [Leaflet](https://leafletjs.com)/OpenStreetMap for the map view (no API key required for either the map or, for local dev, any paid service).

## Features

- **Report an issue** — photo upload, GPS location, auto-detected district, optional AI auto-fill (title/description/category/severity from the photo via Groq vision).
- **Duplicate handling** — reports within ~150m/14 days of an existing pending issue merge automatically (by location), with a second pass by photo similarity (perceptual hash) for reports that don't share a location. Borderline-similar photos that don't auto-merge surface in an MCD "possible duplicates" review queue instead.
- **Priority sorting** — issues are ranked by a weighted community-signal score (report count + confirmations + photo-evidence confirmations), not just recency.
- **Progress tracking** — a three-stage Reported → Seen by MCD → Resolved tracker per issue, with a dedicated issue detail page (`/issues/[id]`).
- **Crowd verification** — citizens can confirm ("still an issue," optionally with a fresh photo as evidence) or flag a pending report.
- **MCD dashboard** — district-scoped queue with mark-seen/mark-resolved (proof required) actions, enforced server-side via Postgres RPC functions (not just UI-level checks).
- **Leaderboards** — districts ranked by resolution score + average resolution time; citizens ranked by a weighted engagement score (reports submitted, confirmations given, evidence-backed confirmations). No point redemption/rewards system — ranking only.
- **Public Browse view** — read-only, no login required, for anyone to see the system is real and active.
- **Map view** — Leaflet + OpenStreetMap pins for all filtered issues on both Issues and Browse pages.
- **Notifications** — in-app bell notifying a citizen when their report is seen or resolved.
- **Rate limiting** — max 5 new reports per user per rolling hour (merges don't count against it).
- **Error logging** — client-side errors are written to a Supabase table instead of vanishing into the console; every list/detail page has an error boundary with a retry state instead of a blank screen on failure.

## Getting Started

1. Create a Supabase project at [supabase.com](https://supabase.com).
2. In the Supabase SQL Editor, run the migration files in this repo's `supabase/` folder **in order**:

   ```
   schema.sql
   migration_2_mcd_roles.sql
   migration_3_scoring_grouping.sql
   migration_4_crowd_verification.sql
   migration_5_photo_dedup.sql
   migration_6_notifications_public_access.sql
   migration_7_seen_status_evidence.sql
   migration_8_citizen_leaderboard.sql
   migration_9_hardening.sql
   migration_10_error_logs_notifications.sql
   migration_11_duplicate_review.sql
   ```

   Each file has a comment at the top noting which migration it depends on. `migration_9_hardening.sql` adds a `schema_migrations` table — worth checking after a fresh setup that all 11 are recorded there.

3. Create a Storage bucket named `issue-photos` (public) if one doesn't already exist — used for report photos and MCD proof-of-completion uploads.
4. Copy `.env.local.example` to `.env.local` (or create `.env.local` directly) and fill in:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://yourprojectref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key

   # Optional — powers the "Analyze with AI" auto-fill button on the report
   # form. Server-only; never prefix with NEXT_PUBLIC_.
   GROQ_API_KEY=your-groq-key
   GROQ_VISION_MODEL=llama-3.2-11b-vision-preview
   ```

   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the "publishable" key) is safe to be public — it's meant to ship in the browser bundle. `GROQ_API_KEY` and the Supabase secret key (not used by this app, but shown in the same dashboard) are not — never commit or share those.

5. Install dependencies and run the dev server:

   ```bash
   npm install --legacy-peer-deps
   npm run dev
   ```

   `--legacy-peer-deps` is required because a couple of dependencies (`@moxy/react-split-text`, `react-leaflet`) haven't caught up their peer-dependency ranges to React 19 yet, even though they work fine with it.

Open [http://localhost:3000](http://localhost:3000) to see the result.

### MCD accounts

There's no self-service MCD signup — this is intentional, since MCD accounts can mark issues resolved. To promote an existing user to an MCD account for a specific district, run in the SQL Editor (as the project owner, not from the app):

```sql
select assign_mcd_role('the-user-email@example.com', 'District Name');
```

### Running the test suite

Integration tests cover the RPC security layer (`complete_issue`, `mark_seen`, `submit_report`, `react_to_post`, `assign_mcd_role`) against a **local** Supabase instance — never your real project. Requires the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase start
# apply all migration files above to the local instance, then:
npm test
```

See `tests/rpc-security.test.js` for details.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Groq Documentation](https://console.groq.com/docs)

## Deploy

The easiest way to deploy is [Vercel](https://vercel.com/new) — set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GROQ_API_KEY`, and `GROQ_VISION_MODEL` in your Vercel project's environment variables.
