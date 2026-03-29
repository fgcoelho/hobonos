import type { Promisable } from "../../shared/promisable";
import type { ChatRepository, IChat } from "../contracts/chat";
import type {
  BackDefinition,
  BackOptions,
  ButtonDefinition,
  ButtonOptions,
  DefinedRoute,
  HelpDefinition,
  HelpOptions,
  InputDefinition,
  InputOptions,
  InquiryBuilder,
  InquiryOptions,
  LayoutDefinition,
  LayoutOptions,
  PageComponent,
  PageDefinition,
  PageOptions,
  ResolvedComponent,
  RootDefinedRoute,
  RouteOptions,
  TextDefinition,
  TextOptions,
} from "./definitions";
export type ResolveComponentContext<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = {
  chat: Chat;
  message: Message;
  ctx: Ctx;
  route: DefinedRoute<Chat, Message, Ctx>;
  routeStack: DefinedRoute<Chat, Message, Ctx>[];
  components: PageComponent[];
};

export type ComponentResolver<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
> = (
  ctx: ResolveComponentContext<Chat, Message, Ctx>,
) => Promisable<ResolvedComponent>;

export type HobonosMiddlewareResult<Added extends Record<string, any>> =
  | void
  | Added
  | { ctx: Added };

export type HobonosMiddleware<
  Chat extends IChat,
  Message,
  Ctx extends Record<string, any>,
  Added extends Record<string, any>,
> = (ctx: {
  chat: Chat;
  message: Message;
  ctx: Ctx;
}) => Promisable<HobonosMiddlewareResult<Added>>;

export type CreateHobonosConfig<
  Chat extends IChat,
  ReceivedMessage,
  ParsedMessage,
  Ctx extends Record<string, any>,
> = {
  parseMessage: (payload: ReceivedMessage) => ParsedMessage;
  repository: ChatRepository<Chat>;
  resolveComponent: ComponentResolver<Chat, ParsedMessage, Ctx>;
  defaultFocusDuration?: number;
};

export type HobonosApi<
  ReceivedMessage,
  ParsedMessage,
  Chat extends IChat,
  Ctx extends Record<string, any>,
> = {
  middleware: <Added extends Record<string, any>>(
    middleware: HobonosMiddleware<Chat, ParsedMessage, Ctx, Added>,
  ) => HobonosApi<ReceivedMessage, ParsedMessage, Chat, Ctx & Added>;
  route: (
    name: string,
    options?: RouteOptions<Chat, ParsedMessage, Ctx>,
  ) => DefinedRoute<Chat, ParsedMessage, Ctx>;
  rootRoute: (
    options?: RouteOptions<Chat, ParsedMessage, Ctx>,
  ) => RootDefinedRoute<Chat, ParsedMessage, Ctx>;
  page: (
    options: PageOptions<Chat, ParsedMessage, Ctx>,
  ) => PageDefinition<Chat, ParsedMessage, Ctx>;
  layout: (
    options: LayoutOptions<Chat, ParsedMessage, Ctx>,
  ) => LayoutDefinition<Chat, ParsedMessage, Ctx>;
  help: (
    options: HelpOptions<Chat, ParsedMessage, Ctx>,
  ) => HelpDefinition<Chat, ParsedMessage, Ctx>;
  text: (
    id: string,
    options: TextOptions<Chat, ParsedMessage, Ctx>,
  ) => TextDefinition<Chat, ParsedMessage, Ctx>;
  button: (
    id: string,
    options: ButtonOptions<Chat, ParsedMessage, Ctx>,
  ) => ButtonDefinition<Chat, ParsedMessage, Ctx>;
  input: (
    id: string,
    options: InputOptions<Chat, ParsedMessage, Ctx>,
  ) => InputDefinition<Chat, ParsedMessage, Ctx>;
  inquiry: (
    id: string,
    options: InquiryOptions<Chat, ParsedMessage, Ctx>,
  ) => InquiryBuilder<Chat, ParsedMessage, Ctx>;
  back: (
    options: BackOptions<Chat, ParsedMessage, Ctx>,
  ) => BackDefinition<Chat, ParsedMessage, Ctx>;
  createWorker: (
    rootRoute: RootDefinedRoute<Chat, ParsedMessage, Ctx>,
  ) => ConversationWorkerApi<ReceivedMessage>;
};

export type ConversationWorkerApi<ReceivedMessage> = {
  run: (chatId: string, payload: ReceivedMessage) => Promise<void>;
};
