import { createActor } from "xstate";
import type { IChatHelpers } from "../core/helpers";
import { defineFlow } from "./builder";
import { createFlowMachine, FLOW_FINAL_STATE } from "./machine";
import type {
  DefinedFlow,
  FlowAction,
  FlowActionContext,
  FlowActionRef,
  FlowBehaviorHandle,
  FlowBehaviorRegistry,
  FlowChatApi,
  FlowChatConfig,
  FlowGuard,
  FlowGuardRef,
  FlowSideEffect,
  FlowSideEffectContext,
  FlowSideEffectRef,
  IFlowChat,
  IntentRouteDefinition,
  NavigationState,
  StepDefinition,
  TransitionReason,
} from "./types";

const normalizeFlowState = <Chat extends IFlowChat>(chat: Chat) => {
  chat.current_step ??= null;
  chat.current_branch ??= null;
  chat.flow_status ??= "active";
  chat.flow_data ??= {};
  chat.flow_history ??= [];
  chat.flow_snapshot ??= undefined;
  chat.flow_stack ??= [];
  return chat;
};

const isBehaviorHandle = <Kind extends string>(
  value: unknown,
  kind: Kind,
): value is FlowBehaviorHandle<Kind> => {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "id" in value &&
    (value as FlowBehaviorHandle<Kind>).kind === kind
  );
};

const createBehaviorRegistry = <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(
  config: FlowChatConfig<Chat, any, Message, Helpers>,
): FlowBehaviorRegistry<Chat, Message, Helpers> => ({
  guards: { ...(config.guards ?? {}) },
  actions: { ...(config.actions ?? {}) },
  effects: { ...(config.effects ?? {}) },
  matchers: { ...(config.matchers ?? {}) },
});

const resolveGuard = <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(
  ref: FlowGuardRef<Chat, Message, Helpers> | undefined,
  registry: FlowBehaviorRegistry<Chat, Message, Helpers>,
): FlowGuard<Chat, Message, Helpers> | undefined => {
  if (!ref) {
    return undefined;
  }

  return isBehaviorHandle(ref, "guard") ? registry.guards[ref.id] : ref;
};

const resolveAction = <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(
  ref: FlowActionRef<Chat, Message, Helpers> | undefined,
  registry: FlowBehaviorRegistry<Chat, Message, Helpers>,
): FlowAction<Chat, Message, Helpers> | undefined => {
  if (!ref) {
    return undefined;
  }

  return isBehaviorHandle(ref, "action") ? registry.actions[ref.id] : ref;
};

const resolveEffects = <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(
  refs: FlowSideEffectRef<Chat, Message, Helpers>[] | undefined,
  registry: FlowBehaviorRegistry<Chat, Message, Helpers>,
): FlowSideEffect<Chat, Message, Helpers>[] => {
  if (!refs?.length) {
    return [];
  }

  return refs
    .map((ref) =>
      isBehaviorHandle(ref, "effect") ? registry.effects[ref.id] : ref,
    )
    .filter((effect): effect is FlowSideEffect<Chat, Message, Helpers> =>
      Boolean(effect),
    );
};

const createActionExecutor = <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(input: {
  flowId: string;
  chat: Chat;
  message: Message;
  helpers: Helpers;
  stepId: string;
  branchId: string | null;
}) => {
  let navigation: NavigationState = { type: "none" };

  const context: FlowActionContext<Chat, Message, Helpers> = {
    chat: input.chat,
    message: input.message,
    helpers: input.helpers,
    data: input.chat.flow_data ?? {},
    stepId: input.stepId,
    branchId: input.branchId,
    flowId: input.flowId,
    goto(stepId) {
      navigation = { type: "goto", stepId, reason: "goto" };
    },
    end() {
      navigation = { type: "end", reason: "end" };
    },
    repeat() {
      navigation = { type: "repeat", reason: "otherwise" };
    },
    stay() {
      navigation = { type: "none" };
    },
  };

  return {
    context,
    getSideEffectContext(): FlowSideEffectContext<Chat, Message, Helpers> {
      const { goto: _, end: __, repeat: ___, stay: ____, ...rest } = context;
      return rest;
    },
    getNavigation() {
      return navigation;
    },
    setNavigation(next: NavigationState) {
      navigation = next;
    },
  };
};

const runEffects = async <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(
  effects: FlowSideEffect<Chat, Message, Helpers>[],
  ctx: FlowSideEffectContext<Chat, Message, Helpers>,
) => {
  for (const effect of effects) {
    await effect(ctx);
  }
};

