# Medication Tracker

A simple phone app to help someone keep track of tablets that have to be taken at different intervals through the day.

For each medication you set:

- **Minimum hours between doses**: the app shows a countdown, and sends a notification once it's OK to take the next dose.
- **Maximum hours between doses** (optional): if no dose has been logged by then, a **loud alarm** goes off and keeps repeating (every 15 minutes by default) until "I've taken it" is tapped.
- **Most doses in 24 hours** (optional): for things like paracetamol. The app won't say "OK to take" until a dose drops out of the rolling 24-hour window.

He taps one big **"I've taken it"** button after each tablet. There's also:

- **Took it earlier…** for when he forgot to tap the button at the time.
- A **"Too soon"** warning if he tries to log a dose before the minimum gap is up.
- **Undo** straight after logging, and a **History** screen where mistaken entries can be removed.
- **Add / edit / remove** medication at any time as the prescription changes.
- **Quiet hours** (off by default): alarms that would go off overnight wait until morning instead.
- A **test alarm** button in Settings so you can check it's loud enough.

Everything is stored on the phone itself. There's no account, no server and no internet needed.

## Getting it onto his phone

The app uses local notifications with a custom alarm sound, so it needs its own build. It **won't work fully in Expo Go**.

### Android (easiest)

1. Create a free account at <https://expo.dev>.
2. Install the dependencies with `npm install`.
3. Build an installable APK in the cloud with `npx eas-cli@latest build --platform android --profile preview`.
4. Open the link EAS gives you on his phone, download the APK and install it. You'll need to allow installing from that source.
5. Open the app, **allow notifications**, and if Android asks, allow **Alarms & reminders**. Without that, reminders can arrive a few minutes late.
6. In Settings, tap **Test the alarm** and lock the phone to check it sounds.

On some phones (Samsung, Xiaomi, Huawei) it's also worth turning off battery optimisation for the app: *Settings → Apps → Medication Tracker → Battery → Unrestricted*.

### iPhone

Installing on an iPhone needs an Apple Developer account ($99/year). Build with `npx eas-cli@latest build --platform ios --profile preview` after registering his device (`npx eas-cli@latest device:create`), or distribute through TestFlight.

Note that iOS doesn't let normal apps play true alarm-clock sounds. The overdue alarm is a "Time Sensitive" notification with the custom alarm sound (up to 30 seconds). It gets through Focus modes, but **not** if the phone's ring/silent switch is set to silent.

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

> This app is a memory aid, not medical advice. Set the intervals from the prescription or pharmacist's instructions.
