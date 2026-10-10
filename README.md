# Medication Tracker

A simple phone app to help someone keep track of tablets that have to be taken at different intervals through the day.

Each medication is taken one of two ways.

**Every few hours.** For example, paracetamol every 4–6 hours:

- **Minimum hours between doses**: the app shows a countdown, and sends a notification once it's OK to take the next dose.
- **Maximum hours between doses** (optional): if no dose has been logged by then, a **loud alarm** goes off and keeps repeating (every 15 minutes by default) until "I've taken it" is tapped.
- **Doses to fit in each day** (optional): the app works backwards from the **"last doses by"** time (11:30pm by default) to the latest time each dose can be taken while leaving room for the rest. If he falls behind, the alarm goes off earlier, and the card warns him when not all the doses can fit in any more. Once they're all taken it shows "Done for today".
- **Most doses in 24 hours** (optional): a hard limit, for things like paracetamol. The app won't say "OK to take" until a dose drops out of the rolling 24-hour window.

**At meal times.** For example, "one at breakfast and one at dinner":

- Tick the meals: breakfast, lunch, dinner and/or bedtime. The rough times are set once in Settings.
- He gets a reminder at the meal and an alarm if it's not taken within an hour. It's OK to take from an hour before the meal.
- If he tries to take a second dose for the same meal, he gets a warning. A missed dose is shown as missed and isn't doubled up at the next meal.

He taps one big **"I've taken it"** button after each tablet. There's also:

- **Took it earlier…** for when he forgot to tap the button at the time.
- A **"Too soon"** warning if he tries to log a dose before the minimum gap is up.
- **Undo** straight after logging, and a **History** screen where mistaken entries can be removed.
- **Add / edit / remove** medication at any time as the prescription changes.
- **No alarms overnight** (on by default): alarms that would go off between the "last doses by" time and the start of his day wait until the morning.
- A **test alarm** button in Settings so you can check it's loud enough.

Everything is stored on the phone itself. There's no account and no internet needed, unless you turn on family alerts (below).

## Getting it onto his phone

The app uses local notifications with a custom alarm sound, so it needs its own build. It **won't work fully in Expo Go**.

### Android, built from your phone (no computer needed)

GitHub builds the app for you using `.github/workflows/build-android.yml`.

1. Open this repository in the **GitHub app** or on github.com in your phone's browser.
2. Go to **Actions → Build Android APK → Run workflow**. It also runs on its own whenever new code is pushed.
3. Wait about 15–20 minutes for the build to go green.
4. Go to **Releases** and open the latest release. On his phone, tap **medication-tracker.apk** to download it. If the repo is private, you'll need to be signed in to GitHub, or download it on your phone and send him the file.
5. Open the downloaded file and allow "install unknown apps" for the browser or Files app when asked.
6. Open the app, **allow notifications**, and if Android asks, allow **Alarms & reminders**. Without that, reminders can arrive a few minutes late.
7. In Settings, tap **Test the alarm** and lock the phone to check it sounds.

Later builds install as an update over the top, and his medication list and history are kept.

### Android, built with Expo's build service (alternative)

Create a free account at <https://expo.dev>, then run `npx eas-cli@latest build --platform android --profile preview` and open the link it gives you on his phone.

On some phones (Samsung, Xiaomi, Huawei) it's also worth turning off battery optimisation for the app: *Settings → Apps → Medication Tracker → Battery → Unrestricted*.

### iPhone

Installing on an iPhone needs an Apple Developer account ($99/year). Build with `npx eas-cli@latest build --platform ios --profile preview` after registering his device (`npx eas-cli@latest device:create`), or distribute through TestFlight.

Note that iOS doesn't let normal apps play true alarm-clock sounds. The overdue alarm is a "Time Sensitive" notification with the custom alarm sound (up to 30 seconds). It gets through Focus modes, but **not** if the phone's ring/silent switch is set to silent.

## Family alerts on Telegram (optional)

Family members can get Telegram messages when he takes a dose, when a dose is missed, and a summary each night. Updates that happen close together, such as several tablets at breakfast, are grouped into one message (5 minutes by default). A dose that's undone straight away is never sent.

Missed doses are noticed by a small server rather than his phone, so the family is still told if his phone is off or the battery has died. The server runs free on Cloudflare and is deployed from GitHub, so this can all be set up from a phone.

**1. Make the Telegram bot.** In Telegram, message **@BotFather**, send `/newbot` and follow the prompts. Something like "Dad's Medication" works as a name. BotFather replies with a **token** (it looks like `123456:ABC…`). Copy it.

**2. Set up Cloudflare (free).**
1. Sign up at <https://dash.cloudflare.com>.
2. Open **Workers & Pages** once. If it asks you to choose a `workers.dev` subdomain, pick any name.
3. Go to **My Profile → API Tokens → Create Token**, use the **"Edit Cloudflare Workers"** template, and create it. Copy the token.

**3. Choose a key.** Make up a long password, e.g. four random words. The app uses it to prove to the server that updates are genuine.

**4. Add three secrets to GitHub.** Open this repository in your phone's browser. If the Settings tab is hidden, switch to the desktop site. Go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | the token from BotFather |
| `CLOUDFLARE_API_TOKEN` | the Cloudflare API token |
| `APP_KEY` | the key you chose |

You only need `CLOUDFLARE_ACCOUNT_ID` as well if your Cloudflare login has more than one account. It's the 32-character code in the address bar after `dash.cloudflare.com/` once you're logged in.

Secrets stay private even though the repository is public.

**5. Deploy.** Go to **Actions → Deploy family alerts → Run workflow**. When it's green (about a minute), open the run. The summary shows the **server address**.

**6. Connect his phone.** In the app, go to **Settings → Family alerts**. Enter the server address, the key, and his name as the family call him. Tap **Connect**; it should show "Connected".

**7. Invite the family.** Tap **Share the invite link** and send it to family members, e.g. on WhatsApp. When they tap it, Telegram opens; they tap **Start** and they're signed up. The bot ignores anyone without the link.

In Telegram, each person can send:
- `/status` to see how things stand right now
- `/updates_off` to stop getting a message for every dose. Missed-dose alerts still come through.
- `/summary_off` to stop the nightly summary
- `/stop` to leave

In the app you can also set how long updates are grouped for, and how long his overdue alarm has to be going before the family is told (30 minutes by default).

## Development

```bash
npm install
npm test           # scheduling logic tests
npm run typecheck
npm run lint
npx expo run:android   # or run:ios — dev build on a device or emulator
```

- `src/logic.ts`: all the timing rules (status, daily limits, quiet hours, which notifications to schedule). It's pure functions, covered by `test/logic.test.ts`.
- `src/notifications.ts`: notification channels and permissions. It throws away and rebuilds the schedule whenever anything changes.
- `src/storage.ts`: saves data on the device (AsyncStorage).
- `App.tsx` and `src/components/`: the screens.
- `scripts/make-alarm-sound.js`: regenerates `assets/sounds/alarm.wav`.
- `src/familySync.ts`: sends updates to the family alerts server.
- `server/`: the family alerts server, a Cloudflare Worker. `server/src/engine.ts` holds all its decisions (grouping, missed doses, the nightly summary, bot commands), reusing `src/logic.ts`. Run `npm test` in `server/` to test it.

> This app is a memory aid, not medical advice. Set the intervals from the prescription or pharmacist's instructions.
