import { describe, expect, it } from "vitest";
import type { FlowActionContext } from "../src";
import type { TestChat, TestHelpers, TestMessage } from "./helpers";
import { createChatRecord, createHarness } from "./helpers";

describe("flow runtime", () => {
  it("normalizes flow state, runs middleware, and persists updates", async () => {
    const order: string[] = [];
    const {
      chat,
      createWorker,
      getChat,
      parseCalls,
      helperCalls,
      updateCalls,
    } = createHarness({
      middleware: async ({ helpers }) => {
        order.push("middleware");
        await helpers.mark("middleware");
      },
    });

    const mainFlow = chat
      .flow("main")
      .start((step) =>
        step.otherwise(async ({ helpers, stay }) => {
          order.push("otherwise");
          await helpers.send("fallback");
          stay();
        }),
      )
      .build();

    const worker = createWorker([mainFlow]);

    await worker.run("chat_1", { text: "hello" });

    const persisted = getChat();
    expect(parseCalls).toEqual(["hello"]);
    expect(helperCalls).toEqual(["chat_1"]);
    expect(order).toEqual(["middleware", "otherwise"]);
    expect(persisted.flow_status).toBe("active");
    expect(persisted.current_step).toBe("__start__");
    expect(persisted.flow_data).toEqual({});
    expect(persisted.flow_history).toHaveLength(1);
    expect(persisted.flow_history?.[0]).toMatchObject({
      step: "__start__",
      reason: "start",
    });
    expect(persisted.flow_history?.[0]?.at).toBeInstanceOf(Date);
    expect(persisted.store.calls).toEqual(["middleware"]);
    expect(persisted.store.transcript).toEqual(["fallback"]);
    expect(updateCalls).toHaveLength(1);
  });

  it("applies routing precedence of global intent, step intent, answer, then fallback", async () => {
    const { chat, chats, createWorker } = createHarness({
      chats: [createChatRecord()],
      matchIntent: ({ message, intents }) => {
        const normalized = message.text.trim().toLowerCase();
        return intents.find((intent) => intent.id === normalized)?.id ?? null;
      },
    });

    chats.set("global", createChatRecord({ id: "global" }));
    chats.set("answer", createChatRecord({ id: "answer" }));
    chats.set("fallback", createChatRecord({ id: "fallback" }));

    const mainFlow = chat
      .flow("main")
      .start((step) =>
        step
          .onIntent("go", async ({ helpers, goto }) => {
            await helpers.send("step");
            goto("step_target");
          })
          .onAnswer(
            async ({ message }) => message.text === "answer",
            async (
              ctx: FlowActionContext<TestChat, TestMessage, TestHelpers>,
            ) => {
              const { helpers, goto } = ctx;
              await helpers.send("answer");
              goto("answer_target");
            },
          )
          .otherwise(async ({ helpers, goto }) => {
            await helpers.send("fallback");
            goto("fallback_target");
          }),
      )
      .globalIntent("go", async ({ helpers, goto }) => {
        await helpers.send("global");
        goto("global_target");
      })
      .step("global_target", (step) => step.end())
      .step("step_target", (step) => step.end())
      .step("answer_target", (step) => step.end())
      .step("fallback_target", (step) => step.end())
      .build();

    const worker = createWorker([mainFlow]);

    await worker.run("global", { text: "go" });
    await worker.run("answer", { text: "answer" });
    await worker.run("fallback", { text: "unknown" });

    expect(chats.get("global")?.store.transcript).toEqual(["global"]);
    expect(chats.get("global")?.current_step).toBe("global_target");
    expect(chats.get("answer")?.store.transcript).toEqual(["answer"]);
    expect(chats.get("answer")?.current_step).toBe("answer_target");
    expect(chats.get("fallback")?.store.transcript).toEqual(["fallback"]);
    expect(chats.get("fallback")?.current_step).toBe("fallback_target");
    expect(chats.get("global")?.flow_history?.[0]?.reason).toBe("start");
  });

  it("resolves named behaviors and preserves effect/action ordering", async () => {
    const { chat, createWorker, getChat } = createHarness();

    const enterGuard = chat.guard("enterGuard", async ({ data }) => {
      data.allowed = true;
      return true;
    });
    const routeEffect = chat.effect("routeEffect", async ({ helpers }) => {
      await helpers.mark("route-effect");
    });
    const exitEffect = chat.effect("exitEffect", async ({ helpers }) => {
      await helpers.mark("exit-effect");
    });
    const enterEffect = chat.effect("enterEffect", async ({ helpers }) => {
      await helpers.mark("enter-effect");
    });
    const saveName = chat.action(
      "saveName",
      async ({ message, data, helpers, goto }) => {
        await helpers.mark("action");
        data.name = message.text;
        goto("done");
      },
    );
    const nonEmpty = chat.matcher(
      "nonEmpty",
      async ({ message }) => message.text.length > 0,
    );

    const mainFlow = chat
      .flow("main")
      .start((step) =>
        step
          .onExit(exitEffect)
          .onAnswer(nonEmpty, undefined, saveName, { effects: [routeEffect] }),
      )
      .step("done", (step) =>
        step
          .canEnter(enterGuard)
          .effect(enterEffect)
          .prompt(async ({ helpers }) => {
            await helpers.mark("prompt");
          })
          .end(),
      )
      .build();

    const worker = createWorker([mainFlow]);

    await worker.run("chat_1", { text: "Ada" });

    const persisted = getChat();
    expect(persisted.flow_data).toMatchObject({
      allowed: true,
      name: "Ada",
    });
    expect(persisted.store.calls).toEqual([
      "route-effect",
      "action",
      "exit-effect",
      "enter-effect",
      "prompt",
    ]);
    expect(persisted.flow_history?.map((entry) => entry.reason)).toEqual([
      "start",
      "goto",
    ]);
  });

  it("supports repeat, stay, ended-flow restart, and missing chat/flow errors", async () => {
    const { chat, chats, createWorker, getChat } = createHarness();

    const mainFlow = chat
      .flow("main")
      .start((step) =>
        step.otherwise(async ({ message, helpers, repeat, stay, end }) => {
          if (message.text === "repeat") {
            await helpers.send("repeat");
            repeat();
            return;
          }

          if (message.text === "end") {
            end();
            return;
          }

          await helpers.send("stay");
          stay();
        }),
      )
      .build();

    const worker = createWorker([mainFlow]);

    await worker.run("chat_1", { text: "repeat" });
    expect(getChat().store.transcript).toEqual(["repeat"]);
    expect(getChat().flow_history).toHaveLength(1);

    await worker.run("chat_1", { text: "stay" });
    expect(getChat().store.transcript).toEqual(["repeat", "stay"]);
    expect(getChat().current_step).toBe("__start__");

    await worker.run("chat_1", { text: "end" });
    expect(getChat().flow_status).toBe("ended");
    expect(getChat().current_step).toBeNull();

    await worker.run("chat_1", { text: "stay" });
    expect(getChat().flow_status).toBe("active");
    expect(getChat().current_step).toBe("__start__");

    await expect(worker.run("missing", { text: "hello" })).rejects.toThrow(
      "Chat record not found",
    );

    chats.set("broken", {
      id: "broken",
      flow: "unknown",
      language: "en",
      locked: false,
      lock_until: null,
      store: { transcript: [], calls: [] },
    });

    await expect(worker.run("broken", { text: "hello" })).rejects.toThrow(
      "Flow not found",
    );
  });

  it("throws when a worker is created with duplicate flow ids", () => {
    const { chat, createWorker } = createHarness();

    const duplicateA = chat
      .flow("main")
      .start((step) => step.end())
      .build();
    const duplicateB = chat
      .flow("main")
      .start((step) => step.end())
      .build();

    expect(() => createWorker([duplicateA, duplicateB])).toThrow(
      "Duplicate flow 'main'",
    );
  });
});
