import { describe, expect, it } from "vitest";
import type { CreateHobonosConfig } from "../src";
import { createHobonos, type IChat } from "../src";

type TestMessage = { text: string };
type TestStorage = {
  transcript: string[];
  calls: string[];
  email?: string;
  signup?: Record<string, unknown>;
};

type TestChat = IChat<TestStorage>;

type TestWorker = ReturnType<
  ReturnType<
    typeof createHobonos<TestMessage, TestMessage, TestChat>
  >["createWorker"]
>;

const createChatRecord = (): TestChat => ({
  id: "chat_1",
  storage: { transcript: [], calls: [] },
});

const bootWorker = async (worker: TestWorker, text = "") => {
  await worker.run("chat_1", { text });
};

const createHarness = (
  overrides: Partial<
    CreateHobonosConfig<TestChat, TestMessage, TestMessage, {}>
  > = {},
) => {
  const chats = new Map<string, TestChat>([["chat_1", createChatRecord()]]);
  let activeChatId: string | null = null;

  const hobonos = createHobonos<TestMessage, TestMessage, TestChat>({
    parseMessage: (payload: TestMessage) => payload,
    repository: {
      retrieveChat: async (chatId: string) => {
        activeChatId = chatId;
        return chats.get(chatId) ?? null;
      },
      updateChat: async (next: TestChat) => {
        if (!activeChatId) throw new Error("No active chat id");
        chats.set(activeChatId, next);
      },
    },
    resolveComponent: async ({ message, components }) => {
      const normalized = message.text.trim();
      const lower = normalized.toLowerCase();
      if (lower.startsWith("share email ")) {
        const email = normalized.slice("share email ".length).trim();
        const component = components.find((entry) => entry.label === "Email");
        return component ? { id: component.id, input: email } : null;
      }

      return (
        components.find((component) => {
          if (component.label.toLowerCase() === lower) return true;
          return component.examples?.some(
            (example) => example.toLowerCase() === lower,
          );
        })?.id ?? null
      );
    },
    ...overrides,
  }).middleware(async ({ chat }) => ({
    ctx: {
      send: async (text: string) => {
        chat.storage.transcript.push(text);
      },
      mark: async (label: string) => {
        chat.storage.calls.push(label);
      },
    },
  }));

  return {
    hobonos,
    getChat(chatId = "chat_1") {
      const chat = chats.get(chatId);
      if (!chat) throw new Error(`Chat '${chatId}' not found`);
      return chat;
    },
  };
};