const runGuard = async <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(input: {
  ref: FlowGuardRef<Chat, Message, Helpers> | undefined;
  registry: FlowBehaviorRegistry<Chat, Message, Helpers>;
  chat: Chat;
  message: Message;
  helpers: Helpers;
  flowId: string;
  stepId: string;
  branchId: string | null;
}) => {
  const guard = resolveGuard(input.ref, input.registry);

  if (!guard) {
    return true;
  }

  return guard({
    chat: input.chat,
    message: input.message,
    helpers: input.helpers,
    data: input.chat.flow_data ?? {},
    params: undefined,
    stepId: input.stepId,
    branchId: input.branchId,
    flowId: input.flowId,
  });
};

const canUseGlobalIntents = <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(
  flow: DefinedFlow<Chat, Message, Helpers>,
  stepId: string,
) => {
  const branchId = flow.steps[stepId]?.branchId;
  if (!branchId) {
    return true;
  }
  return flow.branches[branchId]?.allowExternalIntents ?? true;
};

const canExitBranch = async <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(input: {
  flow: DefinedFlow<Chat, Message, Helpers>;
  chat: Chat;
  message: Message;
  helpers: Helpers;
  fromStepId: string;
  toStepId: string;
  reason: TransitionReason;
  routeId?: string;
}) => {
  const fromBranchId = input.flow.steps[input.fromStepId]?.branchId;
  const toBranchId = input.flow.steps[input.toStepId]?.branchId ?? null;

  if (!fromBranchId || fromBranchId === toBranchId) {
    return true;
  }

  const branch = input.flow.branches[fromBranchId];
  if (!branch?.canExit) {
    return true;
  }

  return branch.canExit({
    chat: input.chat,
    message: input.message,
    helpers: input.helpers,
    fromStepId: input.fromStepId,
    toStepId: input.toStepId,
    branchId: fromBranchId,
    reason: input.reason,
    routeId: input.routeId,
  });
};

const syncChatFromActor = <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(input: {
  chat: Chat;
  flow: DefinedFlow<Chat, Message, Helpers>;
  actor: ReturnType<typeof createActor>;
}) => {
  const snapshot = input.actor.getSnapshot();
  const value = String(snapshot.value);

  input.chat.flow_snapshot = input.actor.getPersistedSnapshot();
  input.chat.flow_status = value === FLOW_FINAL_STATE ? "ended" : "active";
  input.chat.current_step = value === FLOW_FINAL_STATE ? null : value;
  input.chat.current_branch =
    value === FLOW_FINAL_STATE
      ? null
      : (input.flow.steps[value]?.branchId ?? null);
};

const enterSubflow = <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(input: {
  chat: Chat;
  parentFlow: DefinedFlow<Chat, Message, Helpers>;
  step: StepDefinition<Chat, Message, Helpers>;
}) => {
  const subflow = input.step.subflow;

  if (!subflow) {
    return false;
  }

  input.chat.flow_stack ??= [];
  input.chat.flow_stack.push({
    flow: input.parentFlow.id,
    return_step: subflow.returnStepId,
    return_branch: subflow.returnStepId
      ? (input.parentFlow.steps[subflow.returnStepId]?.branchId ?? null)
      : null,
  });
  input.chat.flow = subflow.flow.id;
  input.chat.current_step = null;
  input.chat.current_branch = null;
  input.chat.flow_status = "active";
  input.chat.flow_data = {};
  input.chat.flow_snapshot = undefined;
  return true;
};

const resumeParentFlow = <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(input: {
  chat: Chat;
  flowsById: Map<string, DefinedFlow<Chat, Message, Helpers>>;
}) => {
  const stackEntry = input.chat.flow_stack?.pop();

  if (!stackEntry) {
    return false;
  }

  const parentFlow = input.flowsById.get(stackEntry.flow);

  if (!parentFlow) {
    throw new Error(`Parent flow '${stackEntry.flow}' not found`);
  }

  input.chat.flow = parentFlow.id;
  input.chat.current_step = stackEntry.return_step;
  input.chat.current_branch = stackEntry.return_branch;
  input.chat.flow_status = "active";
  input.chat.flow_snapshot = undefined;
  return true;
};

