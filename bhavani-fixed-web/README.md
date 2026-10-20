# Bhavani Agencies — Web Test Console

A plain HTML/CSS/JS page (no build step, no framework) for testing the full
business logic against the backend API before we build the mobile app.

## Run it

1. Make sure the backend is running on your VM (see `backend/README.md`) and
   reachable from wherever you open this page — e.g. `http://<vm-ip>:4000`.
2. Just open `index.html` directly in a browser (double-click it, or serve
   the folder with any static server, e.g. `npx serve web` or
   `python3 -m http.server 8080` from inside the `web` folder).
3. At the top of the page, enter the API base URL, e.g.
   `http://<vm-ip>:4000/api`, and click **Save**. It should show
   "● reachable".
4. Log in with any seeded user — password is `pass` for everyone (see the
   table in `backend/README.md`).

## What you can test, per role

- **Owner** — live stock balances, all reports, view all requests, manage
  users (create new delivery guys, reset passwords).
- **Supervisor** — opening stock setup, Load Received, Empties to Lorry,
  Surrender Entry, issue stock to a guy or bulk-transfer to the Van, accept
  returns coming back to the Godown, reports.
- **Van** — accept bulk issues from the Godown, issue stock onward to a
  delivery guy, raise its own return to the Godown, log its own
  delivered/NC/empty/defect numbers in "My Day", reports, Van Distribution.
- **Delivery guy** — accept issues (from Godown or Van), log daily numbers
  in "My Day" (one row per source batch + an auto-computed Total row, same
  layout as the Excel), raise a return (empty/defect collected + unsold
  filled stock) to either the Godown or the Van.

## Suggested test run (matches the scenario we walked through)

1. Log in as `supervisor`. Go to **Stock** → set opening stock for Godown,
   14.2 KG: filled 10, empty 10, defect 10.
2. Go to **Load Received** → log 100 filled, 14.2 KG. Check **Stock** tab:
   Godown should show filled 110.
3. Go to **Issue Stock** → issue 10 filled (14.2 KG) to Ravikumar. Repeat for
   Pari. (Add 3 more delivery guys first via **Users** if you want all 5.)
4. Issue 60 filled (14.2 KG) to "Van (bulk)".
5. Log out, log in as `ravikumar` → **Requests** tab → accept the pending
   issue. Repeat for `pari`, and log in as `van` to accept its 60.
6. Back in **Stock** as supervisor: Godown filled should now read 0.
7. As `ravikumar`: **My Day** → set Delivered = 10 for the Godown-source
   line. Then go to **Requests** and raise... actually to get MORE stock
   from the Van, log in as `van` and issue 10 to Ravikumar from the Issue
   Stock tab; log back in as `ravikumar` and accept it — you'll now see a
   second row ("VAN" source) in **My Day** for the same cylinder type.
8. Set Empty/Defect collected on his lines, then go to **Requests** and
   raise a return (to Godown or Van) for whatever's left.
9. As `owner` (or `supervisor`): **Reports** → check Consolidated, Overall
   Delivery, Van Distribution, and Reconciliation for the day.

If any of the numbers don't come out the way you expect, that's exactly
what this console is for — tell me what you see vs. what you expected and
we'll fix the logic before touching the mobile app.
