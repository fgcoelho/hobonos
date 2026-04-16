import type { IChat } from "../contracts/chat";
import type {
  AppNotFoundContext,
  BackDefinition,
  ButtonDefinition,
  ComponentHandle,
  DefinedRoute,
  HelpDefinition,
  InputDefinition,
  InquiryDefinition,
  InquiryStep,
  NavigationReason,
  PageComponent,
  ResolvedLayoutDefinition,
  ResolvedPageDefinition,
  RouteHandle,
  TextDefinition,
} from "../model";
import {
  createBackRenderContext,
  createBaseContext,
  createButtonContext,
  createInputInteractContext,
  createInputRenderContext,
  createInquiryStepRenderContext,
  createInquirySubmitContext,
  createTextRenderContext,
} from "./contexts";
import { createController, isRuntimeControlSignal } from "./controller";
import { clearFocusState, focusComponent } from "./focus";
import { commitNavigation } from "./navigation";
import { getRouteLayouts } from "./routes";
import { getInquiryState, recordHistory, setInquiryState } from "./state";

const getInquiryStep = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(
  inquiry: InquiryDefinition<Chat, Message, Ctx>,
  stepIndex: number,
) => inquiry.steps[stepIndex] as InquiryStep<Chat, Message, Ctx> | undefined;

const renderInquiryStep = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  inquiry: InquiryDefinition<Chat, Message, Ctx>;
  step: InquiryStep<Chat, Message, Ctx>;
  answers: Record<string, unknown>;
  route: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  navigate: (route: RouteHandle) => void;
  focus: (component: ComponentHandle) => void;
  unfocus: () => void;
}) => {
  if (!input.step.render) {
    return;
  }

  await input.step.render(
    createInquiryStepRenderContext({
      inquiry: input.inquiry,
      step: input.step,
      answers: input.answers,
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      currentRoute: input.route,
      currentPage: input.currentPage,
      routeStack: input.routeStack,
      navigate: input.navigate,
      focus: input.focus,
      unfocus: input.unfocus,
    }),
  );
};

export const applyControllerEffects = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  chat: Chat;
  message: Message;
  ctx: Ctx;
  route: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  controller: ReturnType<typeof createController>;
  componentId?: string;
  recordInteraction?: boolean;
  clearFocus?: boolean;
  navigationReason: NavigationReason;
  sourceRoute?: DefinedRoute<Chat, Message, Ctx>;
  defaultFocusDuration?: number;
}) => {
  const focusTarget = input.controller.focusTarget();
  if (focusTarget) {
    input.controller.clear();
    await focusComponent({
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      currentRoute: input.route,
      currentPage: input.currentPage,
      routeStack: input.routeStack,
      componentId: focusTarget.id,
      routesById: input.routesById,
      reason: "focus",
      defaultFocusDuration: input.defaultFocusDuration,
    });
    return true;
  }

  if (input.controller.shouldUnfocus() || (input.clearFocus ?? false)) {
    clearFocusState(input.chat);
  }

  if (input.recordInteraction && input.componentId) {
    recordHistory({
      chat: input.chat,
      routeId: input.route.id,
      reason: "interact",
      sourceRouteId: input.route.id,
      componentId: input.componentId,
    });
  }

  await commitNavigation({
    targetRouteId: input.controller.routeId(),
    reason: input.navigationReason,
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    sourceRoute: input.sourceRoute ?? input.route,
    routesById: input.routesById,
    componentId: input.componentId,
    defaultFocusDuration: input.defaultFocusDuration,
  });
  return true;
};

const renderHelp = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  component: HelpDefinition<Chat, Message, Ctx>;
  components: PageComponent[];
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  controller?: ReturnType<typeof createController>;
}) => {
  const controller = input.controller ?? createController();
  await input.component.render({
    ...createBaseContext({
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      currentRoute: input.route,
      currentPage: input.currentPage,
      routeStack: input.routeStack,
      navigate: controller.navigate,
      focus: controller.focus,
      unfocus: controller.unfocus,
    }),
    components: input.components,
  });

  return controller;
};

export const runPageRender = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  page?: ResolvedPageDefinition<Chat, Message, Ctx>;
  components?: PageComponent[];
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  navigate: (route: RouteHandle) => void;
  focus: (component: ComponentHandle) => void;
  unfocus: () => void;
}) => {
  if (!input.page?.render) {
    return;
  }

  await input.page.render({
    ...createBaseContext({
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      currentRoute: input.route,
      currentPage: input.page,
      routeStack: input.routeStack,
      navigate: input.navigate,
      focus: input.focus,
      unfocus: input.unfocus,
    }),
    components: input.components,
  });
};

