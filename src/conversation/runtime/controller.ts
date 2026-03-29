import type { ComponentHandle, RouteHandle } from "../model";

export const createController = () => {
  let nextRouteId: string | null = null;
  let nextFocus: ComponentHandle | null = null;
  let shouldClearFocus = false;

  return {
    navigate(route: RouteHandle) {
      nextRouteId = route.id;
      nextFocus = null;
      shouldClearFocus = true;
    },
    focus(target: ComponentHandle) {
      nextFocus = target;
      nextRouteId = target.routeId;
      shouldClearFocus = false;
    },
    unfocus() {
      nextFocus = null;
      shouldClearFocus = true;
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
