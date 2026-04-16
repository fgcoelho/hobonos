import type { ComponentHandle, RouteHandle } from "../model";

export class RuntimeControlSignal extends Error {
  kind: "navigate" | "focus" | "unfocus";

  constructor(kind: "navigate" | "focus" | "unfocus") {
    super(`Runtime control flow: ${kind}`);
    this.name = "RuntimeControlSignal";
    this.kind = kind;
  }
}

export const isRuntimeControlSignal = (
  error: unknown,
): error is RuntimeControlSignal => error instanceof RuntimeControlSignal;

export const createController = () => {
  let nextRouteId: string | null = null;
  let nextFocus: ComponentHandle | null = null;
  let shouldClearFocus = false;

  return {
    navigate(route: RouteHandle) {
      nextRouteId = route.id;
      nextFocus = null;
      shouldClearFocus = true;
      throw new RuntimeControlSignal("navigate");
    },
    focus(target: ComponentHandle) {
      nextFocus = target;
      nextRouteId = target.routeId;
      shouldClearFocus = false;
      throw new RuntimeControlSignal("focus");
    },
    unfocus() {
      nextFocus = null;
      shouldClearFocus = true;
      throw new RuntimeControlSignal("unfocus");
    },
    routeId() {
      return nextRouteId;
    },
    focusTarget() {
      return nextFocus;
    },
    shouldUnfocus() {
      return shouldClearFocus;
    },
    clear() {
      nextRouteId = null;
      nextFocus = null;
      shouldClearFocus = false;
    },
  };
};
