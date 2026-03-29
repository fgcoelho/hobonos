import type { IChat } from "../contracts/chat";
import type { DefinedRoute, NavigationReason } from "../model";
import { createController } from "./controller";
import {
  runLayoutRenderChain,
  runPageRender,
  runPageText,
  toVisibleComponents,
} from "./handlers";
import { getRouteLayouts, getRoutePage, getRouteStack } from "./routes";
import { recordHistory, setFocusedComponentId } from "./state";

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

  const nestedRouteId = controller.routeId();
  if (nestedRouteId && nestedRouteId !== input.route.id) {
    controller.clear();
    await commitNavigation({
      targetRouteId: nestedRouteId,
      reason: input.navigationReason ?? "render",
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      sourceRoute: input.sourceRoute ?? input.route,
      routesById: input.routesById,
      componentId: input.componentId,
    });
  }
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

  if (input.targetRouteId === input.chat.currentRouteId) {
    setFocusedComponentId(input.chat, null);
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
