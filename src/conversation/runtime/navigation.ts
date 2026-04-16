import type { IChat } from "../contracts/chat";
import type { DefinedRoute, NavigationReason } from "../model";
import { createRouteGuardContext, createRouteProxyContext } from "./contexts";
import { createController, isRuntimeControlSignal } from "./controller";
import {
  applyControllerEffects,
  runLayoutRenderChain,
  runPageRender,
  runPageText,
  toVisibleComponents,
} from "./handlers";
import { getRouteLayouts, getRoutePage, getRouteStack } from "./routes";
import { recordHistory, setFocusedComponentId } from "./state";

const hasControllerEffects = (
  controller: ReturnType<typeof createController>,
) =>
  Boolean(
    controller.focusTarget() ||
      controller.routeId() ||
      controller.shouldUnfocus(),
  );

export const canEnterRoute = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  sourceRoute?: DefinedRoute<Chat, Message, Ctx>;
}) => {
  const routeStack = getRouteStack({
    route: input.route,
    routesById: input.routesById,
  });
  const targetPage = getRoutePage({ route: input.route });

  for (const guardRoute of routeStack) {
    for (const guard of guardRoute.guards) {
      const allowed = await guard(
        createRouteGuardContext({
          chat: input.chat,
          message: input.message,
          ctx: input.ctx,
          guardRoute,
          targetRoute: input.route,
          targetPage,
          sourceRoute: input.sourceRoute,
          routeStack,
        }),
      );

      if (typeof allowed !== "boolean") {
        throw new Error(
          `Route guard for '${guardRoute.id}' must return true or false`,
        );
      }

      if (!allowed) {
        return false;
      }
    }
  }

  return true;
};

export const renderRoute = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  navigationReason?: NavigationReason;
  sourceRoute?: DefinedRoute<Chat, Message, Ctx>;
  componentId?: string;
}) => {
  const targetPage = getRoutePage({ route: input.route });
  const controller = createController();
  const routeStack = getRouteStack({
    route: input.route,
    routesById: input.routesById,
  });
  const layouts = getRouteLayouts({ routeStack });
  try {
    await runLayoutRenderChain({
      layouts,
      page: targetPage,
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      route: input.route,
      routeStack,
      navigate: controller.navigate,
      focus: controller.focus,
      unfocus: controller.unfocus,
    });
    await runPageRender({
      route: input.route,
      page: targetPage,
      components: toVisibleComponents({ layouts, page: targetPage }),
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      routeStack,
      navigate: controller.navigate,
      focus: controller.focus,
      unfocus: controller.unfocus,
    });
    await runPageText({
      route: input.route,
      page: targetPage,
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      routeStack,
      navigate: controller.navigate,
      focus: controller.focus,
      unfocus: controller.unfocus,
    });
  } catch (error) {
    if (!isRuntimeControlSignal(error)) {
      throw error;
    }
  }

  await applyControllerEffects({
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    route: input.route,
    currentPage: targetPage,
    routeStack,
    routesById: input.routesById,
    controller,
    componentId: input.componentId,
    navigationReason: input.navigationReason ?? "render",
    sourceRoute: input.sourceRoute ?? input.route,
  });
};

export const resolveRouteProxy = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  sourceRoute?: DefinedRoute<Chat, Message, Ctx>;
}) => {
  const routeStack = getRouteStack({
    route: input.route,
    routesById: input.routesById,
  });
  const targetPage = getRoutePage({ route: input.route });
  const proxyRoute = [...routeStack].reverse().find((route) => route.proxy);
  const controller = createController();

  if (!proxyRoute?.proxy) {
    return { controller, routeStack, targetPage, handled: false };
  }

  try {
    await proxyRoute.proxy(
      createRouteProxyContext({
        chat: input.chat,
        message: input.message,
        ctx: input.ctx,
        proxyRoute,
        targetRoute: input.route,
        targetPage,
        sourceRoute: input.sourceRoute,
        routeStack,
        navigate: controller.navigate,
        focus: controller.focus,
        unfocus: controller.unfocus,
      }),
    );
  } catch (error) {
    if (!isRuntimeControlSignal(error)) {
      throw error;
    }
  }

  return {
    controller,
    routeStack,
    targetPage,
    handled: hasControllerEffects(controller),
  };
};

export const commitNavigation = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  targetRouteId: string | null;
  reason: NavigationReason;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  sourceRoute: DefinedRoute<Chat, Message, Ctx>;
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  componentId?: string;
  defaultFocusDuration?: number;
}) => {
  const targetRoute = input.targetRouteId
    ? input.routesById.get(input.targetRouteId)
    : null;
  if (!input.targetRouteId || !targetRoute) {
    return;
  }

  const allowed = await canEnterRoute({
    route: targetRoute,
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    routesById: input.routesById,
    sourceRoute: input.sourceRoute,
  });

  if (!allowed) {
    return;
  }

  if (input.targetRouteId === input.chat.currentRouteId) {
    setFocusedComponentId(input.chat, null);
    return;
  }

  const proxyResult = await resolveRouteProxy({
    route: targetRoute,
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    routesById: input.routesById,
    sourceRoute: input.sourceRoute,
  });

  if (proxyResult.handled) {
    input.chat.currentRouteId = targetRoute.id;
    setFocusedComponentId(input.chat, null);
    recordHistory({
      chat: input.chat,
      routeId: targetRoute.id,
      reason: input.reason,
      sourceRouteId: input.sourceRoute.id,
      componentId: input.componentId,
    });

    await applyControllerEffects({
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      route: targetRoute,
      currentPage: proxyResult.targetPage,
      routeStack: proxyResult.routeStack,
      routesById: input.routesById,
      controller: proxyResult.controller,
      componentId: input.componentId,
      navigationReason: input.reason,
      sourceRoute: targetRoute,
      defaultFocusDuration: input.defaultFocusDuration,
    });
    return;
  }

  input.chat.currentRouteId = targetRoute.id;
  setFocusedComponentId(input.chat, null);
  recordHistory({
    chat: input.chat,
    routeId: targetRoute.id,
    reason: input.reason,
    sourceRouteId: input.sourceRoute.id,
    componentId: input.componentId,
  });

  await renderRoute({
    route: targetRoute,
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    routesById: input.routesById,
    navigationReason: input.reason,
    sourceRoute: targetRoute,
    componentId: input.componentId,
  });
};
