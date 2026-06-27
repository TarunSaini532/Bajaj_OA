# Hierarchy Resolver — BFHL Challenge

A REST API + frontend that parses `Parent->Child` edge lists, validates and
deduplicates them, resolves multi-parent conflicts, builds hierarchy trees,
and detects cycles.

Built for the Chitkara Full Stack Engineering Challenge (Round 1).

## Stack

- **Backend:** Node.js, Express, CORS
- **Frontend:** Plain HTML/CSS/JS (no build step, no framework dependency)

## Project structure

```
backend/
  src/
    processHierarchy.js  # pure, framework-free core algorithm
    server.js             # Express app + /bfhl route
  test_manual.js          # manual test harness against spec examples
  package.json
frontend/
  index.html               # single-file UI (input, run, results)
render.yaml                # Render deployment config (backend)
vercel.json                # Vercel deployment config (frontend)
```

## Running locally

### Backend

```bash
cd backend
npm install
npm start
# Server runs on http://localhost:3000
```

Run the algorithm's manual test suite (validates against the spec's exact
example plus edge cases — diamonds, cycles, tie-breaks):

```bash
cd backend
npm test
```

### Frontend

Just open `frontend/index.html` in a browser, or serve it:

```bash
cd frontend
python3 -m http.server 8080
# visit http://localhost:8080
```

Set the **API base URL** field in the page (collapsible "API base URL"
section under the input box) to point at your running backend
— defaults to `http://localhost:3000` for local dev.

## API

### `POST /bfhl`

**Request**

```json
{ "data": ["A->B", "A->C", "B->D"] }
```

**Response**

```json
{
  "user_id": "tarunsaini_08092005",
  "email_id": "tarun0905.be23@chitkara.edu.in",
  "college_roll_number": "2310990905",
  "hierarchies": [
    { "root": "A", "tree": { "A": { "B": {}, "C": { "D": {} } } }, "depth": 3 }
  ],
  "invalid_entries": [],
  "duplicate_edges": [],
  "summary": { "total_trees": 1, "total_cycles": 0, "largest_tree_root": "A" }
}
```

### Processing rules implemented

- **Validation:** entries are trimmed, then matched against `^[A-Z]->[A-Z]$`.
  Self-loops (`A->A`) are explicitly rejected even though they match the
  pattern. Anything else is pushed to `invalid_entries`.
- **Duplicates:** first occurrence of an edge is used for tree construction;
  every distinct repeated edge is pushed to `duplicate_edges` exactly once,
  regardless of how many times it repeats.
- **Diamonds / multi-parent:** if a child node is targeted by more than one
  edge, the first-encountered parent edge wins; later edges for that child
  are silently discarded before tree construction.
- **Cycle detection:** edges are grouped into connected components. Each
  component is checked for a directed cycle. If found, the whole component
  is reported as `{ "tree": {}, "has_cycle": true }`, with the root chosen
  as the lexicographically smallest node in the component (since a cyclic
  group has no unambiguous root).
- **Depth:** counted in nodes (not edges) along the longest root-to-leaf
  path, e.g. `A->B->C` → depth `3`.
- **Summary tie-break:** `largest_tree_root` ties on depth are broken by
  lexicographically smaller root.

## Deployment (Render — one dashboard, two services)

Both the backend and frontend deploy from the same repo on Render, defined
in the single `render.yaml` at the project root.

1. Push this repo to a **public** GitHub repo.
2. On [Render](https://render.com), choose **New → Blueprint** and point it
   at the repo. Render reads `render.yaml` and provisions two services:
   - `bfhl-backend` — a Node web service (root: `backend`, build:
     `npm install`, start: `npm start`)
   - `bfhl-frontend` — a static site (root: `frontend`, serves
     `index.html` directly)
3. Once both are live, copy the `bfhl-backend` URL (something like
   `https://bfhl-backend-xxxx.onrender.com`).
4. Open the `bfhl-frontend` URL, paste the backend URL into the **API base
   URL** field (it's open by default), and click **Run /bfhl →** with the
   pre-filled spec example to confirm everything's wired up correctly.
   - The field is saved automatically (browser local storage) so you don't
     need to retype it on future visits.
   - You can also deep-link directly with the URL pre-filled:
     `<frontend-url>/?api=<backend-url>`
5. The evaluator will call `<bfhl-backend-url>/bfhl` directly — submit that
   URL, the frontend URL, and the repo URL in the submission form.

**Free-tier note:** Render's free services spin down after inactivity. The
first request after idling can take 30-60 seconds to wake the service back
up — the frontend's error banner will mention this if a request times out,
so just retry once after a short wait. If the evaluator's grading window is
tight, consider hitting your own `/bfhl` once a few minutes before
submitting, to keep the service warm.

## Notes

- CORS is enabled for all origins on the backend, since the evaluator calls
  the API from a different origin.
- The backend never throws an unhandled error back to the client — malformed
  or missing `data` fields degrade to an empty result set rather than a
  500/crash.
- The core algorithm (`processHierarchy.js`) has zero dependencies on Express
  or any I/O, so it can be tested in isolation (see `test_manual.js`).