const renderText = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  component: TextDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  navigate: (route: RouteHandle) => void;
  focus: (component: ComponentHandle) => void;
  unfocus: () => void;
}) => {
  if (!input.component.render) {
    return;
  }

  await input.component.render(
    createTextRenderContext({
      component: input.component,
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      currentRoute: input.route,
      currentPage: input.currentPage,
      routeStack: input.routeStack,
      navigate: input.navigate,
      focus: input.focus,
      unfocus: input.unfocus,
    }),
  );
};

export const toPageComponents = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(
  page?: ResolvedPageDefinition<Chat, Message, Ctx>,
): PageComponent[] => [...(page?.components ?? [])];

export const toLayoutComponents = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(
  layouts: ResolvedLayoutDefinition<Chat, Message, Ctx>[],
) => layouts.flatMap((layout) => layout.components);

export const toVisibleComponents = <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  layouts?: ResolvedLayoutDefinition<Chat, Message, Ctx>[];
  page?: ResolvedPageDefinition<Chat, Message, Ctx>;
}) => [
  ...toLayoutComponents(input.layouts ?? []),
  ...toPageComponents(input.page),
];

export const runLayoutRenderChain = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  layouts: ResolvedLayoutDefinition<Chat, Message, Ctx>[];
  page?: ResolvedPageDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  route: DefinedRoute<Chat, Message, Ctx>;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  navigate: (route: RouteHandle) => void;
  focus: (component: ComponentHandle) => void;
  unfocus: () => void;
}) => {
  const visibleComponents = toVisibleComponents({
    layouts: input.layouts,
    page: input.page,
  });

  for (const layout of input.layouts) {
    if (layout.render) {
      await layout.render({
        ...createBaseContext({
          chat: input.chat,
          message: input.message,
          ctx: input.ctx,
          currentRoute: input.route,
          currentPage: input.page,
          routeStack: input.routeStack,
          navigate: input.navigate,
          focus: input.focus,
          unfocus: input.unfocus,
        }),
        components: visibleComponents,
      });
    }

    for (const component of layout.components) {
      if (component.kind !== "text") {
        continue;
      }

      await renderText({
        route: input.route,
        currentPage: input.page,
        component,
        chat: input.chat,
        message: input.message,
        ctx: input.ctx,
        routeStack: input.routeStack,
        navigate: input.navigate,
        focus: input.focus,
        unfocus: input.unfocus,
      });
    }
  }
};

export const runPageText = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  page?: ResolvedPageDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  navigate: (route: RouteHandle) => void;
  focus: (component: ComponentHandle) => void;
  unfocus: () => void;
}) => {
  for (const component of input.page?.components ?? []) {
    if (component.kind !== "text") {
      continue;
    }

    await renderText({
      route: input.route,
      currentPage: input.page,
      component,
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      routeStack: input.routeStack,
      navigate: input.navigate,
      focus: input.focus,
      unfocus: input.unfocus,
    });
  }
};

export const runHelp = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  layouts: ResolvedLayoutDefinition<Chat, Message, Ctx>[];
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  components: PageComponent[];
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  defaultFocusDuration?: number;
}) => {
  const pageHelp = (input.currentPage?.components ?? []).find(
    (component) => component.kind === "help",
  ) as HelpDefinition<Chat, Message, Ctx> | undefined;
  const layoutHelp = [...input.layouts]
    .reverse()
    .flatMap((layout) => layout.components)
    .find((component) => component.kind === "help") as
    | HelpDefinition<Chat, Message, Ctx>
    | undefined;
  const help = pageHelp ?? layoutHelp;
  if (!help) {
    return false;
  }

  const controller = createController();
  try {
    await renderHelp({
      route: input.route,
      currentPage: input.currentPage,
      component: help,
      components: input.components,
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      routeStack: input.routeStack,
      controller,
    });
  } catch (error) {
    if (!isRuntimeControlSignal(error)) {
      throw error;
    }
  }

  return applyControllerEffects({
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    route: input.route,
    currentPage: input.currentPage,
    routeStack: input.routeStack,
    routesById: input.routesById,
    controller,
    navigationReason: "navigate",
    defaultFocusDuration: input.defaultFocusDuration,
  });
};

