import type { Promisable } from "@/lib/types";
import type { ChatRepository, IChat } from "../core/chat";
import type { ChatHelperFactory, IChatHelpers } from "../core/helpers";

export type FlowStatus = "active" | "ended";

export type FlowHistoryEntry = {
  step: string;
  at: Date;
  reason: "start" | "intent" | "answer" | "otherwise" | "goto" | "end";
  routeId?: string;
};

export type IFlowChat = IChat & {
  current_step?: string | null;
  current_branch?: string | null;
  flow_status?: FlowStatus;
  flow_data?: Record<string, any>;
  flow_history?: FlowHistoryEntry[];
  flow_snapshot?: unknown;
  flow_stack?: Array<{
    flow: string;
    return_step: string | null;
    return_branch: string | null;
  }>;
};

export type FlowBehaviorHandle<Kind extends string = string> = {
  kind: Kind;
  id: string;
};

export type IntentCandidate = {
  id: string;
  params?: unknown;
};

export type IntentMatcherContext<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = {
  chat: Chat;
  message: Message;
  helpers: Helpers;
  stepId: string;
  flowId: string;
  scope: "global" | "step";
  intents: IntentCandidate[];
};

export type IntentMatcher<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = (
  ctx: IntentMatcherContext<Chat, Message, Helpers>,
) => Promisable<string | null>;

export type MessageMatcherContext<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
  Params = unknown,
> = {
  chat: Chat;
  message: Message;
  helpers: Helpers;
  params: Params;
  stepId: string;
  flowId: string;
};

export type MessageMatcher<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
  Params = unknown,
> = (
  ctx: MessageMatcherContext<Chat, Message, Helpers, Params>,
) => Promisable<boolean>;

export type MatcherRegistry<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = Record<string, MessageMatcher<Chat, Message, Helpers, any>>;

export type TransitionReason = FlowHistoryEntry["reason"];

export type BranchTransitionContext<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = {
  chat: Chat;
  message: Message;
  helpers: Helpers;
  fromStepId: string;
  toStepId: string;
  branchId: string;
  reason: TransitionReason;
  routeId?: string;
};

export type BranchDefinition<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = {
  id: string;
  allowExternalIntents: boolean;
  canExit?: (
    ctx: BranchTransitionContext<Chat, Message, Helpers>,
  ) => Promisable<boolean>;
};

export type NavigationState =
  | { type: "none" }
  | { type: "goto"; stepId: string; reason: TransitionReason; routeId?: string }
  | { type: "end"; reason: TransitionReason; routeId?: string }
  | { type: "repeat"; reason: TransitionReason; routeId?: string };

export type FlowActionContext<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = {
  chat: Chat;
  message: Message;
  helpers: Helpers;
  data: Record<string, any>;
  stepId: string;
  branchId: string | null;
  flowId: string;
  goto: (stepId: string) => void;
  end: () => void;
  repeat: () => void;
  stay: () => void;
};

export type FlowGuardContext<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
  Params = unknown,
> = {
  chat: Chat;
  message: Message;
  helpers: Helpers;
  data: Record<string, any>;
  params: Params;
  stepId: string;
  branchId: string | null;
  flowId: string;
};

export type FlowGuard<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
  Params = unknown,
> = (
  ctx: FlowGuardContext<Chat, Message, Helpers, Params>,
) => Promisable<boolean>;

export type FlowSideEffectContext<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = Omit<
  FlowActionContext<Chat, Message, Helpers>,
  "goto" | "end" | "repeat" | "stay"
>;

export type FlowSideEffect<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = (ctx: FlowSideEffectContext<Chat, Message, Helpers>) => Promisable<void>;

export type FlowAction<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = (ctx: FlowActionContext<Chat, Message, Helpers>) => Promisable<void>;

export type FlowGuardRef<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = FlowBehaviorHandle<"guard"> | FlowGuard<Chat, Message, Helpers>;

export type FlowActionRef<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = FlowBehaviorHandle<"action"> | FlowAction<Chat, Message, Helpers>;

export type FlowSideEffectRef<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = FlowBehaviorHandle<"effect"> | FlowSideEffect<Chat, Message, Helpers>;

export type MatcherRef<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> =
  | FlowBehaviorHandle<"matcher">
  | MessageMatcher<Chat, Message, Helpers, unknown>;

