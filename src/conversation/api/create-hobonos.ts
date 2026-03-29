import type { IChat } from "../contracts/chat";
import type {
  BackOptions,
  ButtonOptions,
  ComponentHandle,
  CreateHobonosConfig,
  DefinedRoute,
  HelpOptions,
  HobonosApi,
  HobonosMiddleware,
  InputOptions,
  InquiryBuilder,
  InquiryOptions,
  InquirySubmitHandler,
  LayoutDefinition,
  LayoutOptions,
  PageDefinition,
  PageOptions,
  ResolvedComponent,
  RootDefinedRoute,
  RouteOptions,
  TextOptions,
} from "../model";
import {
  clearExpiredFocus,
  clearFocusState,
  focusComponent,
  resolveFocusedComponent,
} from "../runtime/focus";
import {
  runBack,
  runButton,
  runFocusedBack,
  runFocusedInput,
  runFocusedInquiry,
  runHelp,
  runInput,
  runMiddlewares,
  runNotFound,
  runResolvedHelp,
  runText,
  toVisibleComponents,
} from "../runtime/handlers";
import { renderRoute } from "../runtime/navigation";
import {
  collectRoutes,
  composeRoutes,
  getRouteLayouts,
  getRoutePage,
  getRouteStack,
  resolveRoutePages,
} from "../runtime/routes";
import { normalizeAppState, recordHistory } from "../runtime/state";

const NAME_PATTERN = /^[A-Za-z0-9]+$/;
const ROOT_ROUTE_NAME = "";

const assertValidName = (
  kind: "route" | "component" | "inquiry step",
  name: string,
) => {
  if (!NAME_PATTERN.test(name)) {
    const suggestion =
      kind === "route" && name === ""
        ? " Use hobonos.rootRoute(...) for the app root."
        : "";
    throw new Error(
      `Invalid ${kind} name '${name}'. ${kind[0].toUpperCase()}${kind.slice(1)} names must contain only letters and numbers.${suggestion}`,
    );
  }
};

const getFallbackRouteIds = (routeId: string) => {
  const fallbackIds: string[] = [];
  let current = routeId;

  while (current !== "/") {
    fallbackIds.push(current);
    const lastSlash = current.lastIndexOf("/");
    if (lastSlash <= 0) {
      current = "/";
      continue;
    }

    current = current.slice(0, lastSlash);
  }

  fallbackIds.push("/");
  return fallbackIds;
};

const createComponentHandle = (
  routeId: string,
  id: string,
): ComponentHandle => ({
  kind: "component",
  id,
  routeId,
});

const toResolvedComponentId = (resolved: ResolvedComponent) =>
  typeof resolved === "string" ? resolved : (resolved?.id ?? null);

const toResolvedInput = (resolved: ResolvedComponent) =>
  typeof resolved === "string" ? undefined : resolved?.input;

const createPageDefinition = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(
  options: PageOptions<Chat, Message, Ctx>,
): PageDefinition<Chat, Message, Ctx> => ({
  kind: "page",
  render: options.render,
  components: options.components ?? [],
});

const createLayoutDefinition = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(
  options: LayoutOptions<Chat, Message, Ctx>,
): LayoutDefinition<Chat, Message, Ctx> => ({
  kind: "layout",
  render: options.render,
  components: options.components ?? [],
});

const createRouteRecord = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(
  name: string,
  options?: RouteOptions<Chat, Message, Ctx>,
  input?: { skipValidation?: boolean },
): DefinedRoute<Chat, Message, Ctx> => {
  if (!input?.skipValidation) {
    assertValidName("route", name);
  }
  return {
    kind: "route",
    id: `/${name}`,
    name,
    parentId: null,
    layout: options?.layout,
    page: options?.page,
    middlewares: options?.middleware ?? [],
    notFound: options?.notFound,
    children: options?.routes ?? [],
  };
};

