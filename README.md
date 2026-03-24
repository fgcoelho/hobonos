# hobonos, build websites through messages.

`hobonos` is a flow-first engine for products where the user experience is driven by chat. You define flows as a graph of steps, branches, guards, actions, and side effects. Under the hood, the runtime persists flow state with XState snapshots.

## Install

```bash
pnpm add hobonos
```

## Philosophy

- Flows are graphs, not loose handlers
- Branches can be interruptible or locked
- Global intents like `support` or `cancel` should work everywhere you allow them
- Side effects should be explicit and localized
- Runtime state should be durable and resumable

## Core concepts

- `createFlowChat(...)`: create the chat runtime and flow authoring surface
- `chat.flow(...)`: build and register a flow graph
- `chat.handle(...)`: process an incoming message for a persisted chat
- `step`: the current node in the flow
- `branch`: a grouped region that can control exits and interruptions
- `guard`: decides whether a step or transition is allowed
- `action`: can mutate data and navigate with `goto`, `end`, `repeat`, `stay`
- `effect`: side effect without navigation intent

## Chat shape

Your persisted chat entity should extend `IFlowChat`.

```ts
import type { IFlowChat } from "hobonos";

type WebsiteChat = IFlowChat & {
  store: {
    userId?: string;
  };
};
```

Important flow fields managed by the runtime:

- `current_step`
- `current_branch`
- `flow_status`
- `flow_data`
- `flow_history`
- `flow_snapshot`

## Example

```ts
import { createFlowChat, type IFlowChat } from "hobonos";

type Message = {
  text: string;
};

type Chat = IFlowChat;

type Helpers = {
  send: (text: string) => Promise<void>;
};

const chat = createFlowChat<unknown, Message, Chat, Helpers>({
  parseMessage: (payload) => payload as Message,
  repository: {
    retrieveChat: async (chatId) => db.get(chatId),
    updateChat: async (chat) => db.set(chat.id, chat),
  },
  helpers: ({ chat, message }) => ({
    send: async (text) => sendMessage(chat.id, text, message),
  }),
  matchIntent: async ({ message, intents }) => {
    const text = message.text.toLowerCase();
    return intents.find((intent) => text.includes(intent.id))?.id ?? null;
  },
});

const nonEmpty = chat.matcher("nonEmpty", async ({ message }) => {
  return message.text.trim().length > 0;
});

const email = chat.matcher("email", async ({ message }) => {
  return /.+@.+\..+/.test(message.text.trim());
});

const announceRegistration = chat.effect("announceRegistration", async ({ helpers }) => {
  await helpers.send("Let's create your account.");
});

const hasName = chat.guard("hasName", async ({ data }) => Boolean(data.name));

const saveEmail = chat.action("saveEmail", async ({ message, data, goto }) => {
  data.email = message.text.trim();
  goto("done");
});

const supportFlow = chat
  .flow("support")
  .start((step) =>
    step
      .prompt(async ({ helpers }) => {
        await helpers.send("A human will reach out shortly.");
      })
      .end(),
  )
  .build();

const website = chat
  .flow("website")
  .start((step) =>
    step
      .onIntent("register", "ask_name")
      .onIntent("pricing", "pricing")
      .onIntent("support", "support"),
  )
  .globalIntent("support", "support", { policy: "always" })
  .branch(
    "registration",
    {
      allowExternalIntents: false,
      canExit: ({ toStepId }) => toStepId === "done",
    },
    (branch) =>
      branch
        .step("ask_name", (step) =>
          step
            .effect(announceRegistration)
            .prompt(async ({ helpers }) => {
              await helpers.send("What is your name?");
            })
            .onAnswer(
              nonEmpty,
              async ({ message, data, goto }) => {
                data.name = message.text.trim();
                goto("ask_email");
              },
            ),
        )
        .step("ask_email", (step) =>
          step
            .canEnter(hasName)
            .prompt(async ({ helpers }) => {
              await helpers.send("Now send me your email.");
            })
            .onAnswer(
              email,
              saveEmail,
              {
                effects: [async ({ helpers }) => helpers.send("Checking email...")],
              },
            )
            .otherwise(async ({ helpers, repeat }) => {
              await helpers.send("That doesn't look like an email.");
              repeat();
            }),
        )
        .step("done", (step) =>
          step
            .effect(async ({ helpers }) => {
              await helpers.send("Registration complete.");
            })
            .end(),
        ),
  )
  .step("pricing", (step) =>
    step
      .prompt(async ({ helpers }) => {
        await helpers.send("We have Starter, Pro, and Enterprise plans.");
      })
      .end(),
  )
  .step("support", (step) =>
    step.subflow(supportFlow, { returnTo: null })
  )
  .otherwise(async ({ helpers }) => {
    await helpers.send("I didn't understand that yet.");
  })
  .build();

await chat.handle("chat_123", { text: "register" });
```

