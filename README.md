# Job Match API

A small, explainable rule-based API that ranks jobs for candidates (and candidates for jobs). It is intentionally not machine learning: every point in a result is traceable to a business rule.

API references: [human-readable documentation](docs/API.md) | [OpenAPI 3.1 specification](docs/openapi.yaml)

## Features

- Create candidate profiles and job postings
- Hard-filter missing must-have skills
- Return ranked, 0-100 matches with a dimension-by-dimension explanation
- Limit responses to the top N results
- Override score weights per request
- Bonus reverse view: best-fit candidates for a job
- In-memory storage for a small, dependency-light take-home solution
- Unit and API tests, plus Docker support

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm test
npm run dev
```

The API listens on `http://localhost:3000`. For a production-style local run:

```bash
npm run build
npm start
```

Health check:

```bash
curl http://localhost:3000/health
```

## Run with Docker

```bash
docker compose up --build
```

This starts the API at `http://localhost:3000`. Postgres is not included because this submission deliberately uses an in-memory repository; adding a database container without actually using it would create false complexity. Data resets whenever the process restarts.

## Deploy on Vercel

The `api/index.ts` serverless adapter exposes the same Fastify application on Vercel, while `src/server.ts` remains the local and Docker entry point.

```bash
vercel
vercel --prod
```

The repository is intentionally in-memory. On Vercel, records are scoped to a warm function instance and may disappear or differ between instances. Use a persistent database before treating the deployment as production storage.

## API

### Create a candidate

`POST /candidates`

```json
{
  "name": "Asha",
  "skills": ["TypeScript", "Node.js", "SQL"],
  "yearsOfExperience": 3,
  "location": "Bengaluru",
  "expectedSalary": 1500000
}
```

### Create a job

`POST /jobs`

```json
{
  "title": "Backend Engineer",
  "requiredSkills": [
    { "name": "TypeScript", "type": "must-have" },
    { "name": "Docker", "type": "nice-to-have" }
  ],
  "minYearsExperience": 4,
  "location": "Bengaluru",
  "salaryRange": { "min": 1500000, "max": 2000000 },
  "remoteAllowed": false
}
```

Both create endpoints accept an optional string `id`; otherwise the API generates a UUID.

### Recommend jobs to a candidate

`GET /candidates/:id/recommendations?limit=10`

The default limit is 10. Valid limits are 1-100. Each recommendation contains `score`, `breakdown`, and `item` (the job).

### Recommend candidates for a job (bonus)

`GET /jobs/:id/recommendations?limit=10`

This uses exactly the same scorer and hard filter. Each result's `item` is the candidate.

### Custom weights (bonus)

Pass all four values together; they are normalized to total 100, so ratios are also accepted:

```text
GET /candidates/:id/recommendations
  ?skillsWeight=60
  &experienceWeight=20
  &locationWeight=10
  &salaryWeight=10
```

Values must be non-negative and their total must be greater than zero.

## Scoring formula

The default score is a weighted sum:

```text
overall = skills (max 50)
        + experience (max 20)
        + location (max 15)
        + salary (max 15)
```

Scores and breakdown values are rounded to two decimal places. Matching of skill names and locations is case-insensitive and ignores surrounding whitespace.

### 1. Must-have gate, then skills: 50 points

Before scoring, every must-have skill is checked. If even one is absent, the job is removed. This is a gate, not a large penalty, because the task states that must-have requirements are non-negotiable.

For eligible jobs, must-have skills carry two units each and nice-to-have skills carry one:

```text
skills = 50 * matched skill units / total required skill units
```

All must-have units necessarily match after the gate. Nice-to-have matches add points but never control eligibility. Double-weighting must-haves keeps the skills score focused on core capability while still allowing nice-to-haves to distinguish jobs. A job with no listed skills receives full skill credit: there is no stated skill requirement the candidate fails.

### 2. Experience: 20 points

```text
experience = 20 * min(1, candidate years / minimum years)
```

