import { describe, expect, it } from "vitest";
import { createHarness } from "./helpers";

describe("flow branches", () => {
  it("blocks respectBranch globals inside locked branches but allows always globals", async () => {
    const { chat, createWorker, getChat } = createHarness();

    const mainFlow = chat
      .flow("main")
      .start((step) => step.onIntent("begin", "inside"))
      .globalIntent("support", "support", { policy: "respectBranch" })
      .globalIntent("cancel", "cancelled", { policy: "always" })
      .branch("locked", { allowExternalIntents: false }, (branch) => {
        branch.step("inside", (step) =>
          step.otherwise(async ({ helpers, stay }) => {
            await helpers.send("inside-fallback");
            stay();
          }),
        );
      })
      .step("support", (step) => step.end())
      .step("cancelled", (step) => step.end())
      .build();

    const worker = createWorker([mainFlow]);

    await worker.run("chat_1", { text: "begin" });
    expect(getChat().current_step).toBe("inside");
    expect(getChat().current_branch).toBe("locked");

    await worker.run("chat_1", { text: "support" });
    expect(getChat().current_step).toBe("inside");
    expect(getChat().store.transcript).toEqual(["inside-fallback"]);

    await worker.run("chat_1", { text: "cancel" });
    expect(getChat().current_step).toBe("cancelled");
    expect(getChat().current_branch).toBeNull();
  });

  it("uses canExit to keep users inside a branch", async () => {
    const { chat, createWorker, getChat } = createHarness();

    const mainFlow = chat
      .flow("main")
      .start((step) => step.onIntent("begin", "inside"))
      .branch(
        "locked",
        {
          canExit: async () => false,
        },
        (branch) => {
          branch.step("inside", (step) =>
            step.onIntent("leave", "outside").otherwise(async ({ stay }) => {
              stay();
            }),
          );
        },
      )
      .step("outside", (step) => step.end())
      .build();

    const worker = createWorker([mainFlow]);

    await worker.run("chat_1", { text: "begin" });
    await worker.run("chat_1", { text: "leave" });

    expect(getChat().current_step).toBe("inside");
    expect(getChat().current_branch).toBe("locked");
    expect(getChat().flow_history?.map((entry) => entry.step)).toEqual([
      "__start__",
      "inside",
    ]);
  });
});