const createRootRouteRecord = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(
  options?: RouteOptions<Chat, Message, Ctx>,
): RootDefinedRoute<Chat, Message, Ctx> => ({
  ...createRouteRecord(ROOT_ROUTE_NAME, options, { skipValidation: true }),
  __rootRoute: true,
});

const mergeMiddlewareResult = <Ctx extends Record<string, any>>(
  target: Ctx,
  result: void | Record<string, any> | { ctx: Record<string, any> },
) => {
  if (!result) {
    return target;
  }

  const next = "ctx" in result ? result.ctx : result;
  Object.assign(target, next);
  return target;
};

const createInquiryBuilder = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(
  id: string,
  options: InquiryOptions<Chat, Message, Ctx>,
): InquiryBuilder<Chat, Message, Ctx> => {
  assertValidName("component", id);
  const inquiryId = id;
  const inquiry: InquiryBuilder<Chat, Message, Ctx> = {
    kind: "inquiry",
    id: inquiryId,
    handle: createComponentHandle("", inquiryId),
    label: options.label,
    description: options.description,
    examples: options.examples,
    focusDuration: options.focusDuration,
    steps: [],
    input(stepId, stepOptions) {
      assertValidName("inquiry step", stepId);
      inquiry.steps.push({
        kind: "input",
        id: stepId,
        label: stepOptions.label,
        description: stepOptions.description,
        examples: stepOptions.examples,
        handle: createComponentHandle("", `${inquiryId}:input:${stepId}`),
        render: stepOptions.render as any,
      });
      return inquiry;
    },
    submit(handler: InquirySubmitHandler<Chat, Message, Ctx>) {
      inquiry.onSubmit = handler;
      return inquiry;
    },
  };

  return inquiry;
};

const createApi = <
  ReceivedMessage,
  ParsedMessage extends { text?: string },
  Chat extends IChat,
  Ctx extends Record<string, any>,
