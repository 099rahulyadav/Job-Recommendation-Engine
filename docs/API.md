# Job Match API Documentation

## Overview

The Job Match API creates candidate and job records and returns explainable, rule-based recommendations. Data is stored in memory and is lost whenever the API process restarts.

Base URL when running locally:

```text
http://localhost:3000
```

Interactive tooling can import the machine-readable [OpenAPI specification](./openapi.yaml).

## Conventions

- Request and response bodies use JSON.
- Send `Content-Type: application/json` with `POST` requests.
- Salaries are non-negative numbers. The API assumes both sides use the same currency and pay period.
- Years of experience may be an integer or decimal and cannot be negative.
- Skills and locations are matched case-insensitively after surrounding whitespace is removed.
- Create requests may supply an `id`. When omitted, the API generates a UUID.
- Supplying an existing ID replaces that record in the in-memory repository.
- Recommendation scores range from 0 to 100 and are rounded to two decimal places.
- No authentication is required.

## Quick start

Start the development server:

```bash
npm install
npm run dev
```

Check that it is ready:

```bash
curl http://localhost:3000/health
```

## Data models

### Candidate

| Field | Type | Required | Validation |
|---|---|---:|---|
| `id` | string | No on creation | Must be non-empty when supplied; generated otherwise |
| `name` | string | Yes | Must be non-empty |
| `skills` | string[] | Yes | Every entry must be non-empty; an empty array is allowed |
| `yearsOfExperience` | number | Yes | Greater than or equal to 0 |
| `location` | string | Yes | Must be non-empty |
| `expectedSalary` | number | Yes | Greater than or equal to 0 |

Duplicate candidate skills are removed during creation after whitespace is trimmed.

### Job

| Field | Type | Required | Validation |
|---|---|---:|---|
| `id` | string | No on creation | Must be non-empty when supplied; generated otherwise |
| `title` | string | Yes | Must be non-empty |
| `requiredSkills` | `SkillRequirement[]` | Yes | An empty array is allowed |
| `minYearsExperience` | number | Yes | Greater than or equal to 0 |
| `location` | string | Yes | Must be non-empty |
| `salaryRange` | object | Yes | Contains numeric `min` and `max` |
| `salaryRange.min` | number | Yes | Greater than or equal to 0 |
| `salaryRange.max` | number | Yes | Greater than or equal to `min` |
| `remoteAllowed` | boolean | Yes | `true` or `false` |

### SkillRequirement

| Field | Type | Required | Validation |
|---|---|---:|---|
| `name` | string | Yes | Must be non-empty |
| `type` | string | Yes | `must-have` or `nice-to-have` |

### ScoreBreakdownItem

| Field | Type | Meaning |
|---|---|---|
| `score` | number | Points earned for the dimension |
| `max` | number | Maximum points available under the active weights |
| `detail` | string | Human-readable reason for the score |

## Endpoints

### Health check

```http
GET /health
```

Successful response: `200 OK`

```json
{
  "status": "ok"
}
```

---

### Create a candidate

```http
POST /candidates
Content-Type: application/json
```

Request body:

```json
{
  "name": "Asha Sharma",
  "skills": ["TypeScript", "Node.js", "SQL"],
  "yearsOfExperience": 3,
  "location": "Bengaluru",
  "expectedSalary": 1500000
}
```

Example request:

```bash
curl -X POST http://localhost:3000/candidates \
  -H "Content-Type: application/json" \
  -d '{
    "id": "candidate-1",
    "name": "Asha Sharma",
    "skills": ["TypeScript", "Node.js", "SQL"],
    "yearsOfExperience": 3,
    "location": "Bengaluru",
    "expectedSalary": 1500000
  }'
```

Successful response: `201 Created`

```json
{
  "id": "candidate-1",
  "name": "Asha Sharma",
  "skills": ["TypeScript", "Node.js", "SQL"],
  "yearsOfExperience": 3,
  "location": "Bengaluru",
  "expectedSalary": 1500000
}
```

Validation failure: `400 Bad Request`

```json
{
  "error": "yearsOfExperience must be a non-negative number"
}
```

---

### Create a job

```http
POST /jobs
Content-Type: application/json
```

Request body:

```json
{
  "title": "Backend Engineer",
  "requiredSkills": [
    { "name": "TypeScript", "type": "must-have" },
    { "name": "Docker", "type": "nice-to-have" }
  ],
  "minYearsExperience": 4,
  "location": "Bengaluru",
  "salaryRange": {
    "min": 1500000,
    "max": 2000000
  },
  "remoteAllowed": false
}
```

