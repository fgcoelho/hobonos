import type { IChat, InquiryState } from "../contracts/chat";
import type { NavigationReason } from "../model";

export const normalizeAppState = <Chat extends IChat>(chat: Chat) => {
  chat.currentRouteId ??= null;
  chat.storage ??= {};
  chat.history ??= [];
  chat.focusedComponentId ??= null;
  chat.focusUntil ??= null;
  chat.inquiries ??= {};
  return chat;
};

export const setFocusedComponentId = <Chat extends IChat>(
  chat: Chat,
  focusedComponentId: string | null,
) => {
  chat.focusedComponentId = focusedComponentId;
  if (!focusedComponentId) {
    chat.focusUntil = null;
  }
};

export const recordHistory = <Chat extends IChat>(input: {
  chat: Chat;
  routeId: string;
  reason: NavigationReason;
  sourceRouteId?: string;
  componentId?: string;
}) => {
  input.chat.history?.push({
    routeId: input.routeId,
    at: Date.now(),
    reason: input.reason,
    sourceRouteId: input.sourceRouteId,
    componentId: input.componentId,
  });
};

export const setInquiryState = <Chat extends IChat>(
  chat: Chat,
  inquiryId: string,
  inquiry: InquiryState | null,
) => {
  chat.inquiries ??= {};
  if (!inquiry) {
    delete chat.inquiries[inquiryId];
    return;
  }

  chat.inquiries[inquiryId] = inquiry;
};

export const getInquiryState = <Chat extends IChat>(
  chat: Chat,
  inquiryId: string,
) => chat.inquiries?.[inquiryId] ?? null;