describe("hobonos runtime", () => {
  it('rejects route("") and points users to rootRoute', () => {
    const { hobonos } = createHarness();

    expect(() => hobonos.route("", {})).toThrow(
      "Use hobonos.rootRoute(...) for the app root.",
    );
  });

  it("requires hobonos.rootRoute(...) in createWorker", () => {
    const { hobonos } = createHarness();

    const notRoot = hobonos.route("support", {
      page: hobonos.page({ components: [] }),
    });

    expect(() => hobonos.createWorker(notRoot as never)).toThrow(
      "createWorker requires hobonos.rootRoute(...)",
    );
  });

  it("runs page.render on navigation", async () => {
    const { hobonos, getChat } = createHarness();

    const pricing = hobonos.route("pricing", {
      page: hobonos.page({
        render: async ({ ctx }) => {
          await ctx.send("Pricing page");
        },
      }),
    });

    const root = hobonos.rootRoute({
      routes: [pricing],
      page: () =>
        hobonos.page({
          components: [
            hobonos.button("pricing", {
              label: "Pricing",
              examples: ["plans"],
              onInteract: ({ navigate }) => {
                navigate(pricing);
              },
            }),
          ],
        }),
    });

    const worker = hobonos.createWorker(root);
    await bootWorker(worker);
    await worker.run("chat_1", { text: "plans" });

    expect(getChat().currentRouteId).toBe("/pricing");
    expect(getChat().storage.transcript).toEqual(["Pricing page"]);
  });

  it("renders the current page on the very first message before interacting", async () => {
    const { hobonos, getChat } = createHarness();

    const pricing = hobonos.route("pricing", {
      page: hobonos.page({
        render: async ({ ctx }) => {
          await ctx.send("Pricing page");
        },
      }),
    });

    const root = hobonos.rootRoute({
      routes: [pricing],
      page: hobonos.page({
        render: async ({ ctx }) => {
          await ctx.send("Home");
        },
        components: [
          hobonos.button("pricing", {
            label: "Pricing",
            examples: ["plans"],
            onInteract: ({ navigate }) => {
              navigate(pricing);
            },
          }),
        ],
      }),
    });

    const worker = hobonos.createWorker(root);
    await worker.run("chat_1", { text: "plans" });

    expect(getChat().currentRouteId).toBe("/");
    expect(getChat().storage.transcript).toEqual(["Home"]);
    expect(getChat().history).toHaveLength(1);
    expect(getChat().history?.[0]?.reason).toBe("render");

    await worker.run("chat_1", { text: "plans" });

    expect(getChat().currentRouteId).toBe("/pricing");
    expect(getChat().storage.transcript).toEqual(["Home", "Pricing page"]);
  });

  it("runs button handlers with ctx", async () => {
    const { hobonos, getChat } = createHarness();

    const done = hobonos.route("done", {
      page: hobonos.page({
        render: async ({ ctx }) => {
          await ctx.send("Done");
        },
      }),
    });

    const root = hobonos.rootRoute({
      routes: [done],
      page: () =>
        hobonos.page({
          components: [
            hobonos.button("register", {
              label: "Register",
              onInteract: async ({ storage, navigate, message }) => {
                storage.email = message.text;
                navigate(done);
              },
            }),
          ],
        }),
    });

    const worker = hobonos.createWorker(root);
    await bootWorker(worker);
    await worker.run("chat_1", { text: "register" });

    expect(getChat().currentRouteId).toBe("/done");
    expect(getChat().storage).toMatchObject({ email: "register" });
    expect(getChat().storage.transcript).toEqual(["Done"]);
  });

  it("supports direct input resolution without extra focus step", async () => {
    const { hobonos, getChat } = createHarness();

    const root = hobonos.rootRoute({
      page: hobonos.page({
        components: [
          hobonos.input("email", {
            label: "Email",
            examples: ["share email"],
            render: async ({ ctx }) => {
              await ctx.send("What is your email?");
            },
            onInteract: async ({ ctx, input, storage, message }) => {
              const email = (input ?? message.text).trim();
              storage.email = email;
              await ctx.send(`Saved ${email}`);
            },
          }),
        ],
      }),
    });

    const worker = hobonos.createWorker(root);
    await bootWorker(worker);
    await worker.run("chat_1", { text: "share email ada@example.com" });

    expect(getChat().storage).toMatchObject({ email: "ada@example.com" });
    expect(getChat().focusedComponentId).toBeNull();
    expect(getChat().storage.transcript).toEqual(["Saved ada@example.com"]);
  });

  it("focuses inputs and accepts free text", async () => {
    const { hobonos, getChat } = createHarness();

    const root = hobonos.rootRoute({
      page: hobonos.page({
        components: [
          hobonos.input("email", {
            label: "Email",
            examples: ["share email"],
            render: async ({ ctx }) => {
              await ctx.send("What is your email?");
            },
            onInteract: async ({ ctx, input, storage, message }) => {
              const email = (input ?? message.text).trim();
              storage.email = email;
              await ctx.send(`Saved ${email}`);
            },
          }),
        ],
      }),
    });

    const worker = hobonos.createWorker(root);
    await bootWorker(worker);
    await worker.run("chat_1", { text: "email" });
    await worker.run("chat_1", { text: "ada@example.com" });

    expect(getChat().storage).toMatchObject({ email: "ada@example.com" });
    expect(getChat().storage.transcript).toEqual([
      "What is your email?",
      "Saved ada@example.com",
    ]);
  });

  it("applies defaultFocusDuration and clears expired focus before resolving the next message", async () => {
    const originalNow = Date.now;
    let now = 1_000;
    Date.now = () => now;

    try {
      const { hobonos, getChat } = createHarness({ defaultFocusDuration: 100 });

      const root = hobonos.rootRoute({
        page: hobonos.page({
          components: [
            hobonos.input("email", {
              label: "Email",
              render: async ({ ctx }) => {
                await ctx.send("What is your email?");
              },
              onInteract: async ({ ctx, input, storage, message }) => {
                const email = (input ?? message.text).trim();
                storage.email = email;
                await ctx.send(`Saved ${email}`);
              },
            }),
            hobonos.help({
              render: async ({ ctx }) => {
                await ctx.send("Need help");
              },
            }),
          ],
        }),
      });

      const worker = hobonos.createWorker(root);
      await bootWorker(worker);
      await worker.run("chat_1", { text: "email" });

      expect(getChat().focusedComponentId).toBe("/:email");
      expect(getChat().focusUntil).toBe(1_100);

      now = 1_101;
      await worker.run("chat_1", { text: "unknown" });

      expect(getChat().focusedComponentId).toBeNull();
      expect(getChat().focusUntil).toBeNull();
      expect(getChat().storage.transcript).toEqual([
        "What is your email?",
        "Need help",
      ]);
    } finally {
      Date.now = originalNow;
    }
  });

  it("allows handlers to unfocus without navigating", async () => {
    const { hobonos, getChat } = createHarness();

    const root = hobonos.rootRoute({
      page: hobonos.page({
        components: [
          hobonos.input("email", {
            label: "Email",
            render: async ({ ctx }) => {
              await ctx.send("What is your email?");
            },
            onInteract: async ({ ctx, unfocus }) => {
              unfocus();
              await ctx.send("Cancelled");
            },
          }),
        ],
      }),
    });

    const worker = hobonos.createWorker(root);
    await bootWorker(worker);
    await worker.run("chat_1", { text: "email" });
    await worker.run("chat_1", { text: "never mind" });

    expect(getChat().focusedComponentId).toBeNull();
    expect(getChat().focusUntil).toBeNull();
    expect(getChat().currentRouteId).toBe("/");
    expect(getChat().storage.transcript).toEqual([
      "What is your email?",
      "Cancelled",
    ]);
  });

  it("supports back with render and onInteract", async () => {
    const { hobonos, getChat } = createHarness();

    const support = hobonos.route("support", {
      page: () =>
        hobonos.page({
          components: [
            hobonos.button("pricing", {
              label: "Pricing",
              onInteract: ({ navigate }) => {
                navigate(pricing);
              },
            }),
          ],
          render: async ({ ctx }) => {
            await ctx.send("Support home");
          },
        }),
    });

    const pricing = hobonos.route("pricing", {
      page: hobonos.page({
        components: [
          hobonos.back({
            render: async ({ ctx, breadcrumbs }) => {
              await ctx.send(
                `Where back? ${breadcrumbs.map((crumb) => crumb.label).join(", ")}`,
              );
            },
            onInteract: async ({ message, breadcrumbs, goBack }) => {
              const target = breadcrumbs.find(
                (crumb) =>
                  crumb.label.toLowerCase() ===
                  message.text.trim().toLowerCase(),
              );
              goBack(target);
            },
          }),
        ],
      }),
    });

    const root = hobonos.rootRoute({
      routes: [support, pricing],
      page: () =>
        hobonos.page({
          components: [
            hobonos.button("support", {
              label: "Support",
              onInteract: ({ navigate }) => {
                navigate(support);
              },
            }),
            hobonos.button("pricing", {
              label: "Pricing",
              onInteract: ({ navigate }) => {
                navigate(pricing);
              },
            }),
          ],
        }),
    });

    const worker = hobonos.createWorker(root);
    await bootWorker(worker);
    await worker.run("chat_1", { text: "support" });
    await worker.run("chat_1", { text: "pricing" });
    await worker.run("chat_1", { text: "go back" });
    await worker.run("chat_1", { text: "support" });

    expect(getChat().currentRouteId).toBe("/support");
    expect(getChat().storage.transcript).toEqual([
      "Support home",
      "Where back? /, support",
      "Support home",
    ]);
  });

  it("uses page help when a message does not resolve", async () => {
    const { hobonos, getChat } = createHarness();

    const root = hobonos.rootRoute({
      page: hobonos.page({
        components: [
          hobonos.help({
            render: async ({ ctx, components }) => {
              await ctx.send(
                `Try: ${components.map((component) => component.label).join(", ")}`,
              );
            },
          }),
          hobonos.button("pricing", { label: "Pricing" }),
        ],
      }),
    });

    const worker = hobonos.createWorker(root);
    await bootWorker(worker);
    await worker.run("chat_1", { text: "unknown" });
    await worker.run("chat_1", { text: "help" });

    expect(getChat().storage.transcript).toEqual([
      "Try: Help, Pricing",
      "Try: Help, Pricing",
    ]);
  });

  it("applies cumulative layouts before the page and exposes layout components", async () => {
    const { hobonos, getChat } = createHarness();

    const billing = hobonos.route("billing", {
      page: hobonos.page({
        render: async ({ ctx }) => {
          await ctx.send("billing-page");
        },
      }),
    });

    const account = hobonos.route("account", {
      routes: [billing],
      layout: hobonos.layout({
        render: async ({ ctx }) => {
          await ctx.send("account-layout");
        },
        components: [hobonos.button("profile", { label: "Profile" })],
      }),
      page: hobonos.page({ components: [] }),
    });

    const root = hobonos.rootRoute({
      routes: [account],
      layout: () =>
        hobonos.layout({
          render: async ({ ctx }) => {
            await ctx.send("root-layout");
          },
          components: [
            hobonos.button("billing", {
              label: "Billing",
              onInteract: ({ navigate }) => {
                navigate(billing);
              },
            }),
          ],
        }),
      page: hobonos.page({ components: [] }),
    });

    const worker = hobonos.createWorker(root);
    await bootWorker(worker);

    await worker.run("chat_1", { text: "billing" });

    expect(getChat().currentRouteId).toBe("/account/billing");
    expect(getChat().storage.transcript).toEqual([
      "root-layout",
      "root-layout",
      "account-layout",
      "billing-page",
    ]);
  });

  it("uses route notFound when currentRouteId is invalid", async () => {
    const { hobonos, getChat } = createHarness();

    const root = hobonos.rootRoute({
      page: hobonos.page({ components: [] }),
      notFound: hobonos.page({
        render: async ({ ctx }) => {
          await ctx.send("missing-route");
        },
      }),
    });

    getChat().currentRouteId = "/missing/child";

    const worker = hobonos.createWorker(root);
    await worker.run("chat_1", { text: "hello" });

    expect(getChat().currentRouteId).toBe("/");
    expect(getChat().storage.transcript).toEqual(["missing-route"]);
  });

  it("renders text components on navigation and when resolved directly", async () => {
    const { hobonos, getChat } = createHarness();

    const pricing = hobonos.route("pricing", {
      page: hobonos.page({
        components: [
          hobonos.text("intro", {
            label: "About pricing",
            examples: ["pricing info"],
            render: async ({ ctx }) => {
              await ctx.send("Plans start at $9");
            },
          }),
        ],
        render: async ({ ctx }) => {
          await ctx.send("pricing-page");
        },
      }),
    });

    const root = hobonos.rootRoute({
      routes: [pricing],
      page: hobonos.page({
        components: [
          hobonos.button("pricing", {
            label: "Pricing",
            onInteract: ({ navigate }) => {
              navigate(pricing);
            },
          }),
        ],
      }),
    });

    const worker = hobonos.createWorker(root);
    await bootWorker(worker);
    await worker.run("chat_1", { text: "pricing" });
    await worker.run("chat_1", { text: "pricing info" });

    expect(getChat().currentRouteId).toBe("/pricing");
    expect(getChat().storage.calls).toEqual([]);
    expect(getChat().storage.transcript).toEqual([
      "pricing-page",
      "Plans start at $9",
      "Plans start at $9",
    ]);
  });

  it("runs inquiry as a composed prompt flow", async () => {
    const { hobonos, getChat } = createHarness();

    const root = hobonos.rootRoute({
      page: hobonos.page({
        components: [
          hobonos
            .inquiry("signup", { label: "Signup", examples: ["signup"] })
            .input("email", {
              label: "Email",
              render: async ({ ctx }) => {
                await ctx.send("What is your email?");
              },
            })
            .input("plan", {
              label: "Plan",
              render: async ({ ctx, step }) => {
                await ctx.send(`What plan? ${step.label}`);
              },
            })
            .input("confirm", {
              label: "Reply yes to continue",
              render: async ({ ctx }) => {
                await ctx.send("Reply yes to continue.");
              },
            })
            .submit(async ({ answers, ctx, storage }) => {
              storage.signup = answers;
              await ctx.send("Signed up");
            }),
        ],
      }),
    });

    const worker = hobonos.createWorker(root);
    await bootWorker(worker);
    await worker.run("chat_1", { text: "signup" });
    await worker.run("chat_1", { text: "ada@example.com" });
    await worker.run("chat_1", { text: "pro" });
    await worker.run("chat_1", { text: "yes" });

    expect(getChat().focusedComponentId).toBeNull();
    expect(getChat().focusUntil).toBeNull();
    expect(getChat().storage).toMatchObject({
      signup: {
        email: "ada@example.com",
        plan: "pro",
        confirm: "yes",
      },
    });
    expect(getChat().storage.transcript).toEqual([
      "What is your email?",
      "What plan? Plan",
      "Reply yes to continue.",
      "Signed up",
    ]);
  });

  it("validates route and component names", () => {
    const { hobonos } = createHarness();

    expect(() => hobonos.route("bad-route")).toThrow(
      "Invalid route name 'bad-route'",
    );
    expect(() => hobonos.input("bad-input", { label: "Bad" })).toThrow(
      "Invalid component name 'bad-input'",
    );
  });
});
