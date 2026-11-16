# Put Greedy Pig online

Work through one stage at a time. The checkpoint at the end of each stage tells you when to move on. Cloudflare and GitHub instructions were checked on 16 November 2026.

## A. Put the tested project in a private GitHub repository

1. On your Windows laptop, install Node.js 24 LTS and Git for Windows if needed. Open PowerShell in the project folder containing `package.json` and `wrangler.jsonc`. These commands should print version numbers. [Node.js downloads](https://nodejs.org/en/download) · [Git for Windows](https://git-scm.com/downloads/win)

   ```powershell
   node --version
   npm.cmd --version
   git --version
   ```

2. Install the locked dependencies, run the tests and build the site. Keep this folder for future updates. On macOS or Linux, use `npm` in place of `npm.cmd`.

   ```powershell
   npm.cmd ci
   npm.cmd test
   npm.cmd run build
   ```

3. In your GitHub account, choose **New repository**. Select the owner, enter **greedy-pig**, select **Private** and create the repository with the README, licence and .gitignore options left empty. Copy the **HTTPS** repository URL. [GitHub’s guide to importing an existing project](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)

4. Set up Git in this folder. If you already see a previous commit in `git log -1`, keep it and skip the initial commit. Replace the name and email examples with the identity you want associated with your commits. You can copy your private commit email from GitHub **Settings → Emails**.

   ```powershell
   git init
   git config --local user.name "Your name"
   git config --local user.email "YOUR-GITHUB-COMMIT-EMAIL"
   git add .
   git diff --cached --stat
   git commit -m "Add Greedy Pig classroom game"
   git branch -M main
   ```

5. Connect the remote. Replace the URL below with the one you copied. If `git remote -v` already shows the correct `origin`, skip `git remote add`. Git for Windows can open a browser sign-in using Git Credential Manager. Complete GitHub’s prompts in the browser. [GitHub authentication with Git Credential Manager](https://docs.github.com/en/get-started/git-basics/caching-your-github-credentials-in-git)

   ```powershell
   git remote -v
   git remote add origin https://github.com/YOUR-OWNER/greedy-pig.git
   git push -u origin main
   git rev-parse --short HEAD
   ```

**Checkpoint A.** Open GitHub, select `main` and check that the latest commit matches the terminal. The repository should show **Private**, with `wrangler.jsonc`, `package-lock.json` and the source files visible.

## B. Deploy one Cloudflare Worker

1. Create a Cloudflare account, verify the account email and sign in. Open **Workers & Pages**, keeping the Workers Free plan. The school can use the included `workers.dev` hostname. [Cloudflare account setup](https://developers.cloudflare.com/fundamentals/account/create-account/) · [Workers hostnames](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

2. In **Workers & Pages → Create application**, choose **GitHub**. When prompted, install the **Cloudflare Workers & Pages** GitHub App on the repository owner’s account and authorise it. Choose **Only select repositories** and select **greedy-pig**. For a school organisation, an administrator may need to approve the installation. Select the repository in Cloudflare. [GitHub integration and access](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)

3. Check the build settings. Workers Builds installs the locked project dependencies. The build command runs the tests before creating the assets. Leave Cloudflare’s generated build token selected. The classroom game needs no shared teacher password or custom application secret. [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) · [Build image and Node version](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)

   | Setting | Value |
   | --- | --- |
   | Worker name | `greedy-pig` |
   | Production branch | `main` |
   | Root directory | Leave at the repository root |
   | Build command | `npm test && npm run build` |
   | Deploy command | `npx wrangler deploy` |
   | Build variable | `NODE_VERSION` = `24` |

4. Choose **Save and Deploy**. If asked to choose an account subdomain, enter an available name. Wrangler uploads the game assets and Worker, provisions the SQLite-backed `GameRoom` namespace and binds it as `ROOMS`. The `v1` migration in `wrangler.jsonc` uses `new_sqlite_classes` to select SQLite. Each room initialises its own storage on first use. Keep this migration in version control for future deployments. [SQLite class migrations](https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/) · [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)

5. Open **Workers & Pages → greedy-pig → Settings → Domains & Routes** and open the production HTTPS address. Its shape is `https://greedy-pig.YOUR-ACCOUNT-SUBDOMAIN.workers.dev`. Copy the actual address shown in your account. [Managing workers.dev routes](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

**Checkpoint B.** The production build shows a successful deployment for your GitHub commit. Opening its URL loads Greedy Pig. Creating a teacher room displays a six-digit code, confirming that the live Worker can reach room storage.

### If you need to deploy from your laptop

In the project folder, run the following commands. Wrangler opens Cloudflare’s authorisation page. Verify the intended account in `whoami` before deploying. Wrangler prints the deployed URL when successful.

```powershell
npx.cmd wrangler login
npx.cmd wrangler whoami
npm.cmd test
npm.cmd run deploy
```

To add automatic updates to this existing Worker, open **Workers & Pages → greedy-pig → Settings → Builds → Connect**, select your private repository and enter the build settings from step B3. Future pushes to `main` trigger a production build. [Cloudflare’s guide to connecting an existing Worker](https://developers.cloudflare.com/workers/ci-cd/builds/)

## C. Rehearse on the school network

Use the production URL on your teacher laptop and the school Wi-Fi. Two separate student devices or browser profiles let you observe banking and losing in the same round.

1. Create a room. In the waiting room select two rounds, keep the death number at 1 and save the settings. On one student device scan the QR code. On another device enter the six digits manually. Use different nicknames. Confirm both appear on the teacher screen.
2. Start the game and roll. After a 2–6, have only the first student bank. Check that their total increases by the displayed pot exactly once. The other player should remain active. If the first roll is a 1, start the next round or a fresh rehearsal.
3. Pause the game, confirm play is paused on the student screens, then resume. Roll until a 1. Check that the first student keeps their banked score and the second earns zero for that round.
4. Refresh the teacher page in the same browser profile. Close and reopen a student's game in the same profile. Briefly turn that student's Wi-Fi off, then back on. Confirm the teacher still has controls, the returning player's name appears once and their score survives.
5. Play the last round. Have everyone bank once there are points and check that it ends. Compare the final rankings and ties across the screens. Start a fresh game before the actual class.
6. During a whole-class rehearsal, have 50 students join a single room. Check the connected count, ask a group to bank together and compare their totals with the pot. Record the date, device count and any filtering or Wi-Fi issue. Local simulation exercises the software separately from this school-network check.

**Checkpoint C.** The deployed game accepts real devices, handles a reconnect and preserves independent scores. Keep the public game address for future lessons.

## D. Update and monitor

Edit the project on your laptop. Run the tests and build before pushing. Replace the example file path and message with your change.

```powershell
npm.cmd test
npm.cmd run build
git status --short
git diff
git add -- README.md
git commit -m "Clarify classroom joining instructions"
git push origin main
```

In Cloudflare, open the Worker’s **Builds** history. Match the commit, check the test and deploy output, then open the production URL and play a short round. A failing build command prevents the deploy command from running. Schedule runtime changes between classes so a deployment-time reconnect does not interrupt a roll. Keep the Worker name, binding and class identity stable when updating. Follow Cloudflare’s migration guidance before changing a storage schema or class lifecycle. [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) · [Durable Object code updates](https://developers.cloudflare.com/durable-objects/deployments/durable-objects-code-updates/)

- **Live game errors.** Open **Workers & Pages → greedy-pig → Logs → Live** and reproduce the problem. From an authenticated local terminal you can also run `npx.cmd wrangler tail` and stop with Ctrl+C. When requesting help, include the failing step, error text and time. Keep browser session credentials and account tokens private. [Real-time logs](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/)
- **Requests and room usage.** View the Worker’s **Metrics** for traffic and errors. Open the dashboard’s **Durable Objects** page for account usage, then the game namespace’s **Metrics** for room activity. WebSocket message charts show actual messages, while billing discounts inbound messages. [Worker metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/) · [Durable Object metrics](https://developers.cloudflare.com/durable-objects/observability/metrics-and-analytics/)
- **Free allowance.** Worker script requests and Durable Object requests each have a 100,000/day account allowance. Direct static asset requests are free. Durable Objects include 13,000 GB-s/day, 5 million SQL rows read/day, 100,000 written/day and 5 GB stored account-wide. Outbound WebSocket messages are free, and incoming messages count at 20 to 1 for request billing. Daily allowances reset at 00:00 UTC. Exceeding a free limit can cause the affected operations to fail until capacity becomes available. [Worker limits](https://developers.cloudflare.com/workers/platform/limits/) · [Static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) · [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- **Build usage.** Workers Builds includes 3,000 build minutes per month on Free. These minutes cover deployments, separate from classroom play. [Workers Builds limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| PowerShell says script execution is disabled | Use the `npm.cmd` and `npx.cmd` spellings throughout this guide. |
| Git says author identity unknown | Set the two local Git identity fields in A4, then repeat the commit. |
| GitHub rejects a push | Confirm access to the repository and the HTTPS URL with `git remote -v`. An existing remote README creates a second history. Clone that repository to a new folder, copy the project files into it (excluding the original `.git`), then commit and push normally. |
| Cloudflare cannot find the private repository | In GitHub **Settings → Applications → Installed GitHub Apps**, configure **Cloudflare Workers & Pages** for the correct owner and repository. Confirm your GitHub user has authorised the app, and obtain organisation approval if required. |
| A build cannot find package.json or reports a Worker name mismatch | Set the root directory to the folder containing `wrangler.jsonc` and set the dashboard Worker name to `greedy-pig`. Check the lockfile is committed and Node 24 was selected. |
| A deploy reports a missing class or a free-plan storage error | Check the Worker class export, Durable Object binding and SQLite class declaration in the checked-in configuration match. Use the project's local Wrangler through `npx`, run a full deploy and inspect the first error in the log. |
| Page loads but game creation fails | Use the production URL shown under Domains & Routes. Check the Worker bindings, live error log and account quotas while creating a new room. |
| School devices can load the page but cannot join or stay connected | Compare the same URL on a mobile hotspot. If only the school connection fails, give IT the exact production hostname and ask them to check HTTPS and secure WebSocket upgrades over port 443. |
| A QR code opens an unreachable address | Create the room on the public HTTPS address. A QR generated on localhost points each phone back at itself. |
| The teacher returns without controls | Reopen the room in the same browser profile on the device used to create it. Clearing its site data removes the private session. If you have lost it, create a new game. |
