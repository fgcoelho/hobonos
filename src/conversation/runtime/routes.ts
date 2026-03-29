import type { IChat } from "../contracts/chat";
import type {
  BackDefinition,
  ButtonDefinition,
  ComponentHandle,
  DefinedRoute,
  HelpDefinition,
  InputDefinition,
  InquiryDefinition,
  LayoutDefinition,
  PageDefinition,
  ResolvedLayoutDefinition,
  ResolvedPageDefinition,
  RootDefinedRoute,
  TextDefinition,
} from "../model";

const createRouteId = (name: string, parentId?: string | null) => {
  if (!parentId) {
    return name ? `/${name}` : "/";
  }

  if (parentId === "/") {
    return name ? `/${name}` : "/";
  }

  return name ? `${parentId}/${name}` : parentId;
};

const createComponentId = (routeId: string, componentName: string) =>
  `${routeId}:${componentName}`;

const attachHandle = (routeId: string, id: string): ComponentHandle => ({
  kind: "component",
  id,
  routeId,
});

const resolveComponent = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(
  routeId: string,
  component:
    | BackDefinition<Chat, Message, Ctx>
    | HelpDefinition<Chat, Message, Ctx>
    | TextDefinition<Chat, Message, Ctx>
    | ButtonDefinition<Chat, Message, Ctx>
    | InputDefinition<Chat, Message, Ctx>
    | InquiryDefinition<Chat, Message, Ctx>,
) => {
  const componentId = createComponentId(routeId, component.id);
  if (component.kind === "inquiry") {
    return {
      ...component,
      id: componentId,
      handle: attachHandle(routeId, componentId),
      steps: component.steps.map((step) => ({
        ...step,
        handle: attachHandle(routeId, `${componentId}:step:${step.id}`),
      })),
    };
  }

  return {
    ...component,
    id: componentId,
    handle: attachHandle(routeId, componentId),
  };
};

export const resolveLayoutSource = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  routeId: string;
  layout:
    | LayoutDefinition<Chat, Message, Ctx>
    | ResolvedLayoutDefinition<Chat, Message, Ctx>
    | (() => LayoutDefinition<Chat, Message, Ctx>)
    | undefined;
}): ResolvedLayoutDefinition<Chat, Message, Ctx> | undefined => {
  if (!input.layout) {
    return undefined;
  }

  const resolved =
    typeof input.layout === "function" ? input.layout() : input.layout;

  return {
    ...resolved,
    components: resolved.components.map((component) =>
      resolveComponent(input.routeId, component),
    ),
    id: `${input.routeId}:layout`,
    routeId: input.routeId,
  };
};

export const resolvePageSource = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  routeId: string;
  suffix?: string;
  page:
    | PageDefinition<Chat, Message, Ctx>
    | ResolvedPageDefinition<Chat, Message, Ctx>
    | (() => PageDefinition<Chat, Message, Ctx>)
    | undefined;
}): ResolvedPageDefinition<Chat, Message, Ctx> | undefined => {
  if (!input.page) {
    return undefined;
  }

  const resolved = typeof input.page === "function" ? input.page() : input.page;
  const id = input.suffix
    ? `${input.routeId}:page:${input.suffix}`
    : `${input.routeId}:page`;

  return {
    ...resolved,
    components: resolved.components.map((component) =>
      resolveComponent(input.routeId, component),
    ),
    id,
    name: "page",
    routeId: input.routeId,
    handle: {
      kind: "page",
      id,
      routeId: input.routeId,
    },
  };
};

const normalizeRouteTree = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(
  route: DefinedRoute<Chat, Message, Ctx>,
  parentId: string | null,
): DefinedRoute<Chat, Message, Ctx> => {
  route.parentId = parentId;
  route.id = createRouteId(route.name, parentId);
  route.children = route.children.map((child) =>
    normalizeRouteTree(child, route.id),
  );
  return route;
};

export const resolveRoutePages = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(
  route: DefinedRoute<Chat, Message, Ctx>,
) => {
  route.layout = resolveLayoutSource({
    routeId: route.id,
    layout: route.layout,
  });
  route.page = resolvePageSource({ routeId: route.id, page: route.page });
  route.notFound = resolvePageSource({
    routeId: route.id,
    suffix: "__notFound__",
    page: route.notFound,
  });

  for (const child of route.children) {
    resolveRoutePages(child);
  }

  return route;
};

export const getRoutePage = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
}) =>
  input.route.page as ResolvedPageDefinition<Chat, Message, Ctx> | undefined;

export const getRouteLayouts = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
}) =>
  input.routeStack
    .map((route) => route.layout)
    .filter(Boolean) as ResolvedLayoutDefinition<Chat, Message, Ctx>[];

export const collectRoutes = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(
  root: DefinedRoute<Chat, Message, Ctx>,
) => {
  const routes = new Map<string, DefinedRoute<Chat, Message, Ctx>>();

  const visit = (route: DefinedRoute<Chat, Message, Ctx>) => {
    if (routes.has(route.id)) {
      throw new Error(`Duplicate route '${route.id}'`);
    }

    routes.set(route.id, route);
    for (const child of route.children) {
      visit(child);
    }
  };

  visit(root);
  return routes;
};

export const getRouteStack = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
}) => {
  const stack: DefinedRoute<Chat, Message, Ctx>[] = [];
  let current: DefinedRoute<Chat, Message, Ctx> | undefined = input.route;
  while (current) {
    stack.unshift(current);
    current = current.parentId
      ? input.routesById.get(current.parentId)
      : undefined;
  }
  return stack;
};

type ComposedRoutes<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = {
  root: RootDefinedRoute<Chat, Message, Ctx>;
};

export const composeRoutes = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(
  input: RootDefinedRoute<Chat, Message, Ctx>,
): ComposedRoutes<Chat, Message, Ctx> => {
  if (input.__rootRoute !== true) {
    throw new Error("createWorker requires hobonos.rootRoute(...)");
  }

  const root = normalizeRouteTree(input, null) as RootDefinedRoute<
    Chat,
    Message,
    Ctx
  >;

  if (root.name !== "" || root.parentId !== null) {
    throw new Error("createWorker requires hobonos.rootRoute(...)");
  }

  return { root };
};
