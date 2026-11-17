# Greedy Pig

A multiplayer dice game for a secondary mathematics class. A teacher projects the board and rolls one die for everyone. Each student chooses when to bank from their own browser. A room holds up to **100 students plus the teacher**. In the teacher lobby, choose 1–20 rounds and the die face that ends a round. The defaults are five rounds and a death number of 1.

For a lesson, go to the [teacher guide](TEACHER_GUIDE.md). To put the game on your school's own `workers.dev` address, start with [deployment stage A](DEPLOYMENT.md).

## Play on your laptop

You need Node.js 24 LTS with npm. Open a terminal in the folder containing `package.json`. On Windows PowerShell, use the commands below. On macOS or Linux, substitute `npm` for `npm.cmd`.

```powershell
npm.cmd ci
npm.cmd run dev
```

1. Open [the local game](http://127.0.0.1:8787). Under **Host a game**, click **Create room**. In the lobby's **Game settings**, check the round count and death number. Leave the death number at 1 for this rehearsal and select **Save settings** if you change the round count.
2. Open the same address in a private window or a second browser profile. Enter the room code and a nickname under **Join a game**. Ordinary tabs in one profile share the same identity for that room.
3. Start a round in the teacher window. The first two rolls of the whole game draw from 2–6. From the third roll, all six faces are possible. Roll, then bank from the student window when there are points in the pot. Both screens should show the same total.

Wrangler runs the Worker, assets, WebSockets and SQLite room storage locally. Local simulation requires no Cloudflare account or secrets. Leave the terminal running while you play. Press **Ctrl+C** to stop. Wrangler keeps local room data under `.wrangler/state`. Classroom devices need the deployed HTTPS address.

## Develop and test

For frontend editing, leave `npm.cmd run dev` running and start `npm.cmd run dev:ui` in a second terminal. Open the Vite address printed in that terminal. Vite refreshes the interface on edits and forwards API calls and WebSockets to Wrangler on port 8787. For a check of the deployed asset layout, stop and restart `npm.cmd run dev` to rebuild the frontend and open port 8787 again.

| Command | Purpose |
| --- | --- |
| `npm.cmd test` | Run deterministic rule tests, including both possible orders for a bank racing a roll. |
| `npm.cmd run check` | Type-check the browser and Worker projects. |
| `npm.cmd run build` | Type-check and generate production browser assets in `dist/`. |
| `npm.cmd run test:integration` | Exercise the local Worker and Durable Objects over HTTP and WebSockets. Keep the local server on port 8787 running. |
| `npm.cmd run test:load` | Simulate a teacher and 100 student connections against local Wrangler. Keep the local server running. |

The network tests create their own rooms. The simulation's terminal output reports what happened on that run. Rehearse on the deployed URL with school devices to check the school's content filters, wireless coverage and device settings. [Public rehearsal steps](DEPLOYMENT.md)

## How a room works

- **Client.** React and Vite serve the joining page, teacher board and student controls. Browsers send actions and display the room's confirmed scores. Static assets, including fonts and artwork, ship with the application.
- **Routing.** The Worker generates a six-digit code using Web Crypto, derives a Durable Object ID from that code and retries a collision. Every request for one code reaches the same `GameRoom`. The checked-in `ROOMS` binding and `v1` SQLite migration provision storage at deployment.
- **State.** One SQLite-backed Durable Object owns the roster, dice, running pot and banked totals. WebSockets deliver the latest board to participants and support hibernation between events. Refreshing the page opens a connection to that same room and retrieves its current state.
- **Ordering.** Each bank refers to the turn displayed when the student tapped. The room processes actions in server order. A bank accepted first secures that pot once. A roll accepted first closes the old offer, so a delayed bank cannot claim it. Other students may bank the same pot independently. An accepted pause also closes the previous offer.
- **Identity.** The server assigns a random 256-bit session token to each browser that creates or joins a game, stores its SHA-256 digest and sends the token in a room-scoped, HTTP-only, SameSite=Strict cookie marked Secure on HTTPS. Teacher actions require the creating browser's session. Each bank applies to the authenticated student's own total.
- **Nicknames.** Students type their own names. A word filter running on the game server screens them as they join. It uses local rules and needs no AI service or API key. The teacher can remove a name the filter misses.
- **Privacy and expiry.** Students provide a nickname for the leaderboard. The application asks for no email, password or student account. Room storage holds the roster, scores, session digests and command receipts. Rooms expire **24 hours after creation**, including rooms with open tabs. A Durable Object alarm closes connections and deletes the room's storage. Browsers keep the last room code locally to help with reopening the game.

| Project path | What to change |
| --- | --- |
| `src/`, `public/` | React screens, layout, local fonts and artwork. |
| `shared/game.ts` | Round settings, scoring rules, actions and rankings. |
| `shared/nickname-filter.ts` | Built-in nickname word filter. |
| `worker/` | Public API, session authentication, SQLite persistence and live connections. |
| `wrangler.jsonc` | Worker name, assets, room binding, migrations and rate limits. |
| `tests/`, `scripts/` | Rule tests and local multiplayer verification. |
| `.env.example` | Configuration notes. The default game runs without environment variables. |

## When something goes wrong

| Symptom | Action |
| --- | --- |
| PowerShell refuses to run `npm.ps1` | Run `npm.cmd` as shown above. |
| Vite loads the page but joining fails | Start the Worker with `npm.cmd run dev` and check that port 8787 is available. Use the same printed browser address throughout the session. |
| Two tabs show the same player or both show teacher controls | Keep the teacher in the original browser profile and use a separate profile for each player. |
| A student loses Wi-Fi or a bank seems missing | Wait for reconnection and read the restored score and status before acting again. [Classroom recovery steps](TEACHER_GUIDE.md) |
| A public room fails to create or school devices cannot connect | Check the deployed Worker, binding, quotas and school WebSocket access. [Deployment troubleshooting](DEPLOYMENT.md) |

## Quiet Mode and version timestamp

Quiet Mode uses the teacher device's microphone and defaults to 20 rounds, adjustable up to 100. See the [teacher guide](TEACHER_GUIDE.md) for the noise meter and round-loss rules.

The vertical timestamp on the lower-right edge shows the latest Git commit time in Pacific/Auckland. A build from a source archive without Git history shows its build time instead.
