import type {
  Candidate,
  Job,
  MatchResult,
  ScoreBreakdown,
  ScoreWeights,
} from "./types.js";

export const DEFAULT_WEIGHTS: ScoreWeights = {
  skills: 50,
  experience: 20,
  location: 15,
  salary: 15,
};

const round = (value: number) => Math.round(value * 100) / 100;
const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function normalizeWeights(weights: ScoreWeights): ScoreWeights {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total <= 0 || Object.values(weights).some((value) => value < 0)) {
    throw new Error("Weights must be non-negative and have a total greater than zero");
  }
  return {
    skills: (weights.skills / total) * 100,
    experience: (weights.experience / total) * 100,
    location: (weights.location / total) * 100,
    salary: (weights.salary / total) * 100,
  };
}

export function scoreMatch(
  candidate: Candidate,
  job: Job,
  inputWeights: ScoreWeights = DEFAULT_WEIGHTS,
): MatchResult<Job> | null {
  const weights = normalizeWeights(inputWeights);
  const candidateSkills = new Set(candidate.skills.map(normalize));
  const mustHave = job.requiredSkills.filter((skill) => skill.type === "must-have");
  const missingMustHave = mustHave.filter(
    (skill) => !candidateSkills.has(normalize(skill.name)),
  );

  if (missingMustHave.length > 0) return null;

  const matchedSkills = job.requiredSkills.filter((skill) =>
    candidateSkills.has(normalize(skill.name)),
  );
  const weightedRequired = job.requiredSkills.reduce(
    (sum, skill) => sum + (skill.type === "must-have" ? 2 : 1),
    0,
  );
  const weightedMatched = matchedSkills.reduce(
    (sum, skill) => sum + (skill.type === "must-have" ? 2 : 1),
    0,
  );
  const skillRatio = weightedRequired === 0 ? 1 : weightedMatched / weightedRequired;
  const skillsScore = weights.skills * skillRatio;

  const experienceRatio =
    job.minYearsExperience === 0
      ? 1
      : Math.min(1, candidate.yearsOfExperience / job.minYearsExperience);
  const experienceScore = weights.experience * experienceRatio;

  const sameLocation = normalize(candidate.location) === normalize(job.location);
  const locationRatio = sameLocation ? 1 : job.remoteAllowed ? 2 / 3 : 0;
  const locationScore = weights.location * locationRatio;

  let salaryRatio = 0;
  let salaryDetail: string;
  if (candidate.expectedSalary <= job.salaryRange.min) {
    salaryRatio = 1;
    salaryDetail = "Job minimum meets or exceeds the candidate expectation";
  } else if (candidate.expectedSalary <= job.salaryRange.max) {
    const width = job.salaryRange.max - job.salaryRange.min;
    salaryRatio = width === 0 ? 1 : 0.53 + 0.47 * ((job.salaryRange.max - candidate.expectedSalary) / width);
    salaryDetail = "Expectation is within the advertised range";
  } else {
    salaryDetail = "Job maximum is below the candidate expectation";
  }
  const salaryScore = weights.salary * salaryRatio;

  const breakdown: ScoreBreakdown = {
    skills: {
      score: round(skillsScore),
      max: round(weights.skills),
      detail:
        job.requiredSkills.length === 0
          ? "No skills were required"
          : `${matchedSkills.length}/${job.requiredSkills.length} required skills matched (must-have skills count double)`,
    },
    experience: {
      score: round(experienceScore),
      max: round(weights.experience),
      detail:
        candidate.yearsOfExperience >= job.minYearsExperience
          ? "Meets or exceeds minimum experience"
          : `${candidate.yearsOfExperience}/${job.minYearsExperience} years; partial credit awarded`,
    },
    location: {
      score: round(locationScore),
      max: round(weights.location),
      detail: sameLocation
        ? "Exact location match"
        : job.remoteAllowed
          ? "Location differs, but remote work is allowed"
          : "Location mismatch and remote work is not allowed",
    },
    salary: {
      score: round(salaryScore),
      max: round(weights.salary),
      detail: salaryDetail,
    },
  };

  return {
    score: round(
      breakdown.skills.score +
        breakdown.experience.score +
        breakdown.location.score +
        breakdown.salary.score,
    ),
    breakdown,
    item: job,
  };
}

export function rankJobs(
  candidate: Candidate,
  jobs: Job[],
  limit: number,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): MatchResult<Job>[] {
  return jobs
    .map((job) => scoreMatch(candidate, job, weights))
    .filter((match): match is MatchResult<Job> => match !== null)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, limit);
}

export function rankCandidates(
  job: Job,
  candidates: Candidate[],
  limit: number,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): MatchResult<Candidate>[] {
  return candidates
    .map((candidate) => {
      const result = scoreMatch(candidate, job, weights);
      return result ? { score: result.score, breakdown: result.breakdown, item: candidate } : null;
    })
    .filter((match): match is MatchResult<Candidate> => match !== null)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, limit);
}
