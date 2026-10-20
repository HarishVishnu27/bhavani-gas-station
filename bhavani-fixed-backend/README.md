# Bhavani Agencies — Backend API

Node.js + Express + MongoDB backend implementing the full cylinder inventory
workflow we worked out (opening/closing stock, load received, empties-to-lorry,
surrender entries, the issue/return accept workflow, per-guy daily reports with
multi-source lines, and the auto-computed reports).

## 1. Prerequisites on your VM

- Node.js 18+ and npm
- MongoDB 6+ running **as a single-node replica set** (required because the
  issue/return accept logic uses a multi-document transaction to keep stock
  balances and daily reports consistent). A plain standalone `mongod` does
  NOT support transactions.

  To turn a normal MongoDB install into a single-node replica set:
  ```bash
  # in mongod.conf, add:
  #   replication:
  #     replSetName: rs0
  sudo systemctl restart mongod
  mongosh --eval "rs.initiate()"
  ```

## 2. Install & configure

```bash
cd backend
npm install
cp .env.example .env
# edit .env: set MONGO_URI (if not localhost), and set a real JWT_SECRET
```

## 3. Seed the database (cylinder types, Godown/Van, and the sample users)

```bash
npm run seed
```

This creates:
- 9 cylinder types (14.2 KG, 10 KG, 19 KG, 19 KG Xtra, 19 KG Nanocut, 47.5 KG,
  5 KG Domestic, 5 KG FTL, 2 KG FTL)
- Godown and Van stock locations (starting at 0 - set real opening stock via
  the API, see below)
- 5 sample users, **every password is `pass`**:

  | username     | role       |
  |--------------|------------|
  | owner        | owner      |
  | supervisor   | supervisor |
  | van          | van        |
  | ravikumar    | delivery   |
  | pari         | delivery   |

  Everyone can change their own password any time via
  `POST /api/auth/change-password`. The owner can add more delivery guys
  later via `POST /api/users` (new users also default to password `pass`),
  and can reset anyone's forgotten password back to `pass` via
  `POST /api/users/:id/reset-password`.

## 4. Run it

```bash
npm start        # production
npm run dev       # auto-restart on changes (nodemon)
```

Server listens on `PORT` from `.env` (default 4000), on `0.0.0.0` so phones on
the same network/VPN can reach it at `http://<your-vm-ip>:4000`.

Health check: `GET /api/health`

## 5. Smoke-test the whole workflow with curl

This walks through the exact scenario we discussed: yesterday's closing 10,
today's load received 100 → opening 110, issue 10 each to 5 guys, 60 to the
van, one guy sells out and tops up from the van.

```bash
BASE=http://localhost:4000/api

# --- login as supervisor ---
TOKEN_SUP=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"supervisor","password":"pass"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

# --- get a cylinder type id (14.2 KG) ---
TYPE_ID=$(curl -s $BASE/cylinder-types -H "Authorization: Bearer $TOKEN_SUP" \
  | python3 -c "import sys,json;print([t['_id'] for t in json.load(sys.stdin) if t['code']=='14_2KG'][0])")

# --- set yesterday's closing = today's opening stock (one-time setup) ---
curl -s -X POST $BASE/stock-locations/opening-stock -H "Authorization: Bearer $TOKEN_SUP" -H 'Content-Type: application/json' \
  -d "{\"locationType\":\"GODOWN\",\"cylinderType\":\"$TYPE_ID\",\"filled\":10,\"empty\":10,\"defect\":10}"

# --- load received: 100 ---
curl -s -X POST $BASE/load-received -H "Authorization: Bearer $TOKEN_SUP" -H 'Content-Type: application/json' \
  -d "{\"cylinderType\":\"$TYPE_ID\",\"filled\":100}"

# --- check Godown balance: should show filled 110 ---
curl -s $BASE/stock-locations -H "Authorization: Bearer $TOKEN_SUP"

# --- issue 10 to ravikumar ---
RAVI_ID=$(curl -s $BASE/users -H "Authorization: Bearer $TOKEN_SUP" | python3 -c "import sys,json;print([u['_id'] for u in json.load(sys.stdin) if u['username']=='ravikumar'][0])")
REQ_ID=$(curl -s -X POST $BASE/stock-requests -H "Authorization: Bearer $TOKEN_SUP" -H 'Content-Type: application/json' \
  -d "{\"type\":\"ISSUE\",\"cylinderType\":\"$TYPE_ID\",\"filled\":10,\"to\":{\"kind\":\"USER\",\"user\":\"$RAVI_ID\"}}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['_id'])")

# --- ravikumar logs in and accepts it ---
TOKEN_RAVI=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"ravikumar","password":"pass"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -X POST $BASE/stock-requests/$REQ_ID/accept -H "Authorization: Bearer $TOKEN_RAVI"

# --- Godown filled should now read 100 (110 - 10) ---
curl -s $BASE/stock-locations -H "Authorization: Bearer $TOKEN_SUP"

# ... repeat the issue+accept for the other 4 guys (10 each) and for the van (60) ...

# --- ravikumar delivers all 10, logs it against his daily line ---
TODAY=$(date +%F)
LINE_ID=$(curl -s "$BASE/daily-lines?date=$TODAY" -H "Authorization: Bearer $TOKEN_RAVI" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['lines'][0]['_id'])")
curl -s -X PATCH $BASE/daily-lines/$LINE_ID -H "Authorization: Bearer $TOKEN_RAVI" -H 'Content-Type: application/json' \
  -d '{"delivered":10}'

# --- ravikumar then requests more stock from the Van instead of Godown ---
curl -s -X POST $BASE/stock-requests -H "Authorization: Bearer $TOKEN_RAVI" -H 'Content-Type: application/json' \
  -d "{\"type\":\"ISSUE\",\"cylinderType\":\"$TYPE_ID\",\"filled\":10,\"to\":{\"kind\":\"USER\",\"user\":\"$RAVI_ID\"}}"
# (NOTE: the van user raises+the-issue in practice - this line is illustrative;
# see API reference below for who raises what)

# --- reports ---
curl -s "$BASE/reports/consolidated?date=$TODAY" -H "Authorization: Bearer $TOKEN_SUP"
curl -s "$BASE/reports/overall-delivery?date=$TODAY" -H "Authorization: Bearer $TOKEN_SUP"
curl -s "$BASE/reports/reconciliation?date=$TODAY" -H "Authorization: Bearer $TOKEN_SUP"
```

