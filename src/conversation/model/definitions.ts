import type { Promisable } from "../../shared/promisable";
import type { HistoryEntry, IChat } from "../contracts/chat";
import type { ComponentHandle, PageHandle, RouteHandle } from "./handles";

export type NavigationReason = HistoryEntry["reason"];

export type InteractionMetadata = {
  description?: string;
  examples?: string[];
};

export type FocusMetadata = {
  focusDuration?: number;
};

export type ResolvedComponent =
  | string
  | {
      id: string;
      input?: string;
    }
  | null;

export type PageComponent = InteractionMetadata & {
  id: string;
  label: string;
  kind: "help" | "text" | "button" | "input" | "inquiry" | "back";
  handle: ComponentHandle;
};

export type Breadcrumb = {
  id: string;
  label: string;
  route: RouteHandle;
  page?: PageHandle;
};

export type PageBack = {
  route: RouteHandle;
  page?: PageHandle;
  label: string;
};

export type AppHelpContext<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = AppRuntimeBaseContext<Chat, Message, Ctx> & {
  components: PageComponent[];
};

export type AppHelpHandler<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = (ctx: AppHelpContext<Chat, Message, Ctx>) => Promisable<void>;

export type HelpDefinition<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = PageComponent & {
  kind: "help";
  render: AppHelpHandler<Chat, Message, Ctx>;
};

export type HelpOptions<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = {
  render: AppHelpHandler<Chat, Message, Ctx>;
};

export type AppRuntimeBaseContext<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = {
  chat: Chat;
  message: Message;
  ctx: Ctx;
  storage: Chat["storage"];
  currentRoute: DefinedRoute<Chat, Message, Ctx>;
  currentPage?: ResolvedPageDefinition<Chat, Message, Ctx>;
  page?: PageRuntimeInfo<Chat, Message, Ctx>;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  navigate: (route: RouteHandle) => void;
  focus: (component: ComponentHandle) => void;
  unfocus: () => void;
};

export type AppMiddleware<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = (ctx: AppRuntimeBaseContext<Chat, Message, Ctx>) => Promisable<void>;

export type AppPageRenderHandler<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = (
  ctx: AppRuntimeBaseContext<Chat, Message, Ctx> & {
    components?: PageComponent[];
  },
) => Promisable<void>;

export type AppComponentRenderContext<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
  Component extends PageComponent,
> = AppRuntimeBaseContext<Chat, Message, Ctx> & {
  component: Component;
};

export type AppTextRenderContext<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = AppComponentRenderContext<
  Chat,
  Message,
  Ctx,
  TextDefinition<Chat, Message, Ctx>
>;

export type AppTextRenderHandler<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = (ctx: AppTextRenderContext<Chat, Message, Ctx>) => Promisable<void>;

export type TextDefinition<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = PageComponent & {
  kind: "text";
  render?: AppTextRenderHandler<Chat, Message, Ctx>;
};

export type TextOptions<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = InteractionMetadata & {
  label: string;
  render?: AppTextRenderHandler<Chat, Message, Ctx>;
};

export type AppButtonContext<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = AppRuntimeBaseContext<Chat, Message, Ctx> & {
  button: ButtonDefinition<Chat, Message, Ctx>;
};

export type AppButtonInteractHandler<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = (ctx: AppButtonContext<Chat, Message, Ctx>) => Promisable<void>;

export type ButtonDefinition<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = PageComponent & {
  kind: "button";
  onInteract?: AppButtonInteractHandler<Chat, Message, Ctx>;
};

export type ButtonOptions<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = InteractionMetadata & {
  label: string;
  onInteract?: AppButtonInteractHandler<Chat, Message, Ctx>;
};

export type AppInputRenderContext<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = AppComponentRenderContext<
  Chat,
  Message,
  Ctx,
  InputDefinition<Chat, Message, Ctx>
>;

export type AppInputInteractContext<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = AppInputRenderContext<Chat, Message, Ctx> & {
  input?: string;
};

export type AppInputRenderHandler<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = (ctx: AppInputRenderContext<Chat, Message, Ctx>) => Promisable<void>;

export type AppInputInteractHandler<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = (ctx: AppInputInteractContext<Chat, Message, Ctx>) => Promisable<void>;

export type InputDefinition<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = PageComponent & {
  kind: "input";
  focusDuration?: number;
  render?: AppInputRenderHandler<Chat, Message, Ctx>;
  onInteract?: AppInputInteractHandler<Chat, Message, Ctx>;
};

export type InputOptions<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = InteractionMetadata &
  FocusMetadata & {
    label: string;
    render?: AppInputRenderHandler<Chat, Message, Ctx>;
    onInteract?: AppInputInteractHandler<Chat, Message, Ctx>;
  };

export type InquiryAnswers = Record<string, unknown>;

export type InquiryStepBase = InteractionMetadata & {
  id: string;
  label: string;
  handle: ComponentHandle;
};

export type InquiryInputStep<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = InquiryStepBase & {
  kind: "input";
  render?: (
    ctx: InquiryStepRenderContext<Chat, Message, Ctx>,
  ) => Promisable<void>;
};

export type InquiryStep<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = InquiryInputStep<Chat, Message, Ctx>;

export type InquiryStepRenderContext<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = AppRuntimeBaseContext<Chat, Message, Ctx> & {
  inquiry: InquiryDefinition<Chat, Message, Ctx>;
  step: InquiryStep<Chat, Message, Ctx>;
  answers: InquiryAnswers;
};

