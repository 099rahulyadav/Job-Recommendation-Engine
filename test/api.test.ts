import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("API", () => {
  it("creates data and returns candidate recommendations", async () => {
    const app = buildApp();
    apps.push(app);
    const candidateResponse = await app.inject({
      method: "POST",
      url: "/candidates",
      payload: {
        id: "c1",
        name: "Asha",
        skills: ["TypeScript"],
        yearsOfExperience: 2,
        location: "Pune",
        expectedSalary: 1_000_000,
      },
    });
    expect(candidateResponse.statusCode).toBe(201);

    const jobResponse = await app.inject({
      method: "POST",
      url: "/jobs",
      payload: {
        id: "j1",
        title: "API Engineer",
        requiredSkills: [{ name: "TypeScript", type: "must-have" }],
        minYearsExperience: 2,
        location: "Pune",
        salaryRange: { min: 1_000_000, max: 1_500_000 },
        remoteAllowed: true,
      },
    });
    expect(jobResponse.statusCode).toBe(201);

    const response = await app.inject({
      method: "GET",
      url: "/candidates/c1/recommendations?limit=1",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      candidateId: "c1",
      count: 1,
      recommendations: [{ score: 100, item: { id: "j1" } }],
    });
  });

  it("validates limit and incomplete custom weights", async () => {
    const app = buildApp();
    apps.push(app);
    await app.inject({
      method: "POST",
      url: "/candidates",
      payload: {
        id: "c1",
        name: "Asha",
        skills: [],
        yearsOfExperience: 0,
        location: "Pune",
        expectedSalary: 0,
      },
    });
    const badLimit = await app.inject({ method: "GET", url: "/candidates/c1/recommendations?limit=0" });
    const badWeights = await app.inject({
      method: "GET",
      url: "/candidates/c1/recommendations?skillsWeight=1",
    });
    expect(badLimit.statusCode).toBe(400);
    expect(badWeights.statusCode).toBe(400);
  });
});
