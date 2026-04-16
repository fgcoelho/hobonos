# hobonos, build websites through messages.

`hobonos` is a conversational router. Routes own pages, pages own components, and each incoming message resolves to the component the user is trying to interact with.

It is inspired by prompt libraries like `@inquirer/prompts`, but it is built for persistent chat state, route navigation, and component resolution across a conversational UI.

## Install

```bash
pnpm add hobonos
```

## Mental Model

- a route owns one `page`
- a page exposes `components: []`
- each component has a `label` used for matching and guidance
- your app sends actual user-facing copy with `ctx.send(...)` or helpers from middleware
- some components act immediately, others focus and wait for the next reply
- `help` is the fallback component for current-component resolution failures
- `notFound` is for invalid route resolution

## Core API

- `createHobonos({ parseMessage, repository, resolveComponent, defaultFocusDuration? })`
- `.middleware(async ({ chat, message, ctx }) => ({ ctx: { ... } }))`
- `hobonos.route(name, { routes?, layout?, page?, guard?, notFound? })`
- `hobonos.rootRoute({ routes?, layout?, page?, guard?, notFound? })`
- `hobonos.layout({ render?, components? })`
- `hobonos.page({ render?, components? })`
- `hobonos.text(id, options)`
- `hobonos.button(id, options)`
- `hobonos.input(id, options)`
- `hobonos.inquiry(id, options)`
- `hobonos.back(options)`
- `hobonos.help({ render })`

Route-local `guard` and `notFound` are configured directly on `route(..., { ... })`.

Create workers with the branded app root only:

```ts
const root = hobonos.rootRoute({ routes: [support] });
const worker = hobonos.createWorker(root);
```

## Chat

There is only one chat model: `IChat`.

Managed fields:

- `currentRouteId`
- `storage`
- `history`
- `focusedComponentId`
- `focusUntil`
- `inquiries`

## End-To-End Example

```ts
import ai from "ai";
import { createHobonos, type IChat } from "hobonos";

type Message = { text: string };
type ChatStorage = {
  transcript: string[];
  email?: string;
  signup?: Record<string, unknown>;
};

type Chat = IChat<ChatStorage>;

const hobonos = createHobonos<Message, Message, Chat>({
  parseMessage: (payload) => payload,
  repository: {
    retrieveChat: async (chatId) => db.get(chatId),
    updateChat: async (chat) => db.set(chat.id, chat),
  },
  resolveComponent: async ({ message, components }) => {
    const decision = await ai.generateObject({
      prompt: [
        "Pick the visible component the user is trying to use.",
        JSON.stringify({
          message: message.text,
          components: components.map((component) => ({
            id: component.id,
            label: component.label,
            examples: component.examples ?? [],
          })),
        }),
      ].join("\n"),
      schema: {
        componentId: "string | null",
        input: "string | undefined",
      },
    });

    if (!decision.object.componentId) return null;

    return {
      id: decision.object.componentId,
      input: decision.object.input,
    };
  },
})
  .middleware(async ({ chat }) => ({
    ctx: {
      send: async (text: string) => {
        chat.storage.transcript.push(text);
      },
    },
  }));

const plans = hobonos.route("plans", {
  page: hobonos.page({
    render: async ({ ctx }) => {
      await ctx.send("Plans page");
    },
    components: [
      hobonos.text("pricingInfo", {
        label: "Pricing info",
        examples: ["plans"],
        render: async ({ ctx }) => {
          await ctx.send("We offer Starter, Pro, and Enterprise.");
        },
      }),
      hobonos.back({}),
    ],
  }),
});

const support = hobonos.rootRoute({
  routes: [plans],
  page: hobonos.page({
    render: async ({ ctx }) => {
      await ctx.send("Support home");
    },
    components: [
      hobonos.button("plans", {
        label: "Pricing",
        examples: ["pricing"],
        onInteract: ({ navigate }) => {
          navigate(plans);
        },
      }),
      hobonos.input("email", {
        label: "Email",
        examples: ["share email"],
        render: async ({ ctx }) => {
          await ctx.send("What is your email?");
        },
        onInteract: async ({ input, message, storage, ctx }) => {
          storage.email = (input ?? message.text).trim();
          await ctx.send("Saved.");
        },
      }),
      hobonos.help({
        render: async ({ ctx, components }) => {
          await ctx.send(
            `Try one of: ${components.map((component) => component.label).join(", ")}`,
          );
        },
      }),
    ],
  }),
});
```

## How Interaction Works

1. your app receives a raw payload
2. `parseMessage` normalizes it
3. on the very first user message, hobonos renders the current page and stops there
4. `resolveComponent` receives the currently visible components
5. the matched component runs, or an `input` can receive direct `input` from the resolver
6. focused components store focus and handle the next reply
7. focused components can optionally set `focusUntil` from `focusDuration`
8. `navigate(...)` changes route and clears focus

