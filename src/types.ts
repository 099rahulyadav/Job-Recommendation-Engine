export type SkillRequirement = {
  name: string;
  type: "must-have" | "nice-to-have";
};

export type Candidate = {
  id: string;
  name: string;
  skills: string[];
  yearsOfExperience: number;
  location: string;
  expectedSalary: number;
};

export type Job = {
  id: string;
  title: string;
  requiredSkills: SkillRequirement[];
  minYearsExperience: number;
  location: string;
  salaryRange: { min: number; max: number };
  remoteAllowed: boolean;
};

export type ScoreWeights = {
  skills: number;
  experience: number;
  location: number;
  salary: number;
};

export type ScoreBreakdown = {
  skills: { score: number; max: number; detail: string };
  experience: { score: number; max: number; detail: string };
  location: { score: number; max: number; detail: string };
  salary: { score: number; max: number; detail: string };
};

export type MatchResult<T> = {
  score: number;
  breakdown: ScoreBreakdown;
  item: T;
};
