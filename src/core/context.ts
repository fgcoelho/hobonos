import type { IChat } from "./chat";
import type { IChatHelpers } from "./helpers";

export interface IInteractionContext<
  Chat extends IChat,
  ReceivedMessage,
  Helpers extends IChatHelpers,
> {
  chat: Chat;
  helpers: Helpers;
  message: ReceivedMessage;
}

export const createInteractionContext = <
  Chat extends IChat,
  ReceivedMessage,
  Helpers extends IChatHelpers,
>(
  chat: Chat,
  message: ReceivedMessage,
  helpers: Helpers,
): IInteractionContext<Chat, ReceivedMessage, Helpers> => ({
  chat,
  helpers,
  message,
});
