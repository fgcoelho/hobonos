import type { IChat } from "../contracts/chat";
import type {
  BackDefinition,
  DefinedRoute,
  InputDefinition,
  InquiryDefinition,
  NavigationReason,
  ResolvedPageDefinition,
} from "../model";
import { renderComponent, toVisibleComponents } from "./handlers";
import { getRouteLayouts } from "./routes";
import { recordHistory, setFocusedComponentId, setInquiryState } from "./state";

export const clearFocusState = <Chat extends IChat>(chat: Chat) => {
  setFocusedComponentId(chat, null);
};

const getFocusUntil = (focusDuration?: number | null) => {
  if (typeof focusDuration !== "number" || focusDuration <= 0) {
    return null;
  }

  return Date.now() + focusDuration;
};

export const clearExpiredFocus = <Chat extends IChat>(
  chat: Chat,
  now = Date.now(),
) => {
  if (typeof chat.focusUntil !== "number") {
    return false;
  }

  if (now <= chat.focusUntil) {
    return false;
  }

  clearFocusState(chat);
  return true;
};

type FocusableComponent<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> =
  | InputDefinition<Chat, Message, Ctx>
  | InquiryDefinition<Chat, Message, Ctx>
  | BackDefinition<Chat, Message, Ctx>;

const getComponentFocusDuration = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(
  component: FocusableComponent<Chat, Message, Ctx>,
  defaultFocusDuration?: number,
) =>
  typeof component.focusDuration === "number"
    ? component.focusDuration
    : defaultFocusDuration;

export const resolveFocusedComponent = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  chat: Chat;
  currentRoute: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  routeStack?: DefinedRoute<Chat, Message, Ctx>[];
}) => {
  const focusedComponentId = input.chat.focusedComponentId;
  if (!focusedComponentId) {
    return null;
  }

  const layouts = input.routeStack
    ? getRouteLayouts({ routeStack: input.routeStack })
    : [];
  const component = toVisibleComponents({
    layouts,
    page: input.currentPage,
  }).find((entry) => entry.id === focusedComponentId);
  return component ? { focusedComponentId, component } : null;
};

export const focusComponent = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  chat: Chat;
  message: Message;
  ctx: Ctx;
  currentRoute: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  componentId: string;
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  reason: NavigationReason;
  defaultFocusDuration?: number;
}) => {
  const layouts = getRouteLayouts({ routeStack: input.routeStack });
  const component = toVisibleComponents({
    layouts,
    page: input.currentPage,
  }).find((entry) => entry.id === input.componentId);
  if (!component) {
    throw new Error(
      `Component '${input.componentId}' not found in route '${input.currentRoute.id}'`,
    );
  }

  setFocusedComponentId(input.chat, component.id);
  input.chat.focusUntil = getFocusUntil(
    getComponentFocusDuration(
      component as FocusableComponent<Chat, Message, Ctx>,
      input.defaultFocusDuration,
    ),
  );
  recordHistory({
    chat: input.chat,
    routeId: input.currentRoute.id,
    reason: input.reason,
    sourceRouteId: input.currentRoute.id,
    componentId: component.id,
  });

  if (component.kind === "inquiry") {
    const inquiry = component as InquiryDefinition<Chat, Message, Ctx>;
    setInquiryState(input.chat, inquiry.id, {
      routeId: input.currentRoute.id,
      inquiryId: inquiry.id,
      stepIndex: 0,
      answers: {},
    });
  }

  if (
    component.kind === "input" ||
    component.kind === "inquiry" ||
    component.kind === "back"
  ) {
    await renderComponent({
      route: input.currentRoute,
      currentPage: input.currentPage,
      component: component as any,
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      routeStack: input.routeStack,
      routesById: input.routesById,
      defaultFocusDuration: input.defaultFocusDuration,
    });
  }
};