const createRuntimeHelpers = <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(input: {
  flow: DefinedFlow<Chat, Message, Helpers>;
  chat: Chat;
  message: Message;
  helpers: Helpers;
  actor: ReturnType<typeof createActor>;
  registry: FlowBehaviorRegistry<Chat, Message, Helpers>;
}) => {
  const runStepEnter = async (stepId: string): Promise<void> => {
    const step = input.flow.steps[stepId];
    if (!step) {
      return;
    }

    const canEnter = await runGuard({
      ref: step.canEnter,
      registry: input.registry,
      chat: input.chat,
      message: input.message,
      helpers: input.helpers,
      flowId: input.flow.id,
      stepId,
      branchId: step.branchId,
    });

    if (!canEnter) {
      return;
    }

    const executor = createActionExecutor({
      flowId: input.flow.id,
      chat: input.chat,
      message: input.message,
      helpers: input.helpers,
      stepId,
      branchId: step.branchId,
    });

    await runEffects(
      resolveEffects(step.onEnterEffects, input.registry),
      executor.getSideEffectContext(),
    );

    const action = resolveAction(step.onEnter, input.registry);
    if (!action) {
      if (executor.getNavigation().type === "none") {
        enterSubflow({
          chat: input.chat,
          parentFlow: input.flow,
          step,
        });
      }
      return;
    }

    await action(executor.context);
    if (executor.getNavigation().type === "none") {
      const entered = enterSubflow({
        chat: input.chat,
        parentFlow: input.flow,
        step,
      });

      if (entered) {
        return;
      }
    }
    await completeNavigation(stepId, executor.getNavigation());
  };

  const runExitEffects = async (stepId: string) => {
    const step = input.flow.steps[stepId];
    if (!step) {
      return;
    }

    const executor = createActionExecutor({
      flowId: input.flow.id,
      chat: input.chat,
      message: input.message,
      helpers: input.helpers,
      stepId,
      branchId: step.branchId,
    });

    await runEffects(
      resolveEffects(step.onExitEffects, input.registry),
      executor.getSideEffectContext(),
    );
  };

  const completeNavigation = async (
    fromStepId: string,
    navigation: NavigationState,
  ) => {
    if (navigation.type === "none") {
      return false;
    }

    if (navigation.type === "goto") {
      const allowed = await canExitBranch({
        flow: input.flow,
        chat: input.chat,
        message: input.message,
        helpers: input.helpers,
        fromStepId,
        toStepId: navigation.stepId,
        reason: navigation.reason,
        routeId: navigation.routeId,
      });

      if (!allowed) {
        return false;
      }

      await runExitEffects(fromStepId);
      input.actor.send({
        type: "ROUTE",
        target: navigation.stepId,
        reason: navigation.reason,
        routeId: navigation.routeId,
      });
      syncChatFromActor({
        chat: input.chat,
        flow: input.flow,
        actor: input.actor,
      });
      input.chat.flow_history?.push({
        step: navigation.stepId,
        at: new Date(),
        reason: navigation.reason,
        routeId: navigation.routeId,
      });
      await runStepEnter(navigation.stepId);
      return true;
    }

    if (navigation.type === "end") {
      await runExitEffects(fromStepId);
      input.actor.send({
        type: "END",
        reason: navigation.reason,
        routeId: navigation.routeId,
      });
      syncChatFromActor({
        chat: input.chat,
        flow: input.flow,
        actor: input.actor,
      });
      input.chat.flow_history?.push({
        step: fromStepId,
        at: new Date(),
        reason: navigation.reason,
        routeId: navigation.routeId,
      });
      return true;
    }

    await runStepEnter(fromStepId);
    return true;
  };

  return { completeNavigation, runStepEnter };
};