## 6. API reference (summary)

| Method & path | Who | What |
|---|---|---|
| POST /api/auth/login | anyone | `{username,password}` → token |
| POST /api/auth/change-password | logged in | `{currentPassword,newPassword}` |
| GET /api/auth/me | logged in | current user info |
| GET /api/users | owner, supervisor | list all users |
| POST /api/users | owner | create a user (defaults to password `pass`) |
| POST /api/users/:id/reset-password | owner, supervisor | reset someone's password to `pass` |
| GET /api/cylinder-types | logged in | the 9 cylinder types |
| GET /api/stock-locations | logged in | live Godown & Van balances |
| POST /api/stock-locations/opening-stock | owner, supervisor | one-time/corrective balance set |
| POST /api/load-received | owner, supervisor | log filled stock arriving from the lorry |
| POST /api/empties-to-lorry | owner, supervisor | log empties/defects handed to the outbound lorry |
| POST /api/surrender-entry | owner, supervisor | log a customer walking in to surrender a cylinder |
| POST /api/stock-requests | supervisor/van (ISSUE), delivery/van (RETURN) | raise an issue or return |
| GET /api/stock-requests?status=PENDING | logged in | requests relevant to you |
| POST /api/stock-requests/:id/accept | the intended recipient | confirms physical hand-off |
| POST /api/stock-requests/:id/reject | the intended recipient | disputes it |
| GET /api/daily-lines?date= | delivery/van (own), owner/supervisor (`?guy=`) | today's line items + computed total, grouped by cylinder type |
| PATCH /api/daily-lines/:id | delivery/van (own line) | update delivered/nc/emptyCollected/defectCollected |
| GET /api/reports/overall-delivery?date= | logged in | auto-summed across all guys + van |
| GET /api/reports/consolidated?date= | logged in | the master daily summary |
| GET /api/reports/van-distribution?date= | logged in | what the Van gave to each guy |
| GET /api/reports/reconciliation?date= | owner, supervisor | per-guy mismatches |

## 7. Notes

- Every "accept" is the point where stock actually moves and reports update —
  nothing posts until the receiving side confirms, per the two-way workflow.
- A delivery guy's Filled Balance/Empty Balance zero out automatically when
  their end-of-day RETURN request is accepted (no manual reset needed) — but
  "Returned" can also be entered/corrected directly on their own daily line.
- Empty Balance = Received - (Empty+Defect) - NC - Return, matching the Excel
  Template sheet exactly (not just Empty+Defect) — this is why it should equal
  Filled Balance at day end once every delivered cylinder is accounted for.
- "Empties Given to Lorry" IS the Excel's "Emty Return" sheet — the only thing
  that reduces Empty/Defect stock in the Consolidated Report. There is no
  separate "Godown Returns" concept; it's checked against the day's running
  available empty/defect balance before being allowed (can't send more than
  what's on hand).
- Van does not fill in Delivered/NC/Empty/Defect details itself (matches the
  Excel Van sheet) — what it hands out to each delivery guy shows up on that
  guy's own report and on "Van Overview" / the Van Distribution report.
- The Consolidated Report's Opening/Closing Stock is its own day-by-day ledger
  (Opening Stock baseline + Load Received/Delivery/Empties collected/Surrender/
  Empties-to-Lorry), independent of the live Godown/Van "Stock Balances" shown
  elsewhere (which track physical custody via the issue/return accept workflow
  for operational checks, and aren't an Excel concept).