export type RouteBehaviorOptions<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = {
  guard?: FlowGuardRef<Chat, Message, Helpers>;
  effects?: FlowSideEffectRef<Chat, Message, Helpers>[];
};

export type AnswerMatcher<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> =
  | {
      kind: "named";
      name: FlowBehaviorHandle<"matcher">;
      params?: unknown;
    }
  | {
      kind: "custom";
      matcher: MessageMatcher<Chat, Message, Helpers, unknown>;
      params?: unknown;
    };

export type RouteDefinition<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = {
  id: string;
  action?: FlowActionRef<Chat, Message, Helpers>;
  target?: string;
  guard?: FlowGuardRef<Chat, Message, Helpers>;
  effects?: FlowSideEffectRef<Chat, Message, Helpers>[];
};

export type IntentRouteDefinition<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = RouteDefinition<Chat, Message, Helpers> & {
  intentId: string;
  params?: unknown;
};

export type AnswerRouteDefinition<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = RouteDefinition<Chat, Message, Helpers> & {
  matcher: AnswerMatcher<Chat, Message, Helpers>;
};

export type GlobalIntentPolicy = "always" | "respectBranch";

export type GlobalIntentRouteDefinition<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = IntentRouteDefinition<Chat, Message, Helpers> & {
  policy: GlobalIntentPolicy;
};

export type StepDefinition<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = {
  id: string;
  branchId: string | null;
  canEnter?: FlowGuardRef<Chat, Message, Helpers>;
  onEnter?: FlowActionRef<Chat, Message, Helpers>;
  onEnterEffects: FlowSideEffectRef<Chat, Message, Helpers>[];
  onExitEffects: FlowSideEffectRef<Chat, Message, Helpers>[];
  subflow?: {
    flow: DefinedFlow<Chat, Message, Helpers>;
    returnStepId: string | null;
  };
  intentRoutes: IntentRouteDefinition<Chat, Message, Helpers>[];
  answerRoutes: AnswerRouteDefinition<Chat, Message, Helpers>[];
  otherwise?: FlowActionRef<Chat, Message, Helpers>;
};

export type DefinedFlow<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = {
  kind: "flow";
  id: string;
  startStepId: string;
  steps: Record<string, StepDefinition<Chat, Message, Helpers>>;
  branches: Record<string, BranchDefinition<Chat, Message, Helpers>>;
  globalIntentRoutes: GlobalIntentRouteDefinition<Chat, Message, Helpers>[];
  otherwise?: FlowActionRef<Chat, Message, Helpers>;
};

export type RouteActionInput<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = string | FlowActionRef<Chat, Message, Helpers>;

export type IntentRouteOptions = {
  params?: unknown;
  policy?: GlobalIntentPolicy;
};

export type BranchOptions<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = {
  allowExternalIntents?: boolean;
  canExit?: BranchDefinition<Chat, Message, Helpers>["canExit"];
};

export type StepBuilder<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = {
  canEnter: (
    guard: FlowGuardRef<Chat, Message, Helpers>,
  ) => StepBuilder<Chat, Message, Helpers>;
  prompt: (
    action: FlowActionRef<Chat, Message, Helpers>,
  ) => StepBuilder<Chat, Message, Helpers>;
  effect: (
    effect: FlowSideEffectRef<Chat, Message, Helpers>,
  ) => StepBuilder<Chat, Message, Helpers>;
  onExit: (
    effect: FlowSideEffectRef<Chat, Message, Helpers>,
  ) => StepBuilder<Chat, Message, Helpers>;
  onIntent: (
    intentId: string,
    action: RouteActionInput<Chat, Message, Helpers>,
    options?: IntentRouteOptions & RouteBehaviorOptions<Chat, Message, Helpers>,
  ) => StepBuilder<Chat, Message, Helpers>;
  onAnswer: (
    matcher: MatcherRef<Chat, Message, Helpers>,
    paramsOrAction: unknown | RouteActionInput<Chat, Message, Helpers>,
    actionMaybe?: RouteActionInput<Chat, Message, Helpers>,
    options?: RouteBehaviorOptions<Chat, Message, Helpers>,
  ) => StepBuilder<Chat, Message, Helpers>;
  subflow: (
    flow: DefinedFlow<Chat, Message, Helpers>,
    options?: {
      returnTo?: string | null;
    },
  ) => StepBuilder<Chat, Message, Helpers>;
  otherwise: (
    action: FlowActionRef<Chat, Message, Helpers>,
  ) => StepBuilder<Chat, Message, Helpers>;
  end: () => StepBuilder<Chat, Message, Helpers>;
};