## Usage guides

### 1. Boot a chat session

`chat.handle(...)` expects a persisted chat record to already exist. A simple in-memory setup is enough for local development and tests.

```ts
import { createFlowChat, type IFlowChat } from "hobonos";

type Message = { text: string };
type Chat = IFlowChat & {
  store: {
    transcript: string[];
  };
};

const chats: { chat_1?: Chat } = {};

const chat = createFlowChat<Message, Message, Chat, { send: (text: string) => Promise<void> }>({
  parseMessage: (payload) => payload,
  repository: {
    retrieveChat: async (chatId) => (chatId === "chat_1" ? chats.chat_1 ?? null : null),
    updateChat: async (next) => {
      chats.chat_1 = {
        id: "chat_1",
        ...next,
      } as Chat;
    },
  },
  helpers: ({ chat }) => ({
    send: async (text) => {
      chat.store.transcript.push(text);
    },
  }),
  matchIntent: async ({ message, intents }) => {
    const normalized = message.text.trim().toLowerCase();
    return intents.find((intent) => intent.id === normalized)?.id ?? null;
  },
});

chat
  .flow("website")
  .start((step) =>
    step
      .prompt(async ({ helpers }) => {
        await helpers.send("Say pricing to continue.");
      })
      .onIntent("pricing", "pricing"),
  )
  .step("pricing", (step) =>
    step
      .prompt(async ({ helpers }) => {
        await helpers.send("Starter is $19/month.");
      })
      .end(),
  )
  .build();

chats.chat_1 = {
  id: "chat_1",
  flow: "website",
  language: "en",
  locked: false,
  lock_until: null,
  store: {
    transcript: [],
  },
};

await chat.handle("chat_1", { text: "pricing" });

console.log(chats.chat_1?.store.transcript);
```

### 2. Pass params into answer matchers

Use `onAnswer(matcher, params, action)` when the same matcher should be reused with different constraints.

```ts
const minLength = chat.matcher(
  "minLength",
  async ({ message, params }) => message.text.trim().length >= (params as { size: number }).size,
);

chat
  .flow("lead")
  .start((step) =>
    step
      .prompt(async ({ helpers }) => {
        await helpers.send("What company do you work at?");
      })
      .onAnswer(minLength, { size: 3 }, async ({ message, data, goto }) => {
        data.company = message.text.trim();
        goto("done");
      })
      .otherwise(async ({ helpers, repeat }) => {
        await helpers.send("Please send at least 3 characters.");
        repeat();
      }),
  )
  .step("done", (step) => step.end())
  .build();
```

### 3. Add cancel or support everywhere

Global intents are the easiest way to keep escape hatches available across the whole flow.

```ts
chat
  .flow("checkout")
  .start((step) => step.onIntent("begin", "shipping"))
  .globalIntent("cancel", async ({ helpers, end }) => {
    await helpers.send("No problem - I cancelled the flow.");
    end();
  }, { policy: "always" })
  .globalIntent("support", "human_handoff", { policy: "always" })
  .step("shipping", (step) =>
    step.prompt(async ({ helpers }) => {
      await helpers.send("Where should we ship your order?");
    }),
  )
  .step("human_handoff", (step) =>
    step
      .prompt(async ({ helpers }) => {
        await helpers.send("A human will take over from here.");
      })
      .end(),
  )
  .build();
```

Use `policy: "respectBranch"` when a locked branch should be allowed to block most global routes.

### 4. Reuse a verification flow with subflows

Subflows are useful when a step should hand off to another flow and then return to a known step in the parent.

```ts
const verifyEmail = chat
  .flow("verify_email")
  .start((step) =>
    step
      .prompt(async ({ helpers }) => {
        await helpers.send("Send the 6-digit code from your inbox.");
      })
      .onAnswer(async ({ message }) => /^\d{6}$/.test(message.text.trim()), async ({ goto }) => {
        goto("verified");
      }),
  )
  .step("verified", (step) => step.end())
  .build();

chat
  .flow("signup")
  .start((step) => step.onIntent("register", "verify"))
  .step("verify", (step) => step.subflow(verifyEmail, { returnTo: "complete" }))
  .step("complete", (step) =>
    step
      .prompt(async ({ helpers }) => {
        await helpers.send("Your account is verified and ready.");
      })
      .end(),
  )
  .build();
```

When the child flow ends, `hobonos` pops the parent from `flow_stack` and resumes at `returnTo`.

### 5. Route between flows

If one flow should hand off to another, model the handoff as a subflow step. Use `returnTo: null` when you want the child flow to fully take over instead of resuming the parent.

