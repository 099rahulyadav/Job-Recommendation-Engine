import { describe, expect, it } from "vitest";
import { rankJobs, scoreMatch } from "../src/scoring.js";
import type { Candidate, Job } from "../src/types.js";

const candidate: Candidate = {
  id: "candidate-1",
  name: "Asha",
  skills: ["TypeScript", "Node.js", "SQL"],
  yearsOfExperience: 3,
  location: "Bengaluru",
  expectedSalary: 1_500_000,
};

const job: Job = {
  id: "job-1",
  title: "Backend Engineer",
  requiredSkills: [
    { name: "TypeScript", type: "must-have" },
    { name: "Docker", type: "nice-to-have" },
  ],
  minYearsExperience: 4,
  location: "Bengaluru",
  salaryRange: { min: 1_500_000, max: 2_000_000 },
  remoteAllowed: false,
};

describe("scoreMatch", () => {
  it("hard-filters a job when a must-have skill is missing", () => {
    const result = scoreMatch(candidate, {
      ...job,
      requiredSkills: [{ name: "Go", type: "must-have" }],
    });
    expect(result).toBeNull();
  });

  it("matches skills case-insensitively and gives nice-to-have partial credit", () => {
    const result = scoreMatch(candidate, job);
    expect(result?.breakdown.skills).toMatchObject({ score: 33.33, max: 50 });
  });

  it("penalizes insufficient experience without excluding the job", () => {
    const result = scoreMatch(candidate, job);
    expect(result).not.toBeNull();
    expect(result?.breakdown.experience.score).toBe(15);
    expect(result?.breakdown.experience.detail).toContain("partial credit");
  });

  it("ranks exact location above remote and remote above mismatch", () => {
    const exact = scoreMatch(candidate, job)!;
    const remote = scoreMatch(candidate, { ...job, location: "Delhi", remoteAllowed: true })!;
    const mismatch = scoreMatch(candidate, { ...job, location: "Delhi", remoteAllowed: false })!;
    expect(exact.breakdown.location.score).toBe(15);
    expect(remote.breakdown.location.score).toBe(10);
    expect(mismatch.breakdown.location.score).toBe(0);
  });

  it("scores zero when the advertised maximum is below expectation", () => {
    const result = scoreMatch(candidate, {
      ...job,
      salaryRange: { min: 900_000, max: 1_400_000 },
    });
    expect(result?.breakdown.salary.score).toBe(0);
  });

  it("scores full salary points when the job minimum meets expectation", () => {
    const result = scoreMatch(candidate, job);
    expect(result?.breakdown.salary.score).toBe(15);
  });

  it("normalizes custom weights to a 100-point total", () => {
    const result = scoreMatch(candidate, job, {
      skills: 2,
      experience: 1,
      location: 1,
      salary: 0,
    });
    expect(result?.breakdown.skills.max).toBe(50);
    expect(result?.breakdown.experience.max).toBe(25);
    expect(result?.breakdown.location.max).toBe(25);
    expect(result?.breakdown.salary.max).toBe(0);
  });
});

describe("rankJobs", () => {
  it("sorts by score, applies hard filters, and respects limit", () => {
    const jobs: Job[] = [
      { ...job, id: "lower", location: "Delhi", remoteAllowed: false },
      { ...job, id: "filtered", requiredSkills: [{ name: "Rust", type: "must-have" }] },
      { ...job, id: "higher" },
    ];
    const ranked = rankJobs(candidate, jobs, 1);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.item.id).toBe("higher");
  });
});