export const runResolvedHelp = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  component: HelpDefinition<Chat, Message, Ctx>;
  components: PageComponent[];
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  defaultFocusDuration?: number;
}) => {
  const controller = createController();
  try {
    await renderHelp({ ...input, controller });
  } catch (error) {
    if (!isRuntimeControlSignal(error)) {
      throw error;
    }
  }

  return applyControllerEffects({
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    route: input.route,
    currentPage: input.currentPage,
    routeStack: input.routeStack,
    routesById: input.routesById,
    controller,
    componentId: input.component.id,
    recordInteraction: true,
    navigationReason: "navigate",
    defaultFocusDuration: input.defaultFocusDuration,
  });
};

const finalizeInteraction = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  chat: Chat;
  message: Message;
  ctx: Ctx;
  route: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  controller: ReturnType<typeof createController>;
  componentId: string;
  clearFocus?: boolean;
  defaultFocusDuration?: number;
}) => {
  return applyControllerEffects({
    ...input,
    recordInteraction: true,
    clearFocus: input.clearFocus ?? true,
    navigationReason: "navigate",
  });
};

export const renderComponent = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  component:
    | HelpDefinition<Chat, Message, Ctx>
    | TextDefinition<Chat, Message, Ctx>
    | InputDefinition<Chat, Message, Ctx>
    | InquiryDefinition<Chat, Message, Ctx>
    | BackDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  defaultFocusDuration?: number;
}) => {
  const controller = createController();

  try {
    if (input.component.kind === "text") {
      await renderText({ ...input, component: input.component, ...controller });
      return;
    }

    if (input.component.kind === "help") {
      const layouts = getRouteLayouts({ routeStack: input.routeStack });
      await renderHelp({
        route: input.route,
        currentPage: input.currentPage,
        component: input.component,
        components: toVisibleComponents({ layouts, page: input.currentPage }),
        chat: input.chat,
        message: input.message,
        ctx: input.ctx,
        routeStack: input.routeStack,
        controller,
      });
      return;
    }

    if (input.component.kind === "input" && input.component.render) {
      await input.component.render(
        createInputRenderContext({
          component: input.component,
          chat: input.chat,
          message: input.message,
          ctx: input.ctx,
          currentRoute: input.route,
          currentPage: input.currentPage,
          routeStack: input.routeStack,
          navigate: controller.navigate,
          focus: controller.focus,
          unfocus: controller.unfocus,
        }),
      );
      return;
    }

    if (input.component.kind === "inquiry") {
      const inquiryState = getInquiryState(input.chat, input.component.id);
      const step = getInquiryStep(
        input.component,
        inquiryState?.stepIndex ?? 0,
      );
      if (!step) {
        return;
      }

      await renderInquiryStep({
        inquiry: input.component,
        step,
        answers: inquiryState?.answers ?? {},
        route: input.route,
        currentPage: input.currentPage,
        chat: input.chat,
        message: input.message,
        ctx: input.ctx,
        routeStack: input.routeStack,
        navigate: controller.navigate,
        focus: controller.focus,
        unfocus: controller.unfocus,
      });
      return;
    }

    if (input.component.kind === "back" && input.component.render) {
      await input.component.render(
        createBackRenderContext({
          component: input.component,
          chat: input.chat,
          message: input.message,
          ctx: input.ctx,
          currentRoute: input.route,
          currentPage: input.currentPage,
          routeStack: input.routeStack,
          navigate: controller.navigate,
          focus: controller.focus,
          unfocus: controller.unfocus,
        }),
      );
    }
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
    currentPage: input.currentPage,
    routeStack: input.routeStack,
    routesById: input.routesById,
    controller,
    navigationReason: "navigate",
    defaultFocusDuration: input.defaultFocusDuration,
  });
};

export const runText = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  text: TextDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  defaultFocusDuration?: number;
}) => {
  const controller = createController();
  try {
    await renderText({
      ...input,
      component: input.text,
      navigate: controller.navigate,
      focus: controller.focus,
      unfocus: controller.unfocus,
    });
  } catch (error) {
    if (!isRuntimeControlSignal(error)) {
      throw error;
    }
  }
  return finalizeInteraction({
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    route: input.route,
    currentPage: input.currentPage,
    routeStack: input.routeStack,
    routesById: input.routesById,
    controller,
    componentId: input.text.id,
    defaultFocusDuration: input.defaultFocusDuration,
  });
};