```ts
const sales = chat
  .flow("sales")
  .start((step) =>
    step
      .prompt(async ({ helpers }) => {
        await helpers.send("Tell me what you want to buy.");
      })
      .onIntent("support", "support_handoff")
      .otherwise(async ({ helpers, repeat }) => {
        await helpers.send("You can describe your order or say support.");
        repeat();
      }),
  )
  .build();

const support = chat
  .flow("support")
  .start((step) =>
    step
      .prompt(async ({ helpers }) => {
        await helpers.send("Support here. What do you need help with?");
      })
      .onIntent("billing", "billing")
      .otherwise(async ({ helpers, repeat }) => {
        await helpers.send("Say billing if you need account help.");
        repeat();
      }),
  )
  .step("billing", (step) =>
    step
      .prompt(async ({ helpers }) => {
        await helpers.send("I can help with invoices and payment failures.");
      })
      .end(),
  )
  .build();

chat
  .flow("router")
  .start((step) =>
    step
      .prompt(async ({ helpers }) => {
        await helpers.send("Say sales or support.");
      })
      .onIntent("sales", "to_sales")
      .onIntent("support", "to_support"),
  )
  .step("to_sales", (step) => step.subflow(sales, { returnTo: null }))
  .step("to_support", (step) => step.subflow(support, { returnTo: null }))
  .build();
```

After the handoff, the chat's `flow` field is updated to the child flow id, so the next `chat.handle(...)` call continues inside that routed flow.

### 6. Understand the message lifecycle

For each `chat.handle(chatId, payload)` call, the runtime does this in order:

- loads the persisted chat from your repository
- parses the incoming payload with `parseMessage`
- creates helpers for the specific chat and message
- tries matching global intents
- tries matching step intents
- tries matching step answer routes
- runs the step `otherwise(...)`, then the flow `otherwise(...)`
- persists the updated flow snapshot and chat fields back through `updateChat`

This ordering is useful when you are deciding whether something should be modeled as an intent, an answer matcher, or a fallback.

## Builder API

### Flow

- `chat.flow(id)`
- `start(configure)`
- `step(id, configure)`
- `branch(id, options, configure)`
- `globalIntent(intentId, actionOrTarget, options?)`
- `otherwise(action)`
- `build()`

### Step

- `canEnter(guard)`
- `prompt(action)`
- `effect(effect)`
- `onExit(effect)`
- `onIntent(intentId, actionOrTarget, options?)`
- `onAnswer(matcher, paramsOrAction, actionMaybe?, options?)`
- `otherwise(action)`
- `end()`

## Guards, actions, and side effects

Use them with different responsibilities:

- `guard`: decide whether the transition or step is allowed
- `action`: mutate data and navigate
- `effect`: perform side effects like sending messages, logging, analytics, webhooks, cache writes

Good rule of thumb:

- use `effect(...)` for things that should happen
- use `prompt(...)` when the step actively speaks to the user and may redirect
- use transition `effects` for route-scoped side effects
- use `canEnter(...)` or route `guard` for constraints

You can register reusable behavior once and reference it through returned handles:

- `const hasName = chat.guard("hasName", fn)`
- `const saveLead = chat.action("saveLead", fn)`
- `const notifyOps = chat.effect("notifyOps", fn)`
- `const email = chat.matcher("email", fn)`

This keeps large flows readable without magic strings.

## Branches and global intents

Branches let you model flows like registration, checkout, onboarding, and claim flows.

Useful branch controls:

- `allowExternalIntents: false`: blocks non-`always` global intents while inside the branch
- `canExit(...)`: prevents leaving a branch unless the branch allows it

Useful global-intent policies:

- `respectBranch`: works unless the branch blocks external intents
- `always`: always available, even inside locked branches

This is useful for things like:

- `support`
- `cancel`
- `restart`
- `speak_to_human`

## Subflows

Subflows let one flow enter another flow cleanly.

- use `step.subflow(childFlow, { returnTo })`
- the parent flow is pushed onto `flow_stack`
- when the child flow ends, the runtime resumes the parent flow on the configured return step

This is useful for:

- auth inside checkout
- support handoff from anywhere
- reusable registration or verification flows
- nested onboarding sequences

## XState integration

`hobonos` uses XState internally to represent the active flow machine.

That gives you:

- explicit state transitions
- durable snapshots via `flow_snapshot`
- rehydration between messages
- a cleaner foundation for more advanced orchestration over time

You still author flows with the `hobonos` flow DSL rather than raw XState config.

## Runtime API

- `chat.handle(chatId, payload)` processes a new incoming message
- `chat.flows()` returns the registered flow definitions
- `chat.flow(id)` creates and registers a flow when `.build()` is called

## Current scope

The package is optimized for chat-driven products, not generic workflow automation.

It is especially useful when you want to build:

- onboarding through messages
- guided checkouts
- registration and verification flows
- support funnels
- chat-driven website navigation

## Status

The API is evolving toward stronger support for:

- richer named guards and actions
- more explicit side-effect orchestration
- reusable matcher and policy libraries
- more advanced flow composition
