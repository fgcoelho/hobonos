import { createFlowChat, type IFlowChat } from "../src";

export type TestMessage = {
  text: string;
};

export type TestChat = IFlowChat & {
  store: {
    transcript: string[];
    calls: string[];
  };
};

export type TestHelpers = {
  send: (text: string) => Promise<void>;
  mark: (label: string) => Promise<void>;
};

export const createChatRecord = (
  overrides: Partial<TestChat> = {},
): TestChat => ({
  id: "chat_1",
  flow: "main",
  language: "en",
  locked: false,
  lock_until: null,
  store: {
    transcript: [],
    calls: [],
  },
  ...overrides,
});

export const createHarness = (options?: {
  chats?: TestChat[];
  matchIntent?: (ctx: {
    message: TestMessage;
    intents: Array<{ id: string; params?: unknown }>;
    scope: "global" | "step";
    stepId: string;
    flowId: string;
  }) => Promise<string | null> | string | null;
  middleware?: (ctx: {
    chat: TestChat;
    message: TestMessage;
    helpers: TestHelpers;
  }) => Promise<void> | void;
}) => {
  const chats = new Map<string, TestChat>();
  for (const chat of options?.chats ?? [createChatRecord()]) {
    chats.set(chat.id, chat);
  }

  let activeChatId: string | null = null;
  const parseCalls: string[] = [];
  const helperCalls: string[] = [];
  const updateCalls: TestChat[] = [];

  const chat = createFlowChat<TestMessage, TestMessage, TestChat, TestHelpers>({
    parseMessage: (payload) => {
      parseCalls.push(payload.text);
      return payload;
    },
    repository: {
      retrieveChat: async (chatId) => {
        activeChatId = chatId;
        return chats.get(chatId) ?? null;
      },
      updateChat: async (next) => {
        if (!activeChatId) {
          throw new Error("No active chat id");
        }

        const updated = {
          id: activeChatId,
          ...(next as Omit<TestChat, "id">),
        } as TestChat;

        chats.set(activeChatId, updated);
        updateCalls.push(updated);
      },
    },
    helpers: ({ chat }) => {
      helperCalls.push(chat.id);

      return {
        send: async (text) => {
          chat.store.transcript.push(text);
        },
        mark: async (label) => {
          chat.store.calls.push(label);
        },
      };
    },
    matchIntent: async ({ message, intents, scope, stepId, flowId }) => {
      if (options?.matchIntent) {
        return options.matchIntent({
          message,
          intents,
          scope,
          stepId,
          flowId,
        });
      }

      const normalized = message.text.trim().toLowerCase();
      return intents.find((intent) => intent.id === normalized)?.id ?? null;
    },
    middleware: options?.middleware,
  });

  return {
    chat,
    chats,
    parseCalls,
    helperCalls,
    updateCalls,
    getChat(chatId = "chat_1") {
      const value = chats.get(chatId);
      if (!value) {
        throw new Error(`Chat '${chatId}' not found`);
      }
      return value;
    },
  };
};
