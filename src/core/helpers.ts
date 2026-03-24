import type { Promisable } from "@/lib/types";
import type { IChat } from "./chat";

export type ChatHelperContext<Chat extends IChat = IChat, Message = unknown> = {
  chat: Chat;
  message: Message;
};

export type ChatHelper = (...args: any[]) => Promisable<any>;

export interface IChatHelpers {
  [key: string]: ChatHelper;
}

export type ChatHelperFactory<
  Chat extends IChat,
  Message,
  ChatHelpers extends IChatHelpers,
> = (ctx: { chat: Chat; message: Message }) => ChatHelpers;