Use `hobonos.rootRoute(...)` for the app root instead of writing `route("")` directly. `createWorker(...)` requires that branded root route.

Route ids are absolute paths like `/` or `/plans`.

Component ids are `routeId:name`, like `/:email` or `/support:email`.

Route names and component names must contain only letters and numbers.

Visible components include:

- layout components from root to leaf
- the current page's components
- canonical built-ins like `back` and `help` when you include them in `components: []`

## Middleware Context

`createHobonos()` returns the app directly. Middleware extends `ctx`.

```ts
const hobonos = createHobonos({
  parseMessage,
  repository,
  resolveComponent,
})
  .middleware(async () => ({
    ctx: {
      db,
    },
  }))
  .middleware(async ({ ctx }) => ({
    ctx: {
      ...ctx,
      send,
    },
  }));
```

Everything returned in `ctx` is available in route guards, page render handlers, and component handlers.

## Route Guards

Use `guard` to allow or deny entering a route. Guards run only when hobonos is about to enter a route, such as first boot or `navigate(...)`.

They must return `true` or `false`. If a guard returns `false`, hobonos stays on the current route. You can send a message or run any other side effect before returning `false`.

```ts
const billing = hobonos.route("billing", {
  guard: async ({ ctx, storage }) => {
    if (!storage.email) {
      await ctx.send("Share your email first.");
      return false;
    }

    return true;
  },
  page: hobonos.page({ components: [] }),
});
```

## Component Guide

Pages expose `components: []`.

- `text`: non-focused content component
- `button`: immediate component with `onInteract`
- `input`: focused free-text component
- `inquiry`: focused multi-step component built by composing `input`
- `back`: navigation component that lives in `components: []`
- `help`: fallback component that also lives in `components: []`

`label` identifies the component. It is not the text automatically sent to the user. Sending copy is your app's job.

`storage` is the single end-user state bag on `chat`. Use it for transcript state, temporary values, or persisted flow answers.

Routes are nested directly with `route(..., { routes: [...] })`. There is no `parent` option or `routes()` helper.

### text

Use `text` for displayable content that does not focus and does not take an action.

```ts
hobonos.text("hours", {
  label: "Business hours",
  examples: ["hours"],
  render: async ({ ctx }) => {
    await ctx.send("We are open Monday to Friday, 9am to 6pm.");
  },
});
```

`text` also participates in `resolveComponent`, so users can explicitly ask for it.

### button

Use `button` for immediate actions.

```ts
hobonos.button("pricing", {
  label: "Pricing",
  onInteract: ({ navigate }) => {
    navigate(plans);
  },
});
```

- `button` never focuses
- if a button should navigate, call `navigate(...)` inside `onInteract`

### input

Use `input` for free text.

```ts
hobonos.input("email", {
  label: "Email",
  render: async ({ ctx }) => {
    await ctx.send("What is your email?");
  },
  onInteract: async ({ input, message, storage }) => {
    storage.email = (input ?? message.text).trim();
  },
});
```

`input` focuses and forwards the next raw reply to `onInteract`.

`resolveComponent` can also return `{ id, input }` for an `input` component when the user already provided the value in the same message.

Use `unfocus()` inside `onInteract` when you want to stop the current focused flow without navigating:

```ts
hobonos.input("email", {
  label: "Email",
  render: async ({ ctx }) => {
    await ctx.send("What is your email?");
  },
  onInteract: async ({ input, message, ctx, unfocus }) => {
    const email = input ?? message.text;
    if (email.trim().toLowerCase() === "cancel") {
      unfocus();
      await ctx.send("Okay, cancelled.");
      return;
    }

    await ctx.send("Saved.");
  },
});
```

### inquiry

Use `inquiry` when a single component should drive a multi-step prompt flow with multiple `input` steps.

```ts
const signup = hobonos
  .inquiry("signup", {
    label: "Signup",
    examples: ["signup"],
  })
  .input("email", {
    label: "Email",
    render: async ({ ctx }) => {
      await ctx.send("What is your email?");
    },
  })
  .input("plan", {
    label: "Plan",
    render: async ({ ctx }) => {
      await ctx.send("Which plan do you want?");
    },
  })
  .input("confirmation", {
    label: "Confirmation",
    render: async ({ ctx }) => {
      await ctx.send("Type yes to continue.");
    },
  })
  .submit(async ({ answers, ctx, storage }) => {
    storage.signup = answers;
    await ctx.send("Signed up.");
  });
```

`inquiry` behaves like a composed prompt flow:

- users resolve the inquiry by its outer `label`
- once focused, each step runs in order
- answers are collected by step id
- `.submit(...)` runs after the final step
- after `.submit(...)`, the inquiry leaves focus by default
- navigation inside `.submit(...)` still clears focus

### focusDuration and focusUntil

Focusable components support `focusDuration` in milliseconds.

You can also set `defaultFocusDuration` once at `createHobonos(...)`. Per-component `focusDuration` wins when present.

