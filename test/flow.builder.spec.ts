import { describe, expect, it } from "vitest";
import { defineFlow } from "../src/flow/builder";

describe("flow builder", () => {
  it("builds a flow with routes, matcher params, and subflows", () => {
    const child = defineFlow("child")
      .start((step) => step.end())
      .build();

    const flow = defineFlow("main")
      .start((step) =>
        step
          .onIntent("pricing", "pricing")
          .onAnswer(
            { kind: "matcher", id: "email" },
            { required: true },
            "done",
          )
          .otherwise(async ({ stay }) => {
            stay();
          }),
      )
      .step("pricing", (step) => step.subflow(child, { returnTo: "done" }))
      .step("done", (step) => step.end())
      .globalIntent("cancel", "done", {
        policy: "always",
        params: { hard: true },
      })
      .build();

    expect(flow.kind).toBe("flow");
    expect(flow.startStepId).toBe("__start__");
    expect(flow.steps.pricing.subflow?.flow.id).toBe("child");
    expect(flow.steps.pricing.subflow?.returnStepId).toBe("done");
    expect(flow.steps.__start__.intentRoutes[0]).toMatchObject({
      id: "__start__:0",
      intentId: "pricing",
      target: "pricing",
    });
    expect(flow.steps.__start__.answerRoutes[0]).toMatchObject({
      id: "__start__:0",
      target: "done",
      matcher: {
        kind: "named",
        name: { kind: "matcher", id: "email" },
        params: { required: true },
      },
    });
    expect(flow.globalIntentRoutes[0]).toMatchObject({
      id: "global:0",
      intentId: "cancel",
      target: "done",
      policy: "always",
      params: { hard: true },
    });
  });

  it("throws when the start step is missing", () => {
    expect(() => defineFlow("main").build()).toThrow(
      "Flow is missing a start step",
    );
  });

  it("throws on duplicate branches and cross-branch step collisions", () => {
    expect(() =>
      defineFlow("main")
        .start((step) => step.end())
        .branch("account", {}, () => undefined)
        .branch("account", {}, () => undefined),
    ).toThrow("Branch 'account' already exists");

    expect(() =>
      defineFlow("main")
        .start((step) => step.end())
        .step("shared", (step) => step.end())
        .branch("account", {}, (branch) => {
          branch.step("shared", (step) => step.end());
        }),
    ).toThrow("Step 'shared' already exists in another branch");
  });

  it("throws when a route points to an unknown step", () => {
    expect(() =>
      defineFlow("main")
        .start((step) => step.onIntent("missing", "nope"))
        .build(),
    ).toThrow("Unknown target step 'nope' in flow 'main'");
  });
});