>(input: {
  config: CreateHobonosConfig<Chat, ReceivedMessage, ParsedMessage, Ctx>;
  middlewares: HobonosMiddleware<Chat, ParsedMessage, any, any>[];
}): HobonosApi<ReceivedMessage, ParsedMessage, Chat, Ctx> => {
  const api: HobonosApi<ReceivedMessage, ParsedMessage, Chat, Ctx> = {
    middleware(middleware) {
      return createApi({
        config: input.config as any,
        middlewares: [...input.middlewares, middleware],
      }) as any;
    },
    route(name, options) {
      return createRouteRecord(name, options);
    },
    rootRoute(options) {
      return createRootRouteRecord(options);
    },
    page(options) {
      return createPageDefinition(options);
    },
    layout(options) {
      return createLayoutDefinition(options);
    },
    help(options: HelpOptions<Chat, ParsedMessage, Ctx>) {
      const id = "help";
      return {
        kind: "help" as const,
        id,
        handle: createComponentHandle("", id),
        label: "Help",
        examples: ["help"],
        render: options.render,
      };
    },
    text(id, options: TextOptions<Chat, ParsedMessage, Ctx>) {
      assertValidName("component", id);
      const componentId = id;
      return {
        kind: "text" as const,
        id: componentId,
        handle: createComponentHandle("", componentId),
        label: options.label,
        description: options.description,
        examples: options.examples,
        render: options.render,
      };
    },
    button(id, options: ButtonOptions<Chat, ParsedMessage, Ctx>) {
      assertValidName("component", id);
      const componentId = id;
      return {
        kind: "button" as const,
        id: componentId,
        handle: createComponentHandle("", componentId),
        label: options.label,
        description: options.description,
        examples: options.examples,
        onInteract: options.onInteract,
      };
    },
    input(id, options: InputOptions<Chat, ParsedMessage, Ctx>) {
      assertValidName("component", id);
      const componentId = id;
      return {
        kind: "input" as const,
        id: componentId,
        handle: createComponentHandle("", componentId),
        label: options.label,
        description: options.description,
        examples: options.examples,
        focusDuration: options.focusDuration,
        render: options.render,
        onInteract: options.onInteract,
      };
    },
    inquiry(id, options) {
      return createInquiryBuilder(id, options);
    },
    back(options) {
      const componentId = "back";
      return {
        kind: "back" as const,
        id: componentId,
        handle: createComponentHandle("", componentId),
        label: "Back",
        examples: ["back", "go back"],
        focusDuration: options.focusDuration,
        render: options.render,
        onInteract: options.onInteract,
      };
    },
    createWorker(rootRoute) {
      const composed = composeRoutes(rootRoute);
      resolveRoutePages(composed.root);
      const routesById = collectRoutes(composed.root);

      return {
        run: async (chatId, payload) => {
          const chatRecord = await input.config.repository.retrieveChat(chatId);
          if (!chatRecord) {
            throw new Error("Chat record not found");
          }

          const chat = normalizeAppState(
            new Proxy(chatRecord, {
              get: Reflect.get,
              set: Reflect.set,
            }) as Chat,
          );
          clearExpiredFocus(chat);
          const message = input.config.parseMessage(payload);
          const ctx = {} as Ctx;
          for (const middleware of input.middlewares) {
            mergeMiddlewareResult(
              ctx,
              await middleware({ chat, message, ctx }),
            );
          }

          const requestedRouteId = chat.currentRouteId ?? composed.root.id;
          let currentRoute = routesById.get(requestedRouteId);
          let routeMissing = false;
          if (!currentRoute) {
            routeMissing = true;
            const fallbackIds = getFallbackRouteIds(requestedRouteId);
            for (const fallbackRouteId of fallbackIds) {
              currentRoute = routesById.get(fallbackRouteId);
              if (currentRoute) {
                break;
              }
            }
            currentRoute ??= composed.root;
            chat.currentRouteId = currentRoute.id;
          } else if (!chat.currentRouteId) {
            chat.currentRouteId = currentRoute.id;
          }

          const isFirstMessage = (chat.history?.length ?? 0) === 0;

          if (isFirstMessage && !routeMissing) {
            await renderRoute({
              route: currentRoute,
              chat,
              message,
              ctx,
              routesById,
            });
            recordHistory({ chat, routeId: currentRoute.id, reason: "render" });

            await input.config.repository.updateChat(chat);
            return;
          }

          const routeStack = getRouteStack({ route: currentRoute, routesById });
          const layouts = getRouteLayouts({ routeStack });
          const currentPage = getRoutePage({ route: currentRoute });
          const components = toVisibleComponents({
            layouts,
            page: currentPage,
          });

          let routeNotFoundHandled = false;
          if (routeMissing) {
            routeNotFoundHandled = await runNotFound({
              routeStack,
              currentRoute,
              components,
              chat,
              message,
              ctx,
              routesById,
              defaultFocusDuration: input.config.defaultFocusDuration,
            });
          }
          const middlewareHandled = routeNotFoundHandled
            ? true
            : await runMiddlewares({
                routeStack,
                currentRoute,
                currentPage,
                chat,
                message,
                ctx,
                routesById,
                defaultFocusDuration: input.config.defaultFocusDuration,
              });

          if (!middlewareHandled) {
            const focused = resolveFocusedComponent({
              chat,
              currentRoute,
              currentPage,
              routeStack,
            });
            if (chat.focusedComponentId && !focused) {
              clearFocusState(chat);
              await runHelp({
                route: currentRoute,
                layouts,
                currentPage,
                components,
                chat,
                message,
                ctx,
                routeStack,
                routesById,
                defaultFocusDuration: input.config.defaultFocusDuration,
              });
            } else if (focused) {
              if (focused.component.kind === "input") {
                await runFocusedInput({
                  route: currentRoute,
                  currentPage,
                  component: focused.component as any,
                  chat,
                  message,
                  ctx,
                  routeStack,
                  routesById,
                  defaultFocusDuration: input.config.defaultFocusDuration,
                });
              } else if (focused.component.kind === "inquiry") {
                await runFocusedInquiry({
                  route: currentRoute,
                  currentPage,
                  inquiry: focused.component as any,
                  chat,
                  message,
                  ctx,
                  routeStack,
                  routesById,
                  defaultFocusDuration: input.config.defaultFocusDuration,
                });
              } else if (focused.component.kind === "back") {
                await runFocusedBack({
                  route: currentRoute,
                  currentPage,
                  component: focused.component as any,
                  chat,
                  message,
                  ctx,
                  routeStack,
                  routesById,
                  defaultFocusDuration: input.config.defaultFocusDuration,
                });
              }
            } else {
              const resolvedComponent = await input.config.resolveComponent({
                chat,
                message,
                ctx,
                route: currentRoute,
                routeStack,
                components,
              });
              const matchedComponentId =
                toResolvedComponentId(resolvedComponent);
              const matchedInput = toResolvedInput(resolvedComponent);

              const text = components.find(
                (entry) =>
                  entry.kind === "text" && entry.id === matchedComponentId,
              );
              const help = components.find(
                (entry) =>
                  entry.kind === "help" && entry.id === matchedComponentId,
              );
              const button = components.find(
                (entry) =>
                  entry.kind === "button" && entry.id === matchedComponentId,
              );
              const back = components.find(
                (entry) =>
                  entry.kind === "back" && entry.id === matchedComponentId,
              );

              if (help?.kind === "help") {
                await runResolvedHelp({
                  route: currentRoute,
                  currentPage,
                  component: help as any,
                  components,
                  chat,
                  message,
                  ctx,
                  routeStack,
                  routesById,
                  defaultFocusDuration: input.config.defaultFocusDuration,
                });
              } else if (text?.kind === "text") {
                await runText({
                  route: currentRoute,
                  currentPage,
                  text: text as any,
                  chat,
                  message,
                  ctx,
                  routeStack,
                  routesById,
                  defaultFocusDuration: input.config.defaultFocusDuration,
                });
              } else if (button?.kind === "button") {
                await runButton({
                  route: currentRoute,
                  currentPage,
                  button: button as any,
                  chat,
                  message,
                  ctx,
                  routeStack,
                  routesById,
                  defaultFocusDuration: input.config.defaultFocusDuration,
                });
              } else if (back?.kind === "back") {
                await runBack({
                  route: currentRoute,
                  currentPage,
                  back: back as any,
                  chat,
                  message,
                  ctx,
                  routeStack,
                  routesById,
                });
              } else {
                const interactive = components.find(
                  (entry) =>
                    (entry.kind === "input" || entry.kind === "inquiry") &&
                    entry.id === matchedComponentId,
                );

                if (
                  interactive?.kind === "input" &&
                  typeof matchedInput === "string"
                ) {
                  await runInput({
                    route: currentRoute,
                    currentPage,
                    component: interactive as any,
                    chat,
                    message,
                    ctx,
                    routeStack,
                    routesById,
                    value: matchedInput,
                    defaultFocusDuration: input.config.defaultFocusDuration,
                  });
                } else if (interactive) {
                  await focusComponent({
                    chat,
                    message,
                    ctx,
                    currentRoute,
                    currentPage,
                    routeStack,
                    componentId: interactive.id,
                    routesById,
                    reason: "focus",
                    defaultFocusDuration: input.config.defaultFocusDuration,
                  });
                } else {
                  await runHelp({
                    route: currentRoute,
                    layouts,
                    currentPage,
                    components,
                    chat,
                    message,
                    ctx,
                    routeStack,
                    routesById,
                    defaultFocusDuration: input.config.defaultFocusDuration,
                  });
                }
              }
            }
          }

          await input.config.repository.updateChat(chat);
        },
      };
    },
  };

  return api;
};

export const createHobonos = <
  ReceivedMessage,
  ParsedMessage extends { text?: string },
  Chat extends IChat,
>(
  config: CreateHobonosConfig<Chat, ReceivedMessage, ParsedMessage, {}>,
) =>
  createApi<ReceivedMessage, ParsedMessage, Chat, {}>({
    config,
    middlewares: [],
  });
