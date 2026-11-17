# Run Greedy Pig with your class

You need the deployed HTTPS game address, a teacher laptop and a browser on each student device. Bookmark the public home page for future lessons. For a first rehearsal on one computer, follow the [local quick start](README.md).

## Before students arrive

1. On the teacher laptop, open the game in your usual browser profile. Under **Host a game**, select **Create room**. In the lobby's **Game settings**, choose **Rounds** (1–20) and **Death number** (1–6). Select **Save settings** if you change either value. Five rounds and a death number of 1 give the traditional game. Settings lock when you start the first round.
2. Connect your projector and select **Projector mode**. Students open the projected website on their computers and enter the six-digit room code. To share a link with the code filled in, select **Copy join link** on the teacher screen. Each student enters a nickname and selects **Join game**. Māori macrons are supported. Choose nicknames the class can recognise without supplying full names.
3. Compare the **online / joined** count and class roster with the students present. Nicknames must be unique within the room. The game screens typed nicknames with a built-in word filter. Ask a student whose nickname is rejected to try another. The filter can miss a joke or a name used to target someone. To remove an entry, choose **Manage**, select the cross beside the nickname, then confirm **Remove player**. This removes their score and ends access to that player session.
4. Select **Start game** when everyone is ready. Tell students they get one decision to bank per round, then they sit out until the next round.

## Play a round

For timed play, tick **Auto-roll every 5 seconds and start new rounds** in the lobby, or tick **Auto-roll** in the top bar during play. Everyone sees the countdown. Each round starts with a full five seconds, and banking stays open until the deadline. Pause stops the clock; resuming gives everyone a fresh five seconds. Start the first round yourself. After a bust or when everyone banks, the next round starts automatically after five seconds. Untick auto-roll during that countdown to hold the class between rounds.

1. Select **Roll die**. The first two rolls of the whole game are equally likely to show any number from 2 to 6. From the third roll, all six faces are equally likely. A custom death number from 2 to 6 can still end a round on an opening roll. Every face other than the death number adds its value to the shared pot. For example, if you set the death number to 6, rolling a 1 earns one point. Each active student's screen shows the current offer.
2. Give the class time to decide. A student who taps **Save** collects the entire displayed pot once. Their total updates immediately when the room accepts the bank. Everyone else can still choose for themselves.
3. Roll again when ready. When the die shows the **death number**, everyone still active earns zero for this round. Previous banked points are safe. The round also ends as soon as everyone has banked.
4. In manual mode, select **Start next round**. Everyone on the roster starts active again with a fresh pot and keeps their accumulated total.

With the default death number of 1, rolls of 4 and 3 give a pot of 7. Maia banks and adds 7 to her total. Hemi stays in. If the next roll is a 1, Hemi earns 0 this round and Maia keeps her 7.

**If a bank and a roll arrive together**, the room uses the order it receives them. Once a new roll has been processed, a tap sent for the previous pot is too late. Students can check their banked total before the next roll. Pause during a Wi-Fi interruption if you want everyone to have the same opportunity. While paused, rolling and banking are closed.

The projected board shows the last die, the points students can save, and the next roll or round. The scoreboard shows the top three students. Select **View all** for the full class, including tied ranks. Open **Teacher controls** to pause play, review roll history, or switch to fullscreen projector mode.

## Finish or start another class

The game finishes when its last round ends. The leaderboard ranks students by banked points across all rounds. Students with equal scores share their place, including first. If you open **Teacher controls**, select **Finish game early** and confirm, only points already banked count. Give the class time to read the results. Rooms expire 24 hours after creation. If you need a record of the results, take it before the room expires.

For another class, select **New game**, create a fresh room and show its new code. The new roster begins empty and everyone's starting score is zero.

## Recover a session

| Situation | What to do |
| --- | --- |
| A student loses Wi-Fi or refreshes | Leave their roster entry in place. Restore Wi-Fi and return to the same room on the same device and browser profile. The game reconnects and retrieves their actual score and round status. |
| An offline student is still active | Their place and previously banked points stay in the room. You can pause to let them reconnect or keep rolling. The death number ends the round for all active players, including those offline. |
| A new student arrives mid-round | At the end of the round, open **Teacher controls** and expand **Join this room**. Show the room code before starting the next round. They begin with zero points. |
| A student sees “nickname is taken” | If returning, reopen their original room in the same browser. For a new player, choose a different nickname. Clearing browser data or changing profiles loses access to the previous identity. |
| The teacher tab closes | Reopen the room address from browser history in the same profile on the teacher laptop. The saved room session restores teacher controls. If its site data has been cleared or a private session has ended, create a new room for the class. |
| The page loads but the board stays disconnected | Compare the public website on another network. Ask school IT to allow secure WebSocket connections to the deployed hostname on port 443. |

The code is for sharing with the class. The teacher's authority comes from their browser's private session. The lobby and leaderboard display nicknames to participants, so give students a chance to choose a classroom-appropriate name before joining.

## Quiet Mode

In the teacher lobby, tick **Quiet Mode** to start with 20 rounds. You can set the total from 1 to 100, then save your settings. Click **Start microphone** on the teacher laptop and grant browser permission. Use the lobby's **Room noise** reading to check the input before starting. Students never need microphone access.

Keep the teacher tab visible. During active play, louder sound fills the round-loss meter faster. At maximum level it takes about 20 continuous seconds to fill; quiet drains it. The threshold depends on the laptop microphone. At 100%, everyone sees the total drop by one. The current round and banked scores are protected. Pausing or going between rounds holds the meter. Stop the microphone to clear it, and restart it after refreshing the teacher tab. Only a threshold event goes to the server. Audio stays in the browser.

After a noise penalty, the teacher sees an **Earn back** timer. Keep the volume at or below the selected acceptable noise limit for 20 continuous seconds during active play to restore all missing rounds. Louder sound, a break between rounds, a pause or interrupted monitoring resets the streak. A game that started with 20 rounds can return to 20, even after several penalties. The same rule uses your chosen starting total if you changed it in the lobby.

Open **Microphone settings** in the lobby, or **Teacher controls** during play. Move **Top of thermometer** right if normal chatter reaches 100% too easily. **Acceptable limit** sets the line where noise starts filling the round-loss meter. It defaults to 50%. Your browser remembers both settings. After a death roll, the loss meter holds for five seconds, even if the next round starts immediately.
