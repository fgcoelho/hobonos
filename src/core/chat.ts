import type { Promisable } from "@/lib/types";

export type ChatStore = Record<string | number, any>;

export type IChat = {
  id: string;
  store: any;
  flow: string;
  language: string;
  locked: boolean;
  lock_until: Date | null;
};

export type ChatRepository<Chat extends IChat> = {
  retrieveChat: (chatId: string) => Promisable<Chat | null>;
  updateChat: (chat: Omit<Chat, "id">) => Promisable<void>;
};
