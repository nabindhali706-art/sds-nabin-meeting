# SDS NABIN MEETING — Web MVP

A bilingual (English + Bangla) video-meeting web application starter built with React, TypeScript, Supabase and LiveKit Cloud.

## What is included

- Email/password sign-up and sign-in through Supabase Auth
- Dashboard with recent meeting rooms
- Create meeting rooms
- Join a meeting using its UUID or invite URL
- LiveKit-powered audio/video meeting room
- LiveKit's standard conference UI, including participant tiles, microphone/camera controls, screen sharing and chat controls supported by the installed components version
- English/Bangla language toggle
- Supabase SQL schema and Row Level Security policies
- Supabase Edge Function that issues short-lived LiveKit access tokens

## Important MVP limitations

1. This is a runnable web starter, not a production-ready Zoom replacement.
2. The included meeting metadata policy permits authenticated users to read meeting metadata so a signed-in invitee can join by meeting ID. For production, replace this with hashed, expiring invitations and stricter access policies.
3. The current token function grants ordinary room join/publish/subscribe permissions. Server-side moderation (mute/remove/end room) is not implemented yet.
4. LiveKit's free plan has usage and concurrency limits. A 100+ person meeting may require a paid plan or a different deployment. Do a controlled load test before relying on it for an event.
5. Screen sharing and camera permissions depend on browser/device support. Android app support is a separate next milestone.
6. Chat in the built-in conference UI is room-session chat; persistent chat history is not yet wired to `meeting_messages`.

## Requirements

- Node.js 20 LTS or newer
- npm
- A Supabase project
- A LiveKit Cloud project

## 1. Install dependencies

```bash
npm install
```

## 2. Configure Supabase

1. Create a project at https://supabase.com/.
2. Open **Project Settings → API** and copy the Project URL and anon/publishable key.
3. In the project, open **SQL Editor**.
4. Run `supabase/migrations/0001_initial_schema.sql`.
5. Open **Authentication → Providers → Email** and enable email/password sign-in.
6. For quick development, you may temporarily turn off email confirmation. Re-enable it before production.

Create a local `.env` file:

```bash
cp .env.example .env
```

Fill it:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
VITE_SUPABASE_FUNCTIONS_URL=https://YOUR_PROJECT_ID.supabase.co/functions/v1
```

Only the Supabase anon/publishable key belongs in the browser. Never put the Supabase service-role key in `.env` for Vite or in frontend code.

## 3. Configure LiveKit Cloud

1. Create a project at https://cloud.livekit.io/.
2. Copy the WebSocket URL, API key and API secret from the project settings.
3. Keep the API secret private. It must only be stored as a Supabase Edge Function secret.

Set the secrets:

```bash
supabase secrets set LIVEKIT_URL="wss://YOUR_PROJECT.livekit.cloud"
supabase secrets set LIVEKIT_API_KEY="YOUR_LIVEKIT_API_KEY"
supabase secrets set LIVEKIT_API_SECRET="YOUR_LIVEKIT_API_SECRET"
```

## 4. Deploy the token Edge Function

Install the Supabase CLI and log in:

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_ID
supabase functions deploy create-livekit-token
```

The function uses the caller's Supabase JWT to verify identity and checks that the meeting exists before issuing a LiveKit token.

## 5. Run locally

```bash
npm run dev
```

Open http://localhost:5173.

For two-person testing, open the app in two different browsers or devices, create a meeting in one account, copy the invite link, and join from the other signed-in account.

## 6. Production web deployment (Cloudflare Pages)

1. Push this project to a GitHub repository.
2. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git**.
3. Select the repository.
4. Build command: `npm run build`
5. Build output directory: `dist`
6. Add the same three `VITE_...` environment variables in the Pages project settings.
7. Deploy.

If you use client-side routes in a future release, add an SPA fallback. This starter uses a single-page view and query-string meeting links.

## 7. Production checklist

Before inviting real users:

- Enable email confirmation and configure allowed redirect URLs.
- Configure Supabase Auth rate limits and strong password requirements.
- Replace permissive meeting-read policy with secure invitation-based authorization.
- Add expiring, single-use or revocable invite tokens.
- Add meeting participant lifecycle logging.
- Add server-side host moderation endpoints using LiveKit RoomServiceClient.
- Add abuse reporting, room locking and rate limiting.
- Add privacy policy, terms, retention policy and data deletion workflow.
- Test with real devices and target network conditions.
- Verify LiveKit plan limits and estimate participant-minute usage.
- Configure a custom domain and HTTPS.

## Troubleshooting

- **Supabase is not configured:** Check `.env`, then stop and restart `npm run dev`.
- **Token function returns 401:** Sign in again and confirm the function is deployed to the same Supabase project.
- **Token function returns LiveKit secrets are not configured:** Re-run the `supabase secrets set` commands and redeploy the function.
- **Camera does not start:** Use HTTPS (or localhost), allow browser camera/microphone permissions, and close other apps using the camera.
- **Invite link does not work:** The invitee must create an account/sign in; paste the full link or meeting UUID.
- **Meeting room does not connect:** Confirm the LiveKit URL begins with `wss://` and the API key/secret belong to the same LiveKit project.

## License

Private project starter. Add a license only if you intend to publish or distribute the source.
