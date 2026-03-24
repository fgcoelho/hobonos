import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { defineFlow } from "../src/flow/builder";
import { createFlowMachine, FLOW_FINAL_STATE } from "../src/flow/machine";

describe("flow machine", () => {
  it("starts at the flow start step and supports route/end events", () => {
    const flow = defineFlow("main")
      .start((step) => step.onIntent("go", "done"))
      .step("done", (step) => step.end())
      .build();

    const actor = createActor(createFlowMachine(flow)).start();

    expect(actor.getSnapshot().value).toBe("__start__");

    actor.send({ type: "ROUTE", target: "done", reason: "goto" });
    expect(actor.getSnapshot().value).toBe("done");

    actor.send({ type: "END", reason: "end" });
    expect(actor.getSnapshot().value).toBe(FLOW_FINAL_STATE);
    expect(actor.getSnapshot().status).toBe("done");

    actor.stop();
  });
});