```ts
hobonos.input("email", {
  label: "Email",
  focusDuration: 120_000,
  render: async ({ ctx }) => {
    await ctx.send("What is your email?");
  },
});
```

When a focused component has an effective duration, `chat.focusUntil` is set to `Date.now() + duration`.

If a new user message arrives after `Date.now() > chat.focusUntil`, hobonos clears the expired focused state before resolving that message.

If neither the component nor the app config provides a positive duration, `focusUntil` stays `null`.

### back

Use `back` as a regular component for backwards navigation.

`hobonos.back(...)` always creates the same component metadata:

- id segment: `back`
- label: `Back`
- examples: `["back", "go back"]`

```ts
hobonos.back({
  render: async ({ ctx, breadcrumbs }) => {
    await ctx.send(
      `Where back? ${breadcrumbs.map((crumb) => crumb.label).join(", ")}`,
    );
  },
  onInteract: async ({ message, breadcrumbs, goBack }) => {
    const crumb = breadcrumbs.find(
      (entry) =>
        entry.label.toLowerCase() === message.text.trim().toLowerCase(),
    );
    goBack(crumb);
  },
})
```

Without a custom `onInteract`, `back` uses the previous breadcrumb by default.

If `render` is present, selecting `back` focuses it first. Without `render`, selecting `back` immediately navigates to the previous breadcrumb.

### help

`help` is the fallback component for current-component resolution failures.

`hobonos.help({ render })` always creates the same component metadata:

- id segment: `help`
- label: `Help`
- examples: `["help"]`

Use it when:

- the current route is valid, but the current component cannot be resolved
- a user message does not map to a component on the current route
- a previously focused component cannot be recovered anymore

It runs on a valid route. If the route itself cannot be resolved, use `notFound`.

`help` is for recovery-level edge cases - the situations where the runtime would otherwise have to fail because it cannot determine the current component interaction safely.

```ts
hobonos.help({
  render: async ({ ctx, components }) => {
    await ctx.send(
      `Try one of: ${components.map((component) => component.label).join(", ")}`,
    );
  },
})
```

How `help` behaves:

- it is fallback guidance, like a text component used only on failure
- it receives visible components, so it can suggest labels/examples
- page-level help components win first
- if the page has no help component, the nearest ancestor layout help component can handle it

## Layouts

Layouts are cumulative from root to leaf.

- layout renders run before the page render
- layout components are visible to descendant routes
- layout help components can recover interactions when a page does not define its own help

```ts
const root = hobonos.rootRoute({
  layout: hobonos.layout({
    render: async ({ ctx }) => {
      await ctx.send("Root layout");
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
```

## help vs notFound

Use `help` when the route is valid but the current component cannot be resolved.

Use `notFound` when the current route cannot be resolved anymore.

```ts
const root = hobonos.rootRoute({
  page: hobonos.page({ components: [] }),
  notFound: hobonos.page({
    render: async ({ ctx }) => {
      await ctx.send("That route no longer exists.");
    },
  }),
});
```

## Focus And Navigation

Focused components:

- `input`
- `inquiry`
- `back` when it has `render`

Immediate components:

- `text`
- `button`

Navigation rules:

- `navigate(routeHandle)` changes route
- route navigation clears focus
- focused interactions stay on the current route unless they navigate
- unresolved current-component edge cases fall back to `help`

## Source Layout

The codebase is organized around the route-centric conversation runtime now:

- `src/conversation/api`: public builders like `createHobonos`
- `src/conversation/contracts`: chat and repository contracts
- `src/conversation/model`: routes, pages, components, handles, and public types
- `src/conversation/runtime`: focus, navigation, rendering, route composition, and worker execution

Public exports live in `src/exports/*`.

Internal implementation lives in:

- `src/conversation/*`
- `src/shared/*`

## Resolver Example

`resolveComponent` chooses from the visible components on the current route. It can also return `{ id, input }` when the user both references an `input` component and already provides its value.

```ts
import ai from "ai";

resolveComponent: async ({ message, components }) => {
  const decision = await ai.generateObject({
    prompt: [
      "Choose the best visible component for this user message.",
      "If the user already supplied a value for an input component, return it in input.",
      JSON.stringify({
        message: message.text,
        components: components.map((component) => ({
          id: component.id,
          label: component.label,
          examples: component.examples ?? [],
        })),
      }),
    ].join("\n"),
    schema: {
      componentId: "string | null",
      input: "string | undefined",
    },
  });

  if (!decision.object.componentId) return null;

  return {
    id: decision.object.componentId,
    input: decision.object.input,
  };
}
```

That includes `help`: if your resolver intentionally chooses the visible help component, the runtime treats it like any other resolved component.

## Navigation Helpers

- `navigate(routeHandle)` changes routes and clears focus
- `focus(component.handle)` enters a focused component manually
- `unfocus()` clears the current focused interaction without navigating
- breadcrumbs are available to `back`