const runIntentRoutes = async <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(input: {
  routes: IntentRouteDefinition<Chat, Message, Helpers>[];
  scope: "global" | "step";
  flow: DefinedFlow<Chat, Message, Helpers>;
  chat: Chat;
  message: Message;
  helpers: Helpers;
  actor: ReturnType<typeof createActor>;
  stepId: string;
  config: FlowChatConfig<Chat, any, Message, Helpers>;
  registry: FlowBehaviorRegistry<Chat, Message, Helpers>;
}) => {
  if (!input.config.matchIntent || input.routes.length === 0) {
    return false;
  }

  const matchedIntentId = await input.config.matchIntent({
    chat: input.chat,
    message: input.message,
    helpers: input.helpers,
    stepId: input.stepId,
    flowId: input.flow.id,
    scope: input.scope,
    intents: input.routes.map((route) => ({
      id: route.intentId,
      params: route.params,
    })),
  });

  if (!matchedIntentId) {
    return false;
  }

  const route = input.routes.find(
    (entry) => entry.intentId === matchedIntentId,
  );
  if (!route) {
    return false;
  }

  const branchId = input.flow.steps[input.stepId]?.branchId ?? null;
  const allowed = await runGuard({
    ref: route.guard,
    registry: input.registry,
    chat: input.chat,
    message: input.message,
    helpers: input.helpers,
    flowId: input.flow.id,
    stepId: input.stepId,
    branchId,
  });

  if (!allowed) {
    return false;
  }

  const executor = createActionExecutor({
    flowId: input.flow.id,
    chat: input.chat,
    message: input.message,
    helpers: input.helpers,
    stepId: input.stepId,
    branchId,
  });

  await runEffects(
    resolveEffects(route.effects, input.registry),
    executor.getSideEffectContext(),
  );

  if (route.target) {
    executor.setNavigation({
      type: "goto",
      stepId: route.target,
      reason: "intent",
      routeId: route.id,
    });
  }

  const action = resolveAction(route.action, input.registry);
  if (action) {
    await action(executor.context);
  }

  const runtime = createRuntimeHelpers(input);
  return runtime.completeNavigation(input.stepId, executor.getNavigation());
};

const runAnswerRoutes = async <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(input: {
  step: StepDefinition<Chat, Message, Helpers>;
  flow: DefinedFlow<Chat, Message, Helpers>;
  chat: Chat;
  message: Message;
  helpers: Helpers;
  actor: ReturnType<typeof createActor>;
  config: FlowChatConfig<Chat, any, Message, Helpers>;
  registry: FlowBehaviorRegistry<Chat, Message, Helpers>;
}) => {
  for (const route of input.step.answerRoutes) {
    const matched =
      route.matcher.kind === "named"
        ? await input.registry.matchers[route.matcher.name.id]?.({
            chat: input.chat,
            message: input.message,
            helpers: input.helpers,
            params: route.matcher.params,
            stepId: input.step.id,
            flowId: input.flow.id,
          })
        : await route.matcher.matcher({
            chat: input.chat,
            message: input.message,
            helpers: input.helpers,
            params: route.matcher.params,
            stepId: input.step.id,
            flowId: input.flow.id,
          });

    if (!matched) {
      continue;
    }

    const allowed = await runGuard({
      ref: route.guard,
      registry: input.registry,
      chat: input.chat,
      message: input.message,
      helpers: input.helpers,
      flowId: input.flow.id,
      stepId: input.step.id,
      branchId: input.step.branchId,
    });

    if (!allowed) {
      continue;
    }

    const executor = createActionExecutor({
      flowId: input.flow.id,
      chat: input.chat,
      message: input.message,
      helpers: input.helpers,
      stepId: input.step.id,
      branchId: input.step.branchId,
    });

    await runEffects(
      resolveEffects(route.effects, input.registry),
      executor.getSideEffectContext(),
    );

    if (route.target) {
      executor.setNavigation({
        type: "goto",
        stepId: route.target,
        reason: "answer",
        routeId: route.id,
      });
    }

    const action = resolveAction(route.action, input.registry);
    if (action) {
      await action(executor.context);
    }

    const runtime = createRuntimeHelpers(input);
    const handled = await runtime.completeNavigation(
      input.step.id,
      executor.getNavigation(),
    );
    if (handled || route.target || action) {
      return true;
    }
  }

  return false;
};

const runFallback = async <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(input: {
  action?: FlowActionRef<Chat, Message, Helpers>;
  flow: DefinedFlow<Chat, Message, Helpers>;
  chat: Chat;
  message: Message;
  helpers: Helpers;
  actor: ReturnType<typeof createActor>;
  stepId: string;
  branchId: string | null;
  registry: FlowBehaviorRegistry<Chat, Message, Helpers>;
}) => {
  const action = resolveAction(input.action, input.registry);
  if (!action) {
    return false;
  }

  const executor = createActionExecutor({
    flowId: input.flow.id,
    chat: input.chat,
    message: input.message,
    helpers: input.helpers,
    stepId: input.stepId,
    branchId: input.branchId,
  });

  await action(executor.context);
  const runtime = createRuntimeHelpers(input);
  await runtime.completeNavigation(input.stepId, executor.getNavigation());
  return true;
};

export const createFlowChat = <
  ReceivedMessage,
  ParsedReceivedMessage,
  Chat extends IFlowChat,
  Helpers extends IChatHelpers,
