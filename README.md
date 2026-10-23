# TraceLens

**An evidence-first debugging agent with a simulated Alexa+ conversational experience.**

Give TraceLens a public GitHub repository and a bug description (or an issue link). It collects the issue, commits and diffs from GitHub, ranks likely root-cause commits, builds a chronological investigation timeline, and drafts a reproduction test. Every claim is labelled:

| Badge | Meaning |
|---|---|
| **VERIFIED** | Observed in GitHub data, or computed directly from it (e.g. "this commit added a line that the fix later removed"). Always linked to its source. |
| **HYPOTHESIS** | A plausible explanation (rule-based or AI-written). Not proven. |
| **NOT RUN** | A test was suggested but TraceLens never executes code. It will never say a test passed. |

Built for the **Amazon Developer Hackathon 2026, Alexa+ track (simulated experience path)**. Independent project; not affiliated with Amazon or GitHub.

---

## Quick start (Windows, macOS, Linux)

Requirements: **Node.js 18 or newer** (https://nodejs.org, the LTS installer is fine). No `npm install` needed: the project has zero dependencies.

```bat
cd tracelens
copy .env.example .env
notepad .env
node server.js
```

Then open **http://localhost:3000** and click **▶ Run the demo**.

On macOS/Linux use `cp .env.example .env` instead of `copy`. `npm start` also works.

### Environment variables

Set these in `.env` (never commit that file).

| Variable | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | Strongly recommended | Raises GitHub's limit from 60 to 5,000 requests/hour and lets TraceLens read more diffs per investigation (40 instead of 14). Create one at https://github.com/settings/tokens; read-only access to public repos is enough. |
| `ANTHROPIC_API_KEY` | Optional | Enables AI-written hypotheses, always labelled "AI-generated · unverified". Without it TraceLens uses deterministic rule-based hypotheses; everything else is identical. |
| `ANTHROPIC_MODEL` | Optional | Model for hypotheses (default `claude-sonnet-5-5`). |
| `PORT` | Optional | Web server port (default `3000`). |
| `GITHUB_API_URL` | Testing only | Point at a fake GitHub API. Leave blank normally. |

Your keys stay on your machine: the server reads them from `.env` and the browser never sees them.

---

## Using it

Talk to it like an assistant (typing, or the 🎤 button in Chrome/Edge). The "Alexa," prefix is optional and ignored.

* `Alexa, investigate https://github.com/owner/repo` → it asks for the bug description
* Paste an **issue URL** (`.../issues/123`) → it fetches the issue text itself
* `run the demo` · `why is number 1 first` · `show timeline` · `show the repro test` · `read it aloud` · `new investigation`
* Toggle **Speak replies aloud** to hear answers (browser speech synthesis).

The **Evidence board** has four tabs: Suspects (ranked, with evidence and hypotheses), Timeline, Repro test, and Evidence ledger (counts of verified facts vs hypotheses vs tests run, plus what was collected).

---

## How the investigation works

1. **Collect**: repo metadata, issue body and comments, the issue timeline, and the repository file tree via the GitHub REST API.
2. **Find the fix** (when the issue is closed): a closing commit or a merged PR cross-referenced on the issue timeline. PRs that say "fixes #N" rank first. This gives TraceLens ground truth about *what code was wrong*.
3. **Extract clues** from the report: file names, stack frames, error types, identifiers, code blocks, version numbers. File names are resolved against the repo tree. Versions flagged as "worked in X" narrow the search window using GitHub releases.
4. **Walk history**: pull recent commits for the relevant files (before the fix, after the last known-good release), read their diffs.
5. **Score suspects** from verified signals:
   * **Provenance (strongest)**: the commit *added* lines that the fix later *removed*
   * touches the same files as the fix / files named in the report
   * its diff mentions identifiers from the report
   * commit message shares terms with the report
   * committed shortly before the issue was opened
   * penalties for docs/bump/lint-only commits
6. **Hypotheses**: one short, hedged explanation per suspect, labelled unverified.
7. **Repro test**: built from a code block in the issue (pytest for Python repos, `node:test` for JS). If none exists you get a clearly marked skeleton. Status is always **NOT RUN**.

If there is **no linked fix**, TraceLens falls back to symptom-only ranking and says so: the ranking is weaker and is shown as such.

### Honesty rules built into the code

* The scores are heuristics for ordering leads. They are **not probabilities** and the UI says so.
* TraceLens never executes repository code or the generated test. `testsRun` and `testsPassed` are always `0`.
* You can record the result of running the test yourself; it is displayed as **USER-REPORTED**.
* Tests assert these properties (`npm test`).

### Known limitations

* Provenance matching needs exact line matches; renames, reformatting or squashed history can hide the true origin. A suspect with no provenance is shown as a weaker lead.
* Only a bounded number of diffs are read per investigation (14 without a token, 40 with one). Very old origins may fall outside the window; the Evidence ledger shows exactly what was covered.
* Public repositories only. Python and JavaScript get runnable repro tests; other languages get a skeleton.
* Voice input/output relies on the browser's Web Speech APIs (best in Chrome/Edge).
* This is a **simulated** Alexa+ experience in a web app, not an Alexa skill, device integration, or MCP server.

---

## Tests

```bat
npm test
```

Runs 9 offline checks against a local fake GitHub API (`test/mock-github.js`): URL parsing, clue extraction, that the commit which introduced the later-removed lines ranks first, that maintenance commits don't, that no test is ever reported as run/passed, hypothesis labelling, repro generation, timeline ordering, and error handling. These tests show the engine logic is right; they are not a substitute for trying live repositories.

## Project structure

```
server.js            Zero-dependency HTTP server, streams progress as NDJSON
lib/github.js        GitHub REST client (rate-limit aware, cached, counts calls)
lib/signals.js       Extracts files, errors, identifiers, versions, snippets from text
lib/analyze.js       Evidence collection, fix detection, provenance + scoring, timeline
lib/llm.js           Optional AI hypotheses; deterministic fallback
lib/repro.js         Reproduction-test generator (never executes anything)
public/              Conversational UI (index.html, styles.css, app.js)
test/                Offline tests with a mock GitHub API
docs/DEMO.md         Demo flow and video script
docs/SUBMISSION.md   Alexa+ track mapping and remaining hackathon requirements
```

## License

MIT, see [LICENSE](LICENSE).
