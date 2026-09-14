# Job Match API - Reference and Learning Guide

## 1. What was built

This project is a TypeScript REST API that stores candidates and jobs in memory and produces explainable recommendations. It uses a transparent rule-based scorer, not machine learning.

The main endpoints are:

- `POST /candidates` - creates a candidate profile.
- `POST /jobs` - creates a job posting.
- `GET /candidates/:id/recommendations` - ranks jobs for a candidate.
- `GET /jobs/:id/recommendations` - bonus reverse view that ranks candidates for a job.
- `GET /health` - simple health check.

Recommendation endpoints accept `limit` from 1 to 100. They also accept all four optional weight parameters: `skillsWeight`, `experienceWeight`, `locationWeight`, and `salaryWeight`.

## 2. Project structure

```text
src/types.ts       Domain and response types
src/scoring.ts     Pure score calculation and ranking
src/repository.ts  In-memory data storage
src/app.ts         Validation and HTTP routes
src/server.ts      Runtime entry point
test/              Scoring and API tests
Dockerfile         Production container build
docker-compose.yml Local container startup
README.md          Submission documentation
```

The most important design decision is keeping scoring in a pure function. It does not know anything about HTTP or storage, so it is easy to test and can later be reused with a database.

## 3. How the scoring works

The default score is out of 100:

```text
Skills     50 points
Experience 20 points
Location   15 points
Salary     15 points
```

### Must-have skill gate

Before calculating any points, the API checks every must-have skill. If the candidate is missing one, the scorer returns no result and the job never enters the recommendations.

This is a hard filter instead of a large penalty because the assignment says must-have skills are non-negotiable. A perfect salary or location score must not compensate for a missing required skill.

### Skills score

Must-have skills count as two units and nice-to-have skills count as one unit.

```text
skills score = 50 * matched skill units / total required skill units
```

After the hard filter, every must-have is already matched. Nice-to-have skills can improve the score but cannot make a candidate ineligible.

Example: one matched must-have and one missing nice-to-have gives `2 / 3 * 50 = 33.33` points.

### Experience score

```text
experience score = 20 * min(1, candidate years / minimum years)
```

A candidate with 3 years applying to a role asking for 4 years receives `3 / 4 * 20 = 15` points.

Experience is penalized rather than used as a filter because years are an imperfect proxy for ability. A person may have strong relevant depth, adjacent experience, or learn quickly. Keeping the role visible makes the tradeoff explainable.

### Location score

```text
Exact location match                     15 points
Different location but remote is allowed 10 points
Mismatch and remote is not allowed        0 points
```

An exact match is best because there is no relocation or remote-work uncertainty. Remote is still a strong match. A mismatch is not filtered because the candidate may be willing to relocate.

### Salary score

```text
Expectation <= job minimum  15 points
Expectation inside range     8 to 15 points, decreasing linearly
Expectation > job maximum    0 points
```

When the candidate's expectation is within the range, the job can afford the candidate. More headroom receives a higher score. When the advertised maximum is below the expectation, salary gets zero because there is no stated overlap.

Salary mismatch is not a hard filter. The job can still appear if it is otherwise relevant, and the breakdown clearly shows compensation as the weakness.

## 4. Worked example

Candidate:

- Skills: TypeScript, Node.js, SQL
- Experience: 3 years
- Location: Bengaluru
- Expected salary: 1,500,000

Job:

- TypeScript is must-have
- Docker is nice-to-have
- Minimum experience: 4 years
- Location: Bengaluru, remote not allowed
- Salary: 1,500,000 to 2,000,000

Result:

```text
Skills      33.33 / 50
Experience  15.00 / 20
Location    15.00 / 15
Salary      15.00 / 15
Overall     78.33 / 100
```

The missing Docker nice-to-have reduces skill points. The one-year experience gap costs five points. Location and salary are ideal.

## 5. Request flow

For create requests:

1. Fastify receives the JSON request.
2. Validation rejects missing, malformed, or negative fields with HTTP 400.
3. Text values are trimmed and duplicate candidate skills are removed.
4. The in-memory repository stores the object.
5. The API returns HTTP 201 with the created object.

For recommendations:

1. The route finds the requested candidate or job.
2. It validates `limit` and optional custom weights.
3. It loads possible matches from the repository.
4. The scorer removes pairs that fail must-have skills.
5. It calculates the four score components.
6. Results are sorted from highest to lowest score.
7. ID is used as a stable tie-breaker.
8. The top N results are returned with explanations.

## 6. Custom weights

All four weights must be supplied together. The API normalizes them to total 100, so these are equivalent:

```text
60, 20, 10, 10
6, 2, 1, 1
```

Example:

```text
GET /candidates/:id/recommendations?skillsWeight=60&experienceWeight=20&locationWeight=10&salaryWeight=10
```

Weights must be non-negative and their total must be greater than zero. Changing weights never bypasses the must-have filter.

## 7. Testing

Run:

```bash
npm test
```

The suite contains 11 tests covering:

- Missing must-have skills
- Nice-to-have partial credit
- Experience below the minimum
- Exact, remote, and mismatched locations
- No salary overlap
- Full salary fit
- Custom-weight normalization
- Sorting, hard filtering, and limit
- Candidate/job creation and recommendation flow
- Invalid limit and weight queries
- Invalid client-supplied IDs

The TypeScript compiler is checked with:

```bash
npm run build
```

At completion, all 11 tests passed, the build succeeded, and `npm audit --omit=dev` reported zero production vulnerabilities.

## 8. Running the project

Local development:

```bash
npm install
npm test
npm run dev
```

Production-style local run:

```bash
npm run build
npm start
```

Docker:

```bash
docker compose up --build
```

The API is available at `http://localhost:3000`.

## 9. Assumptions and limitations

- Salaries are in the same currency and pay period.
- Locations are normalized text, not geographic coordinates.
- Skills use exact normalized names; aliases such as `JS` and `JavaScript` are not mapped.
- Storage is in memory and resets when the API restarts.
- Reusing a supplied ID replaces the existing record.
- This is designed as a small single-process assignment, not a production distributed service.

## 10. What to improve with more time

- Add a Postgres repository and migrations while keeping the scorer unchanged.
- Add currency and pay-period conversion.
- Use canonical skill and location taxonomies.
- Add OpenAPI documentation and shared validation schemas.
- Add pagination and standard CRUD endpoints.
- Add structured logging, metrics, rate limiting, and CI.
- Add property-based tests proving that improving one input cannot lower its score.

## 11. AI tool use

An OpenAI coding assistant helped scaffold the TypeScript/Fastify structure, enumerate edge cases, draft tests, and organize documentation. Suggestions were reviewed and edited rather than accepted blindly.

Important human-controlled decisions included:

- Enforcing must-have skills before scoring
- Penalizing experience proportionally instead of excluding candidates
- Assigning zero salary points when the job maximum is below expectation
- Keeping storage honestly in memory instead of adding an unused Postgres service
- Making every formula and tradeoff visible in the response and README

The main lesson is that a recommendation system is easier to trust when another person can reproduce the score by hand and understand why an item was included or excluded.
