import { describe, expect, it } from "vitest";
import { createHarness } from "./helpers";

describe("flow subflows", () => {
  it("enters a child flow, resets child data, and resumes the parent at returnTo", async () => {
    const { chat, getChat } = createHarness();

    const child = chat
      .flow("child")
      .start((step) =>
        step.otherwise(async ({ data, end }) => {
          data.child = "set";
          end();
        }),
      )
      .build();

    chat
      .flow("main")
      .start((step) =>
        step.onIntent("begin", async ({ data, goto }) => {
          data.parent = "kept-until-subflow";
          goto("child_entry");
        }),
      )
      .step("child_entry", (step) => step.subflow(child, { returnTo: "after" }))
      .step("after", (step) => step.end())
      .build();

    await chat.handle("chat_1", { text: "begin" });
    expect(getChat().flow).toBe("child");
    expect(getChat().flow_stack).toEqual([
      {
        flow: "main",
        return_step: "after",
        return_branch: null,
      },
    ]);
    expect(getChat().flow_data).toEqual({});

    await chat.handle("chat_1", { text: "anything" });
    expect(getChat().flow).toBe("main");
    expect(getChat().current_step).toBe("after");
    expect(getChat().flow_stack).toEqual([]);
    expect(getChat().flow_data).toEqual({ child: "set" });
  });

  it("supports full handoff with returnTo null and nested subflow resume", async () => {
    const { chat, getChat } = createHarness();

    const grandchild = chat
      .flow("grandchild")
      .start((step) => step.end())
      .build();

    const child = chat
      .flow("child")
      .start((step) => step.onIntent("deeper", "nested"))
      .step("nested", (step) => step.subflow(grandchild, { returnTo: "done" }))
      .step("done", (step) => step.end())
      .build();

    chat
      .flow("main")
      .start((step) => step.onIntent("begin", "handoff"))
      .step("handoff", (step) => step.subflow(child, { returnTo: null }))
      .build();

    await chat.handle("chat_1", { text: "begin" });
    expect(getChat().flow).toBe("child");
    expect(getChat().flow_stack).toEqual([
      {
        flow: "main",
        return_step: null,
        return_branch: null,
      },
    ]);

    await chat.handle("chat_1", { text: "deeper" });
    expect(getChat().flow).toBe("grandchild");
    expect(getChat().flow_stack).toEqual([
      {
        flow: "main",
        return_step: null,
        return_branch: null,
      },
      {
        flow: "child",
        return_step: "done",
        return_branch: null,
      },
    ]);

    await chat.handle("chat_1", { text: "finish-grandchild" });
    expect(getChat().flow).toBe("child");
    expect(getChat().current_step).toBe("done");

    await chat.handle("chat_1", { text: "finish-child" });
    expect(getChat().flow).toBe("main");
    expect(getChat().current_step).toBeNull();
    expect(getChat().flow_stack).toEqual([]);
  });
});
