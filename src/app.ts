import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { InMemoryRepository } from "./repository.js";
import {
  DEFAULT_WEIGHTS,
  rankCandidates,
  rankJobs,
} from "./scoring.js";
import type { Candidate, Job, ScoreWeights, SkillRequirement } from "./types.js";

type CandidateBody = Omit<Candidate, "id"> & { id?: string };
type JobBody = Omit<Job, "id"> & { id?: string };

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);

function candidateError(body: unknown): string | null {
  if (!body || typeof body !== "object") return "Request body must be an object";
  const value = body as Record<string, unknown>;
  if (typeof value.name !== "string" || !value.name.trim()) return "name is required";
  if (!isStringArray(value.skills)) return "skills must be an array of non-empty strings";
  if (typeof value.yearsOfExperience !== "number" || value.yearsOfExperience < 0)
    return "yearsOfExperience must be a non-negative number";
  if (typeof value.location !== "string" || !value.location.trim()) return "location is required";
  if (typeof value.expectedSalary !== "number" || value.expectedSalary < 0)
    return "expectedSalary must be a non-negative number";
  return null;
}

function isSkillRequirement(value: unknown): value is SkillRequirement {
  if (!value || typeof value !== "object") return false;
  const skill = value as Record<string, unknown>;
  return (
    typeof skill.name === "string" &&
    skill.name.trim().length > 0 &&
    (skill.type === "must-have" || skill.type === "nice-to-have")
  );
}

function jobError(body: unknown): string | null {
  if (!body || typeof body !== "object") return "Request body must be an object";
  const value = body as Record<string, unknown>;
  if (typeof value.title !== "string" || !value.title.trim()) return "title is required";
  if (!Array.isArray(value.requiredSkills) || !value.requiredSkills.every(isSkillRequirement))
    return "requiredSkills must contain valid name/type objects";
  if (typeof value.minYearsExperience !== "number" || value.minYearsExperience < 0)
    return "minYearsExperience must be a non-negative number";
  if (typeof value.location !== "string" || !value.location.trim()) return "location is required";
  if (typeof value.remoteAllowed !== "boolean") return "remoteAllowed must be a boolean";
  const salary = value.salaryRange as Record<string, unknown> | undefined;
  if (!salary || typeof salary.min !== "number" || typeof salary.max !== "number")
    return "salaryRange.min and salaryRange.max must be numbers";
  if (salary.min < 0 || salary.max < salary.min)
    return "salaryRange must be non-negative and max must be greater than or equal to min";
  return null;
}

function parseLimit(value: unknown): number | null {
  if (value === undefined) return 10;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : null;
}

function parseWeights(query: Record<string, unknown>): ScoreWeights | null {
  const keys = ["skillsWeight", "experienceWeight", "locationWeight", "salaryWeight"] as const;
  if (!keys.some((key) => query[key] !== undefined)) return DEFAULT_WEIGHTS;
  const values = keys.map((key) => Number(query[key]));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const [skills, experience, location, salary] = values;
  if (skills === undefined || experience === undefined || location === undefined || salary === undefined)
    return null;
  if (skills + experience + location + salary <= 0) return null;
  return { skills, experience, location, salary };
}

export function buildApp(repository = new InMemoryRepository()): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.post<{ Body: CandidateBody }>("/candidates", async (request, reply) => {
    const error = candidateError(request.body);
    if (error) return reply.code(400).send({ error });
    const body = request.body;
    const candidate: Candidate = {
      ...body,
      id: body.id?.trim() || randomUUID(),
      name: body.name.trim(),
      skills: [...new Set(body.skills.map((skill) => skill.trim()))],
      location: body.location.trim(),
    };
    repository.createCandidate(candidate);
    return reply.code(201).send(candidate);
  });

  app.post<{ Body: JobBody }>("/jobs", async (request, reply) => {
    const error = jobError(request.body);
    if (error) return reply.code(400).send({ error });
    const body = request.body;
    const job: Job = {
      ...body,
      id: body.id?.trim() || randomUUID(),
      title: body.title.trim(),
      location: body.location.trim(),
      requiredSkills: body.requiredSkills.map((skill) => ({ ...skill, name: skill.name.trim() })),
    };
    repository.createJob(job);
    return reply.code(201).send(job);
  });

  app.get<{ Params: { id: string }; Querystring: Record<string, unknown> }>(
    "/candidates/:id/recommendations",
    async (request, reply) => {
      const candidate = repository.getCandidate(request.params.id);
      if (!candidate) return reply.code(404).send({ error: "Candidate not found" });
      const limit = parseLimit(request.query.limit);
      const weights = parseWeights(request.query);
      if (limit === null) return reply.code(400).send({ error: "limit must be an integer from 1 to 100" });
      if (!weights)
        return reply.code(400).send({
          error: "Provide all four non-negative weights with a total greater than zero",
        });
      const recommendations = rankJobs(candidate, repository.listJobs(), limit, weights);
      return { candidateId: candidate.id, count: recommendations.length, recommendations };
    },
  );

  app.get<{ Params: { id: string }; Querystring: Record<string, unknown> }>(
    "/jobs/:id/recommendations",
    async (request, reply) => {
      const job = repository.getJob(request.params.id);
      if (!job) return reply.code(404).send({ error: "Job not found" });
      const limit = parseLimit(request.query.limit);
      const weights = parseWeights(request.query);
      if (limit === null) return reply.code(400).send({ error: "limit must be an integer from 1 to 100" });
      if (!weights)
        return reply.code(400).send({
          error: "Provide all four non-negative weights with a total greater than zero",
        });
      const recommendations = rankCandidates(job, repository.listCandidates(), limit, weights);
      return { jobId: job.id, count: recommendations.length, recommendations };
    },
  );

  return app;
}