export const runButton = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  button: ButtonDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  defaultFocusDuration?: number;
}) => {
  const controller = createController();
  try {
    if (input.button.onInteract) {
      await input.button.onInteract(
        createButtonContext({
          button: input.button,
          chat: input.chat,
          message: input.message,
          ctx: input.ctx,
          currentRoute: input.route,
          currentPage: input.currentPage,
          routeStack: input.routeStack,
          navigate: controller.navigate,
          focus: controller.focus,
          unfocus: controller.unfocus,
        }),
      );
    }
  } catch (error) {
    if (!isRuntimeControlSignal(error)) {
      throw error;
    }
  }

  return finalizeInteraction({
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    route: input.route,
    currentPage: input.currentPage,
    routeStack: input.routeStack,
    routesById: input.routesById,
    controller,
    componentId: input.button.id,
    defaultFocusDuration: input.defaultFocusDuration,
  });
};

export const runBack = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  back: BackDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  defaultFocusDuration?: number;
}) => {
  if (input.back.render) {
    await focusComponent({
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      currentRoute: input.route,
      currentPage: input.currentPage,
      routeStack: input.routeStack,
      componentId: input.back.id,
      routesById: input.routesById,
      reason: "focus",
      defaultFocusDuration: input.defaultFocusDuration,
    });
    return true;
  }

  const controller = createController();
  const context = createBackRenderContext({
    component: input.back,
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    currentRoute: input.route,
    currentPage: input.currentPage,
    routeStack: input.routeStack,
    navigate: controller.navigate,
    focus: controller.focus,
    unfocus: controller.unfocus,
  });

  try {
    if (input.back.onInteract) {
      await input.back.onInteract(context);
    } else {
      context.goBack();
    }
  } catch (error) {
    if (!isRuntimeControlSignal(error)) {
      throw error;
    }
  }

  return finalizeInteraction({
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    route: input.route,
    currentPage: input.currentPage,
    routeStack: input.routeStack,
    routesById: input.routesById,
    controller,
    componentId: input.back.id,
    defaultFocusDuration: input.defaultFocusDuration,
  });
};

export const runNotFound = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  currentRoute: DefinedRoute<Chat, Message, Ctx>;
  components: PageComponent[];
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  defaultFocusDuration?: number;
}) => {
  for (let index = input.routeStack.length - 1; index >= 0; index -= 1) {
    const route = input.routeStack[index];
    const notFoundPage = route.notFound as
      | ResolvedPageDefinition<Chat, Message, Ctx>
      | undefined;
    if (!notFoundPage) {
      continue;
    }

    const controller = createController();
    try {
      if (notFoundPage.render) {
        const context: AppNotFoundContext<Chat, Message, Ctx> = {
          ...createBaseContext({
            chat: input.chat,
            message: input.message,
            ctx: input.ctx,
            currentRoute: input.currentRoute,
            currentPage: notFoundPage,
            routeStack: input.routeStack,
            navigate: controller.navigate,
            focus: controller.focus,
            unfocus: controller.unfocus,
          }),
          components: input.components,
        };
        await notFoundPage.render(context);
      }
    } catch (error) {
      if (!isRuntimeControlSignal(error)) {
        throw error;
      }
    }

    await applyControllerEffects({
      chat: input.chat,
      message: input.message,
      ctx: input.ctx,
      route: input.currentRoute,
      currentPage: notFoundPage,
      routeStack: input.routeStack,
      routesById: input.routesById,
      controller,
      navigationReason: "notFound",
      sourceRoute: input.currentRoute,
      defaultFocusDuration: input.defaultFocusDuration,
    });
    return true;
  }

  return false;
};

export const runFocusedInput = async <
  Chat extends IChat,
  Message extends { text?: string },
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  component: InputDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  defaultFocusDuration?: number;
}) => {
  const controller = createController();
  const rawInput =
    typeof input.message.text === "string" ? input.message.text : "";

  try {
    if (input.component.onInteract) {
      await input.component.onInteract(
        createInputInteractContext({
          component: input.component,
          input: rawInput,
          chat: input.chat,
          message: input.message,
          ctx: input.ctx,
          currentRoute: input.route,
          currentPage: input.currentPage,
          routeStack: input.routeStack,
          navigate: controller.navigate,
          focus: controller.focus,
          unfocus: controller.unfocus,
        }),
      );
    }
  } catch (error) {
    if (!isRuntimeControlSignal(error)) {
      throw error;
    }
  }

  return finalizeInteraction({
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    route: input.route,
    currentPage: input.currentPage,
    routeStack: input.routeStack,
    routesById: input.routesById,
    controller,
    componentId: input.component.id,
    defaultFocusDuration: input.defaultFocusDuration,
  });
};

