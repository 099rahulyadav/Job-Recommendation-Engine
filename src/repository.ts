import type { Candidate, Job } from "./types.js";

export class InMemoryRepository {
  private readonly candidates = new Map<string, Candidate>();
  private readonly jobs = new Map<string, Job>();

  createCandidate(candidate: Candidate): Candidate {
    this.candidates.set(candidate.id, candidate);
    return candidate;
  }

  createJob(job: Job): Job {
    this.jobs.set(job.id, job);
    return job;
  }

  getCandidate(id: string): Candidate | undefined {
    return this.candidates.get(id);
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  listCandidates(): Candidate[] {
    return [...this.candidates.values()];
  }

  listJobs(): Job[] {
    return [...this.jobs.values()];
  }
}