export type InquirySubmitContext<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = AppRuntimeBaseContext<Chat, Message, Ctx> & {
  inquiry: InquiryDefinition<Chat, Message, Ctx>;
  answers: InquiryAnswers;
};

export type InquirySubmitHandler<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = (ctx: InquirySubmitContext<Chat, Message, Ctx>) => Promisable<void>;

export type InquiryDefinition<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = PageComponent & {
  kind: "inquiry";
  focusDuration?: number;
  steps: InquiryStep<Chat, Message, Ctx>[];
  onSubmit?: InquirySubmitHandler<Chat, Message, Ctx>;
};

export type InquiryOptions<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = InteractionMetadata &
  FocusMetadata & {
    label: string;
  };

export type InquiryInputOptions = InteractionMetadata & {
  label: string;
  render?: (ctx: any) => Promisable<void>;
};

export type InquiryBuilder<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = InquiryDefinition<Chat, Message, Ctx> & {
  input: (
    id: string,
    options: InquiryInputOptions,
  ) => InquiryBuilder<Chat, Message, Ctx>;
  submit: (
    handler: InquirySubmitHandler<Chat, Message, Ctx>,
  ) => InquiryBuilder<Chat, Message, Ctx>;
};

export type AppBackContext<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = AppComponentRenderContext<
  Chat,
  Message,
  Ctx,
  BackDefinition<Chat, Message, Ctx>
> & {
  back: BackDefinition<Chat, Message, Ctx>;
  breadcrumbs: Breadcrumb[];
  goBack: (crumb?: Breadcrumb) => void;
};

export type AppBackRenderContext<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = AppBackContext<Chat, Message, Ctx>;

export type AppBackRenderHandler<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = (ctx: AppBackRenderContext<Chat, Message, Ctx>) => Promisable<void>;

export type AppBackInteractHandler<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = (ctx: AppBackContext<Chat, Message, Ctx>) => Promisable<void>;

export type BackDefinition<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = PageComponent & {
  kind: "back";
  focusDuration?: number;
  render?: AppBackRenderHandler<Chat, Message, Ctx>;
  onInteract?: AppBackInteractHandler<Chat, Message, Ctx>;
};

export type BackOptions<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = FocusMetadata & {
  render?: AppBackRenderHandler<Chat, Message, Ctx>;
  onInteract?: AppBackInteractHandler<Chat, Message, Ctx>;
};

export type AppNotFoundContext<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = AppRuntimeBaseContext<Chat, Message, Ctx> & {
  components: PageComponent[];
};

export type LayoutComponent<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> =
  | BackDefinition<Chat, Message, Ctx>
  | HelpDefinition<Chat, Message, Ctx>
  | TextDefinition<Chat, Message, Ctx>
  | ButtonDefinition<Chat, Message, Ctx>
  | InputDefinition<Chat, Message, Ctx>
  | InquiryDefinition<Chat, Message, Ctx>;

export type LayoutDefinition<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = {
  kind: "layout";
  render?: AppPageRenderHandler<Chat, Message, Ctx>;
  components: Array<LayoutComponent<Chat, Message, Ctx>>;
};

export type ResolvedLayoutDefinition<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = LayoutDefinition<Chat, Message, Ctx> & {
  id: string;
  routeId: string;
};

export type LayoutSource<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> =
  | LayoutDefinition<Chat, Message, Ctx>
  | (() => LayoutDefinition<Chat, Message, Ctx>);

export type LayoutOptions<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = {
  render?: AppPageRenderHandler<Chat, Message, Ctx>;
  components?: Array<LayoutComponent<Chat, Message, Ctx>>;
};

export type PageDefinition<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = {
  kind: "page";
  render?: AppPageRenderHandler<Chat, Message, Ctx>;
  components: Array<LayoutComponent<Chat, Message, Ctx>>;
};

export type ResolvedPageDefinition<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = PageDefinition<Chat, Message, Ctx> & {
  id: string;
  name: string;
  handle: PageHandle;
  routeId: string;
};

export type PageRuntimeInfo<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = {
  current: ResolvedPageDefinition<Chat, Message, Ctx>;
  back?: PageBack;
  breadcrumbs: Breadcrumb[];
};

export type PageSource<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> =
  | PageDefinition<Chat, Message, Ctx>
  | (() => PageDefinition<Chat, Message, Ctx>);

export type PageOptions<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = {
  render?: AppPageRenderHandler<Chat, Message, Ctx>;
  components?: Array<LayoutComponent<Chat, Message, Ctx>>;
};

export type DefinedRoute<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = RouteHandle & {
  name: string;
  parentId: string | null;
  layout?:
    | LayoutSource<Chat, Message, Ctx>
    | ResolvedLayoutDefinition<Chat, Message, Ctx>;
  page?:
    | PageSource<Chat, Message, Ctx>
    | ResolvedPageDefinition<Chat, Message, Ctx>;
  middlewares: AppMiddleware<Chat, Message, Ctx>[];
  notFound?:
    | PageSource<Chat, Message, Ctx>
    | ResolvedPageDefinition<Chat, Message, Ctx>;
  children: DefinedRoute<Chat, Message, Ctx>[];
};

export type RootDefinedRoute<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = DefinedRoute<Chat, Message, Ctx> & {
  __rootRoute: true;
};

export type RouteOptions<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = {
  layout?: LayoutSource<Chat, Message, Ctx>;
  page?: PageSource<Chat, Message, Ctx>;
  middleware?: AppMiddleware<Chat, Message, Ctx>[];
  notFound?: PageSource<Chat, Message, Ctx>;
  routes?: DefinedRoute<Chat, Message, Ctx>[];
};