>(
  config: FlowChatConfig<Chat, ReceivedMessage, ParsedReceivedMessage, Helpers>,
): FlowChatApi<ReceivedMessage, ParsedReceivedMessage, Chat, Helpers> => {
  const flowsById = new Map<
    string,
    DefinedFlow<Chat, ParsedReceivedMessage, Helpers>
  >();
  const registry = createBehaviorRegistry<Chat, ParsedReceivedMessage, Helpers>(
    config,
  );

  const handle = async (chatId: string, payload: ReceivedMessage) => {
    const chatRecord = await config.repository.retrieveChat(chatId);

    if (!chatRecord) {
      throw new Error("Chat record not found");
    }

    const chat = normalizeFlowState(
      new Proxy(chatRecord, {
        get: Reflect.get,
        set: Reflect.set,
      }) as Chat,
    );

    const flow = flowsById.get(chat.flow);
    if (!flow) {
      throw new Error("Flow not found");
    }

    const machine = createFlowMachine(flow);

    if (chat.flow_status === "ended") {
      chat.flow_status = "active";
      chat.current_step = null;
      chat.current_branch = null;
      chat.flow_snapshot = undefined;
    }

    const actor = createActor(
      machine,
      chat.flow_snapshot
        ? { snapshot: chat.flow_snapshot as never }
        : undefined,
    ).start();

    const message = config.parseMessage(payload);
    const helpers = config.helpers({ chat, message });

    if (config.middleware) {
      await config.middleware({ chat, message, helpers });
    }

    const currentStepId = chat.current_step ?? flow.startStepId;
    const currentStep = flow.steps[currentStepId];
    if (!currentStep) {
      throw new Error(`Flow step '${currentStepId}' not found`);
    }

    if (chat.flow_history?.length === 0) {
      chat.flow_history.push({
        step: currentStepId,
        at: new Date(),
        reason: "start",
      });
    }

    const allowScopedGlobals = canUseGlobalIntents(flow, currentStepId);
    const globalRoutes = flow.globalIntentRoutes.filter(
      (route) => route.policy === "always" || allowScopedGlobals,
    );

    const globalHandled = await runIntentRoutes({
      routes: globalRoutes,
      scope: "global",
      flow,
      chat,
      message,
      helpers,
      actor,
      stepId: currentStepId,
      config,
      registry,
    });

    if (!globalHandled) {
      const stepHandled = await runIntentRoutes({
        routes: currentStep.intentRoutes,
        scope: "step",
        flow,
        chat,
        message,
        helpers,
        actor,
        stepId: currentStepId,
        config,
        registry,
      });

      if (!stepHandled) {
        const answerHandled = await runAnswerRoutes({
          step: currentStep,
          flow,
          chat,
          message,
          helpers,
          actor,
          config,
          registry,
        });

        if (!answerHandled) {
          const fallbackHandled = await runFallback({
            action: currentStep.otherwise,
            flow,
            chat,
            message,
            helpers,
            actor,
            stepId: currentStep.id,
            branchId: currentStep.branchId,
            registry,
          });

          if (!fallbackHandled) {
            await runFallback({
              action: flow.otherwise,
              flow,
              chat,
              message,
              helpers,
              actor,
              stepId: currentStep.id,
              branchId: currentStep.branchId,
              registry,
            });
          }
        }
      }
    }

    if (chat.flow === flow.id) {
      syncChatFromActor({ chat, flow, actor });
    } else {
      chat.current_step = null;
      chat.current_branch = null;
      chat.flow_status = "active";
      chat.flow_snapshot = undefined;
    }

    if (
      actor.getSnapshot().status === "done" &&
      (chat.flow_stack?.length ?? 0) > 0
    ) {
      resumeParentFlow({
        chat,
        flowsById,
      });
    }

    actor.stop();

    const { id: _, ...rest } = chat;
    await config.repository.updateChat(rest);
  };

  return {
    flow(id) {
      return defineFlow<Chat, ParsedReceivedMessage, Helpers>(id, (flow) => {
        flowsById.set(flow.id, flow);
      });
    },
    handle,
    guard(id, guard) {
      registry.guards[id] = guard;
      return { kind: "guard", id } as const;
    },
    action(id, action) {
      registry.actions[id] = action;
      return { kind: "action", id } as const;
    },
    effect(id, effect) {
      registry.effects[id] = effect;
      return { kind: "effect", id } as const;
    },
    matcher(id, matcher) {
      registry.matchers[id] = matcher;
      return { kind: "matcher", id } as const;
    },
    flows() {
      return Array.from(flowsById.values());
    },
  };
};