A candidate meeting the minimum gets 20. Someone with 3 years for a 4-year role gets 15. I chose a proportional penalty instead of exclusion because years are a noisy proxy: relevant depth, adjacent work, and fast learning can compensate. It also follows the brief's explicit preference to score such candidates lower without hiding the opportunity entirely. A zero-year minimum gets full credit.

### 3. Location: 15 points

```text
exact location                         = 15
different location, remote allowed    = 10
different location, remote disallowed =  0
```

An exact match earns the most because it introduces no relocation or remote-work uncertainty. Remote remains a strong fit, but gets two-thirds of the points. A mismatch is not a hard filter because a candidate might relocate.

### 4. Salary: 15 points

```text
expectation <= job minimum             = 15
expectation inside range               = 8 to 15, linear
expectation > job maximum              = 0
```

Inside the range, the score is highest at the minimum and gradually falls to 8 at the maximum. This rewards comfortable headroom while keeping any offerable salary a meaningful match. If the job maximum cannot meet the expectation, salary receives zero as requested; the job can still appear if its other dimensions are strong, making the tradeoff visible rather than silently filtering it.

### Why these weights?

Skills receive half the score because they most directly determine whether the person can do the work, and must-haves are separately enforced. Experience gets 20 because it is informative but imprecise. Location and salary get 15 each: both strongly affect acceptance, but neither proves job capability. The split also makes explanations intuitive: a candidate can see whether a lower result comes from readiness, logistics, or compensation.

## Example response

```json
{
  "candidateId": "candidate-1",
  "count": 1,
  "recommendations": [
    {
      "score": 78.33,
      "breakdown": {
        "skills": { "score": 33.33, "max": 50, "detail": "1/2 required skills matched (must-have skills count double)" },
        "experience": { "score": 15, "max": 20, "detail": "3/4 years; partial credit awarded" },
        "location": { "score": 15, "max": 15, "detail": "Exact location match" },
        "salary": { "score": 15, "max": 15, "detail": "Job minimum meets or exceeds the candidate expectation" }
      },
      "item": { "id": "job-1", "title": "Backend Engineer" }
    }
  ]
}
```

## Tests

```bash
npm test
```

The tests prioritize scoring risks: missing must-haves, nice-to-have partial credit, experience shortfall, the three location levels, no salary overlap, full salary fit, custom-weight normalization, ordering, hard-filter behavior in ranking, limit handling, and the create/recommend API flow.

## Assumptions

- Salaries use the same currency and time basis. A production API should include currency and pay period and normalize them before scoring.
- Locations are simple labels. Production matching should use canonical place IDs, distance, time zones, and explicit relocation preferences.
- Skills are compared by normalized exact name. A production system should use a curated taxonomy for aliases such as `JS` and `JavaScript`.
- Duplicate skill strings on candidates are removed; each job requirement is expected to be unique.
- In-memory storage is suitable for the assignment demo, not a multi-instance deployment.
- Reusing a supplied ID replaces the existing in-memory record. A production implementation should reject conflicts or expose an explicit update endpoint.

## What I would do with more time

- Add Postgres with migrations and a repository implementation, keeping the scorer pure.
- Publish an OpenAPI document and generate request/response schemas from one source of truth.
- Add pagination and create/list/get/update/delete resource endpoints.
- Add currency, pay period, geospatial location, relocation preference, skill proficiency, and recency.
- Add property-based tests for monotonicity (for example, gaining a nice-to-have must never lower a score).
- Add rate limiting, structured logs, metrics, and CI for lint/build/test/container checks.

## AI tool use

I used an OpenAI coding assistant to help scaffold the TypeScript/Fastify structure, enumerate edge cases, draft tests, and prepare documentation. I reviewed and edited the result rather than accepting suggestions blindly. In particular, I kept must-have skills as a true pre-score gate, selected a proportional experience penalty rather than exclusion, changed salary logic to zero when the advertised maximum is below expectation, kept storage honestly in-memory instead of adding an unused Postgres container, and documented the tradeoffs and formulas explicitly. Tests and a TypeScript build were run locally to verify the final implementation.
