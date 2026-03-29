import type { IChat } from "../contracts/chat";
import type {
  AppBackRenderContext,
  AppButtonContext,
  AppInputInteractContext,
  AppInputRenderContext,
  AppRuntimeBaseContext,
  AppTextRenderContext,
  BackDefinition,
  Breadcrumb,
  ButtonDefinition,
  ComponentHandle,
  DefinedRoute,
  InputDefinition,
  InquiryAnswers,
  InquiryDefinition,
  InquiryStep,
  InquiryStepRenderContext,
  InquirySubmitContext,
  PageBack,
  ResolvedPageDefinition,
  RouteHandle,
  TextDefinition,
} from "../model";

const createBreadcrumbs = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  chat: Chat;
  currentRoute: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
}): Breadcrumb[] => {
  const historyRouteIds = (input.chat.history ?? []).map(
    (entry) => entry.routeId,
  );
  const routeIds = [...historyRouteIds, input.currentRoute.id].filter(
    (routeId, index, all) => all.indexOf(routeId) === index,
  );
  const breadcrumbs = routeIds.map<Breadcrumb>((routeId) => ({
    id: routeId,
    label: routeId.split("/").filter(Boolean).pop() ?? routeId,
    route: { kind: "route", id: routeId },
  }));

  if (input.currentPage) {
    breadcrumbs[breadcrumbs.length - 1] = {
      id: input.currentRoute.id,
      label: input.currentRoute.name,
      route: { kind: "route", id: input.currentPage.routeId },
      page: input.currentPage.handle,
    };
  }

  return breadcrumbs;
};

const createPageBack = <Chat extends IChat>(input: {
  chat: Chat;
}): PageBack | undefined => {
  const history = input.chat.history ?? [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry.routeId === input.chat.currentRouteId) {
      continue;
    }

    return { label: "Back", route: { kind: "route", id: entry.routeId } };
  }

  return undefined;
};

export const createBaseContext = <
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
  navigate: (route: RouteHandle) => void;
  focus: (component: ComponentHandle) => void;
  unfocus: () => void;
}): AppRuntimeBaseContext<Chat, Message, Ctx> => ({
  chat: input.chat,
  message: input.message,
  ctx: input.ctx,
  storage: input.chat.storage,
  currentRoute: input.currentRoute,
  currentPage: input.currentPage,
  page: input.currentPage
    ? {
        current: input.currentPage,
        back: createPageBack({ chat: input.chat }),
        breadcrumbs: createBreadcrumbs({
          chat: input.chat,
          currentRoute: input.currentRoute,
          currentPage: input.currentPage,
        }),
      }
    : undefined,
  routeStack: input.routeStack,
  navigate: input.navigate,
  focus: input.focus,
  unfocus: input.unfocus,
});

export const createTextRenderContext = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  component: TextDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  currentRoute: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  navigate: (route: RouteHandle) => void;
  focus: (component: ComponentHandle) => void;
  unfocus: () => void;
}): AppTextRenderContext<Chat, Message, Ctx> => ({
  ...createBaseContext(input),
  component: input.component,
});

export const createButtonContext = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  button: ButtonDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  currentRoute: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  navigate: (route: RouteHandle) => void;
  focus: (component: ComponentHandle) => void;
  unfocus: () => void;
}): AppButtonContext<Chat, Message, Ctx> => ({
  ...createBaseContext(input),
  button: input.button,
});

export const createInputRenderContext = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  component: InputDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  currentRoute: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  navigate: (route: RouteHandle) => void;
  focus: (component: ComponentHandle) => void;
  unfocus: () => void;
}): AppInputRenderContext<Chat, Message, Ctx> => ({
  ...createBaseContext(input),
  component: input.component,
});

export const createInputInteractContext = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  component: InputDefinition<Chat, Message, Ctx>;
  input?: string;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  currentRoute: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  navigate: (route: RouteHandle) => void;
  focus: (component: ComponentHandle) => void;
  unfocus: () => void;
}): AppInputInteractContext<Chat, Message, Ctx> => ({
  ...createInputRenderContext(input),
  input: input.input,
});

export const createInquiryStepRenderContext = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  inquiry: InquiryDefinition<Chat, Message, Ctx>;
  step: InquiryStep<Chat, Message, Ctx>;
  answers: InquiryAnswers;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  currentRoute: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  navigate: (route: RouteHandle) => void;
  focus: (component: ComponentHandle) => void;
  unfocus: () => void;
}): InquiryStepRenderContext<Chat, Message, Ctx> => ({
  ...createBaseContext(input),
  inquiry: input.inquiry,
  step: input.step,
  answers: input.answers,
});

export const createInquirySubmitContext = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  inquiry: InquiryDefinition<Chat, Message, Ctx>;
  answers: InquiryAnswers;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  currentRoute: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  navigate: (route: RouteHandle) => void;
  focus: (component: ComponentHandle) => void;
  unfocus: () => void;
}): InquirySubmitContext<Chat, Message, Ctx> => ({
  ...createBaseContext(input),
  inquiry: input.inquiry,
  answers: input.answers,
});

export const createBackRenderContext = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  component: BackDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  currentRoute: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  navigate: (route: RouteHandle) => void;
  focus: (component: ComponentHandle) => void;
  unfocus: () => void;
}): AppBackRenderContext<Chat, Message, Ctx> => {
  const base = createBaseContext(input);
  const breadcrumbs = (base.page?.breadcrumbs ?? []).slice(0, -1);
  const defaultCrumb = breadcrumbs[breadcrumbs.length - 1];

  return {
    ...base,
    component: input.component,
    back: input.component,
    breadcrumbs,
    goBack(crumb) {
      const target = crumb ?? defaultCrumb;
      if (target) {
        input.navigate(target.route);
      }
    },
  };
};
