import type { Promisable } from "../../shared/promisable";

export type HistoryEntry = {
  routeId: string;
  at: number;
  reason:
    | "render"
    | "interact"
    | "focus"
    | "navigate"
    | "middleware"
    | "notFound";
  sourceRouteId?: string;
  componentId?: string;
};

export type InquiryState = {
  routeId: string;
  inquiryId: string;
  stepIndex: number;
  answers: Record<string, unknown>;
};

export type IChat<
  Storage extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: string;
  storage: Storage;
  currentRouteId?: string | null;
  history?: HistoryEntry[];
  focusedComponentId?: string | null;
  focusUntil?: number | null;
  inquiries?: Record<string, InquiryState | undefined>;
};

export type ChatRepository<Chat extends IChat> = {
  retrieveChat: (chatId: string) => Promisable<Chat | null>;
  updateChat: (chat: Chat) => Promisable<void>;
};