Example request:

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "id": "job-1",
    "title": "Backend Engineer",
    "requiredSkills": [
      {"name":"TypeScript","type":"must-have"},
      {"name":"Docker","type":"nice-to-have"}
    ],
    "minYearsExperience": 4,
    "location": "Bengaluru",
    "salaryRange": {"min":1500000,"max":2000000},
    "remoteAllowed": false
  }'
```

Successful response: `201 Created`. The response is the stored job including its ID.

Validation failure: `400 Bad Request`

```json
{
  "error": "salaryRange must be non-negative and max must be greater than or equal to min"
}
```

---

### Recommend jobs for a candidate

```http
GET /candidates/:id/recommendations
```

Path parameters:

| Name | Type | Description |
|---|---|---|
| `id` | string | Candidate ID |

Query parameters:

| Name | Type | Default | Rules |
|---|---|---:|---|
| `limit` | integer | 10 | From 1 through 100 |
| `skillsWeight` | number | 50 | Non-negative; provide all four weights together |
| `experienceWeight` | number | 20 | Non-negative; provide all four weights together |
| `locationWeight` | number | 15 | Non-negative; provide all four weights together |
| `salaryWeight` | number | 15 | Non-negative; provide all four weights together |

When custom weights are supplied, all four are required and their total must be greater than zero. The values are normalized to 100, so `6,2,1,1` is equivalent to `60,20,10,10`.

Example request:

```bash
curl "http://localhost:3000/candidates/candidate-1/recommendations?limit=5"
```

Example with custom weights:

```bash
curl "http://localhost:3000/candidates/candidate-1/recommendations?limit=5&skillsWeight=60&experienceWeight=20&locationWeight=10&salaryWeight=10"
```

Successful response: `200 OK`

```json
{
  "candidateId": "candidate-1",
  "count": 1,
  "recommendations": [
    {
      "score": 78.33,
      "breakdown": {
        "skills": {
          "score": 33.33,
          "max": 50,
          "detail": "1/2 required skills matched (must-have skills count double)"
        },
        "experience": {
          "score": 15,
          "max": 20,
          "detail": "3/4 years; partial credit awarded"
        },
        "location": {
          "score": 15,
          "max": 15,
          "detail": "Exact location match"
        },
        "salary": {
          "score": 15,
          "max": 15,
          "detail": "Job minimum meets or exceeds the candidate expectation"
        }
      },
      "item": {
        "id": "job-1",
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
    }
  ]
}
```

A job missing a candidate must-have skill is completely absent from `recommendations`. Therefore, `count` may be lower than `limit`, including zero.

Candidate not found: `404 Not Found`

```json
{
  "error": "Candidate not found"
}
```

Invalid limit: `400 Bad Request`

```json
{
  "error": "limit must be an integer from 1 to 100"
}
```

Invalid weights: `400 Bad Request`

```json
{
  "error": "Provide all four non-negative weights with a total greater than zero"
}
```

---

### Recommend candidates for a job

```http
GET /jobs/:id/recommendations
```

This bonus reverse endpoint uses the same scorer and accepts the same `limit` and weight query parameters.

Example request:

```bash
curl "http://localhost:3000/jobs/job-1/recommendations?limit=10"
```

Successful response: `200 OK`

```json
{
  "jobId": "job-1",
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
      "item": {
        "id": "candidate-1",
        "name": "Asha Sharma",
        "skills": ["TypeScript", "Node.js", "SQL"],
        "yearsOfExperience": 3,
        "location": "Bengaluru",
        "expectedSalary": 1500000
      }
    }
  ]
}
```

Job not found: `404 Not Found`

```json
{
  "error": "Job not found"
}
```

## Scoring behavior

The default score is:

```text
overall = skills (maximum 50)
        + experience (maximum 20)
        + location (maximum 15)
        + salary (maximum 15)
```

Must-have skills are checked before scoring. If any are missing, the pair is excluded.

- Skills: must-have entries carry two units and nice-to-have entries carry one. Matched units are divided by total units.
- Experience: proportional credit up to the job minimum, then full credit.
- Location: exact match receives full credit, remote receives two-thirds, and mismatch receives zero.
- Salary: full credit when expectation is at or below the minimum, declining credit inside the range, and zero above the maximum.

For the full formula and reasoning, see the project [README](../README.md).

## Status-code summary

| Status | Meaning |
|---:|---|
| `200` | Successful health check or recommendation request |
| `201` | Candidate or job created |
| `400` | Request validation, limit, or weight error |
| `404` | Requested candidate or job does not exist |

## Current limitations

- No authentication or authorization
- No persistence across restarts
- No currency or salary-period conversion
- No skill alias mapping
- No geospatial location matching
- No pagination beyond the top-N `limit`