export type BranchBuilder<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = {
  step: (
    id: string,
    configure: (step: StepBuilder<Chat, Message, Helpers>) => unknown,
  ) => BranchBuilder<Chat, Message, Helpers>;
};

export type FlowBuilder<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = {
  start: (
    configure: (step: StepBuilder<Chat, Message, Helpers>) => unknown,
  ) => FlowBuilder<Chat, Message, Helpers>;
  step: (
    id: string,
    configure: (step: StepBuilder<Chat, Message, Helpers>) => unknown,
  ) => FlowBuilder<Chat, Message, Helpers>;
  branch: (
    id: string,
    options: BranchOptions<Chat, Message, Helpers>,
    configure: (branch: BranchBuilder<Chat, Message, Helpers>) => unknown,
  ) => FlowBuilder<Chat, Message, Helpers>;
  globalIntent: (
    intentId: string,
    action: RouteActionInput<Chat, Message, Helpers>,
    options?: IntentRouteOptions & RouteBehaviorOptions<Chat, Message, Helpers>,
  ) => FlowBuilder<Chat, Message, Helpers>;
  otherwise: (
    action: FlowActionRef<Chat, Message, Helpers>,
  ) => FlowBuilder<Chat, Message, Helpers>;
  build: () => DefinedFlow<Chat, Message, Helpers>;
};

export type FlowBehaviorRegistry<
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
> = {
  guards: Record<string, FlowGuard<Chat, Message, Helpers>>;
  actions: Record<string, FlowAction<Chat, Message, Helpers>>;
  effects: Record<string, FlowSideEffect<Chat, Message, Helpers>>;
  matchers: MatcherRegistry<Chat, Message, Helpers>;
};

export interface FlowChatConfig<
  Chat extends IFlowChat,
  ReceivedMessage,
  ParsedReceivedMessage,
  Helpers extends IChatHelpers,
> {
  parseMessage: (payload: ReceivedMessage) => ParsedReceivedMessage;
  repository: ChatRepository<Chat>;
  helpers: ChatHelperFactory<Chat, ParsedReceivedMessage, Helpers>;
  matchIntent?: IntentMatcher<Chat, ParsedReceivedMessage, Helpers>;
  matchers?: MatcherRegistry<Chat, ParsedReceivedMessage, Helpers>;
  guards?: Record<string, FlowGuard<Chat, ParsedReceivedMessage, Helpers>>;
  actions?: Record<string, FlowAction<Chat, ParsedReceivedMessage, Helpers>>;
  effects?: Record<
    string,
    FlowSideEffect<Chat, ParsedReceivedMessage, Helpers>
  >;
  middleware?: (ctx: {
    chat: Chat;
    message: ParsedReceivedMessage;
    helpers: Helpers;
  }) => Promisable<void>;
}

export type FlowChatApi<
  ReceivedMessage,
  ParsedReceivedMessage,
  Chat extends IFlowChat,
  Helpers extends IChatHelpers,
> = {
  flow: (id: string) => FlowBuilder<Chat, ParsedReceivedMessage, Helpers>;
  handle: (chatId: string, payload: ReceivedMessage) => Promise<void>;
  guard: (
    id: string,
    guard: FlowGuard<Chat, ParsedReceivedMessage, Helpers>,
  ) => FlowBehaviorHandle<"guard">;
  action: (
    id: string,
    action: FlowAction<Chat, ParsedReceivedMessage, Helpers>,
  ) => FlowBehaviorHandle<"action">;
  effect: (
    id: string,
    effect: FlowSideEffect<Chat, ParsedReceivedMessage, Helpers>,
  ) => FlowBehaviorHandle<"effect">;
  matcher: (
    id: string,
    matcher: MessageMatcher<Chat, ParsedReceivedMessage, Helpers, any>,
  ) => FlowBehaviorHandle<"matcher">;
  flows: () => DefinedFlow<Chat, ParsedReceivedMessage, Helpers>[];
};

export const START_STEP_ID = "__start__";