export const runInput = async <
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  component: InputDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  value: string;
  defaultFocusDuration?: number;
}) => {
  const controller = createController();

  try {
    if (input.component.onInteract) {
      await input.component.onInteract(
        createInputInteractContext({
          component: input.component,
          input: input.value,
          chat: input.chat,
          message: input.message,
          ctx: input.ctx,
          currentRoute: input.route,
          currentPage: input.currentPage,
          routeStack: input.routeStack,
          navigate: controller.navigate,
          focus: controller.focus,
          unfocus: controller.unfocus,
        }),
      );
    }
  } catch (error) {
    if (!isRuntimeControlSignal(error)) {
      throw error;
    }
  }

  return finalizeInteraction({
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    route: input.route,
    currentPage: input.currentPage,
    routeStack: input.routeStack,
    routesById: input.routesById,
    controller,
    componentId: input.component.id,
    defaultFocusDuration: input.defaultFocusDuration,
  });
};

export const runFocusedInquiry = async <
  Chat extends IChat,
  Message extends { text?: string },
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  inquiry: InquiryDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  defaultFocusDuration?: number;
}) => {
  const state = getInquiryState(input.chat, input.inquiry.id);
  const stepIndex = state?.stepIndex ?? 0;
  const answers = { ...(state?.answers ?? {}) };
  const step = getInquiryStep(input.inquiry, stepIndex);
  if (!step) {
    return false;
  }

  const rawValue =
    typeof input.message.text === "string" ? input.message.text : "";
  answers[step.id] = rawValue;

  const nextStepIndex = stepIndex + 1;
  const nextStep = getInquiryStep(input.inquiry, nextStepIndex);
  if (nextStep) {
    const controller = createController();
    setInquiryState(input.chat, input.inquiry.id, {
      routeId: input.route.id,
      inquiryId: input.inquiry.id,
      stepIndex: nextStepIndex,
      answers,
    });
    try {
      await renderInquiryStep({
        inquiry: input.inquiry,
        step: nextStep,
        answers,
        route: input.route,
        currentPage: input.currentPage,
        chat: input.chat,
        message: input.message,
        ctx: input.ctx,
        routeStack: input.routeStack,
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
      currentPage: input.currentPage,
      routeStack: input.routeStack,
      routesById: input.routesById,
      controller,
      componentId: input.inquiry.id,
      navigationReason: "navigate",
      defaultFocusDuration: input.defaultFocusDuration,
    });
    return true;
  }

  setInquiryState(input.chat, input.inquiry.id, null);
  const controller = createController();
  try {
    if (input.inquiry.onSubmit) {
      await input.inquiry.onSubmit(
        createInquirySubmitContext({
          inquiry: input.inquiry,
          answers,
          chat: input.chat,
          message: input.message,
          ctx: input.ctx,
          currentRoute: input.route,
          currentPage: input.currentPage,
          routeStack: input.routeStack,
          navigate: controller.navigate,
          focus: controller.focus,
          unfocus: controller.unfocus,
        }),
      );
    }
  } catch (error) {
    if (!isRuntimeControlSignal(error)) {
      throw error;
    }
  }

  return finalizeInteraction({
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    route: input.route,
    currentPage: input.currentPage,
    routeStack: input.routeStack,
    routesById: input.routesById,
    controller,
    componentId: input.inquiry.id,
    defaultFocusDuration: input.defaultFocusDuration,
  });
};

export const runFocusedBack = async <
  Chat extends IChat,
  Message extends { text?: string },
  Ctx extends Record<string, any>,
>(input: {
  route: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  component: BackDefinition<Chat, Message, Ctx>;
  chat: Chat;
  message: Message;
  ctx: Ctx;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  routesById: Map<string, DefinedRoute<Chat, Message, Ctx>>;
  defaultFocusDuration?: number;
}) => {
  const controller = createController();
  const context = createBackRenderContext({
    component: input.component,
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    currentRoute: input.route,
    currentPage: input.currentPage,
    routeStack: input.routeStack,
    navigate: controller.navigate,
    focus: controller.focus,
    unfocus: controller.unfocus,
  });

  try {
    if (input.component.onInteract) {
      await input.component.onInteract(context);
    } else {
      context.goBack();
    }
  } catch (error) {
    if (!isRuntimeControlSignal(error)) {
      throw error;
    }
  }

  return finalizeInteraction({
    chat: input.chat,
    message: input.message,
    ctx: input.ctx,
    route: input.route,
    currentPage: input.currentPage,
    routeStack: input.routeStack,
    routesById: input.routesById,
    controller,
    componentId: input.component.id,
    defaultFocusDuration: input.defaultFocusDuration,
  });
};
