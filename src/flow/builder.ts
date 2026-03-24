import type { IChatHelpers } from "../core/helpers";
import {
  type AnswerMatcher,
  type BranchBuilder,
  type BranchDefinition,
  type FlowActionRef,
  type FlowBuilder,
  type GlobalIntentRouteDefinition,
  type IFlowChat,
  type RouteActionInput,
  START_STEP_ID,
  type StepBuilder,
  type StepDefinition,
} from "./types";

const createRouteId = (prefix: string, count: number) => `${prefix}:${count}`;

const asAction = <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(
  action: RouteActionInput<Chat, Message, Helpers>,
) => {
  if (typeof action === "string") {
    return {
      action: undefined,
      target: action,
    };
  }

  return {
    action,
    target: undefined,
  };
};

const createStepBuilder = <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(
  step: StepDefinition<Chat, Message, Helpers>,
): StepBuilder<Chat, Message, Helpers> => {
  const builder: StepBuilder<Chat, Message, Helpers> = {
    canEnter(guard) {
      step.canEnter = guard;
      return builder;
    },
    prompt(action) {
      step.onEnter = action;
      return builder;
    },
    effect(effect) {
      step.onEnterEffects.push(effect);
      return builder;
    },
    onExit(effect) {
      step.onExitEffects.push(effect);
      return builder;
    },
    subflow(flow, options) {
      step.subflow = {
        flow,
        returnStepId: options?.returnTo ?? null,
      };
      return builder;
    },
    onIntent(intentId, action, options) {
      step.intentRoutes.push({
        id: createRouteId(step.id, step.intentRoutes.length),
        intentId,
        params: options?.params,
        guard: options?.guard,
        effects: options?.effects,
        ...asAction(action),
      });
      return builder;
    },
    onAnswer(matcher, paramsOrAction, actionMaybe, options) {
      const matcherDefinition: AnswerMatcher<Chat, Message, Helpers> =
        typeof matcher === "function"
          ? {
              kind: "custom",
              matcher,
              params: actionMaybe === undefined ? undefined : paramsOrAction,
            }
          : {
              kind: "named",
              name: matcher,
              params: actionMaybe === undefined ? undefined : paramsOrAction,
            };

      const action =
        actionMaybe === undefined
          ? (paramsOrAction as RouteActionInput<Chat, Message, Helpers>)
          : actionMaybe;

      step.answerRoutes.push({
        id: createRouteId(step.id, step.answerRoutes.length),
        matcher: matcherDefinition,
        guard: options?.guard,
        effects: options?.effects,
        ...asAction(action),
      });
      return builder;
    },
    otherwise(action) {
      step.otherwise = action;
      return builder;
    },
    end() {
      step.otherwise = ({ end }) => {
        end();
      };
      return builder;
    },
  };

  return builder;
};

export const defineFlow = <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(
  id: string,
  onBuild?: (flow: {
    kind: "flow";
    id: string;
    startStepId: string;
    steps: Record<string, StepDefinition<Chat, Message, Helpers>>;
    branches: Record<string, BranchDefinition<Chat, Message, Helpers>>;
    globalIntentRoutes: GlobalIntentRouteDefinition<Chat, Message, Helpers>[];
    otherwise?: FlowActionRef<Chat, Message, Helpers>;
  }) => void,
): FlowBuilder<Chat, Message, Helpers> => {
  const steps: Record<string, StepDefinition<Chat, Message, Helpers>> = {};
  const branches: Record<string, BranchDefinition<Chat, Message, Helpers>> = {};
  const globalIntentRoutes: GlobalIntentRouteDefinition<
    Chat,
    Message,
    Helpers
  >[] = [];
  let otherwiseAction: FlowActionRef<Chat, Message, Helpers> | undefined;

  const ensureStep = (stepId: string, branchId: string | null) => {
    const existing = steps[stepId];

    if (existing) {
      if (existing.branchId !== branchId) {
        throw new Error(`Step '${stepId}' already exists in another branch`);
      }
      return existing;
    }

    const step: StepDefinition<Chat, Message, Helpers> = {
      id: stepId,
      branchId,
      canEnter: undefined,
      onEnter: undefined,
      onEnterEffects: [],
      onExitEffects: [],
      intentRoutes: [],
      answerRoutes: [],
      otherwise: undefined,
    };

    steps[stepId] = step;
    return step;
  };

  const attachStep = (
    stepId: string,
    branchId: string | null,
    configure: (step: StepBuilder<Chat, Message, Helpers>) => unknown,
  ) => {
    const step = ensureStep(stepId, branchId);
    configure(createStepBuilder(step));
  };

  const builder: FlowBuilder<Chat, Message, Helpers> = {
    start(configure) {
      attachStep(START_STEP_ID, null, configure);
      return builder;
    },
    step(stepId, configure) {
      attachStep(stepId, null, configure);
      return builder;
    },
    branch(branchId, options, configure) {
      if (branches[branchId]) {
        throw new Error(`Branch '${branchId}' already exists`);
      }

      branches[branchId] = {
        id: branchId,
        allowExternalIntents: options.allowExternalIntents ?? true,
        canExit: options.canExit,
      };

      const branchBuilder: BranchBuilder<Chat, Message, Helpers> = {
        step(stepId, stepConfigure) {
          attachStep(stepId, branchId, stepConfigure);
          return branchBuilder;
        },
      };

      configure(branchBuilder);
      return builder;
    },
    globalIntent(intentId, action, options) {
      globalIntentRoutes.push({
        id: createRouteId("global", globalIntentRoutes.length),
        intentId,
        params: options?.params,
        policy: options?.policy ?? "respectBranch",
        guard: options?.guard,
        effects: options?.effects,
        ...asAction(action),
      });
      return builder;
    },
    otherwise(action) {
      otherwiseAction = action;
      return builder;
    },
    build() {
      if (!steps[START_STEP_ID]) {
        throw new Error("Flow is missing a start step");
      }

      const knownStepIds = new Set(Object.keys(steps));
      const checkTarget = (target: string | undefined) => {
        if (target && !knownStepIds.has(target)) {
          throw new Error(`Unknown target step '${target}' in flow '${id}'`);
        }
      };

      for (const step of Object.values(steps)) {
        for (const route of step.intentRoutes) {
          checkTarget(route.target);
        }

        for (const route of step.answerRoutes) {
          checkTarget(route.target);
        }
      }

      for (const route of globalIntentRoutes) {
        checkTarget(route.target);
      }

      const flow = {
        kind: "flow" as const,
        id,
        startStepId: START_STEP_ID,
        steps,
        branches,
        globalIntentRoutes,
        otherwise: otherwiseAction,
      };

      onBuild?.(flow);
      return flow;
    },
  };

  return builder;
};
