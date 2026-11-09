# Mobile offline guide

Expo SDK 58 + React Native app for Android-first field use. It is a real client of the FastAPI backend: authentication, animal registration, health triage, vaccinations, feed/water records, nearby veterinarians and the LangGraph assistant all hit `/api/v1`.

## Run locally

```bash
cd mobile
npm install
npx expo start
```

The API URL resolution order is:

1. `EXPO_PUBLIC_API_URL` (use your computer's LAN IP for a physical phone)
2. `expo.extra.apiUrl` in [app.json](app.json)
3. Android emulator default `http://10.0.2.2:8000/api/v1`

Copy [.env.example](.env.example) to `.env` and set the URL. Start the backend first (`uvicorn app.main:app --host 0.0.0.0 --port 8000` from `backend/`).

Sign in with a demo farmer such as `ramesh@alg.demo` / `Demo@1234` (all demo records are labelled sample data in the UI and API).

## Offline-first behaviour

`expo-sqlite` database `livestock_guardian.db` stores:

| Table | Purpose |
|---|---|
| `meta` | client id, language, cached overview, last sync time, offline animal ids |
| `pending_operations` | queued mutations with a client UUID and a unique idempotency key |
| `pending_photos` | camera photos waiting for upload |
| `cached_animals`, `cached_schedule`, `cached_cases` | read-only cache for the animal list, vaccination schedule and health cases |

Every offline mutation is queued with an idempotency key. Reconnecting (app foreground or pull-to-refresh) posts the queue to `POST /api/v1/sync/batch`. The server returns `applied`, `duplicate`, `conflict` or `error` per operation; the app deletes applied/duplicate entries and keeps failures visible in the Sync Centre with the server message. Photos upload separately with `POST /api/v1/animals/{id}/photo`.

Offline-supported entities: animal registration, health observations, vaccination records, feed records, water records and environmental records. Health reports submitted online go through the full LangGraph triage workflow; offline observations run through the same workflow when they sync.

## Feature notes

- **Camera**: `expo-camera` capture, resized to 1280 px and compressed before upload; photos are queued offline.
- **Digital ID**: QR identity is issued by the server (`POST /api/v1/animals/{id}/qr`) and rendered with `react-native-qrcode-svg`. Offline-created animals show a pending notice until they sync.
- **Voice assistant**: text questions go to the LangGraph workflow in the selected language; `expo-speech` reads answers aloud with `en-IN`, `hi-IN` or `mr-IN` voices. Voice dictation uses the Android keyboard; the reply read-aloud is the offline-capable part.
- **Vaccination reminders**: local notifications scheduled three days before each due date, deduplicated across launches. Protocol source references from the backend are displayed.
- **Nearby vets**: foreground location permission is requested per visit; coordinates are sent to `/veterinarians/nearby` only for sorting. Denying permission falls back to district matching.
- **Languages**: Marathi, Hindi and English UI, persisted locally and synced to `/users/me`.

## Guardrails

The app never presents AI output as a diagnosis or prescription. Health and assistant screens show the advisory notice, urgent warning signs trigger escalation server-side, and clinical diagnosis/treatment remains a veterinarian action. Sample data is marked with the demo banner.

## Verification

```bash
npm run typecheck
npm run export:android
```

`export:android` produces a Hermes bundle in `dist/` (Expo's `expo export`). For an installable APK use EAS:

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

`eas.json` contains the `development`, `preview` and `production` profiles.
