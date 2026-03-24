import { createMachine } from "xstate";
import type { IChatHelpers } from "../core/helpers";
import type { DefinedFlow, IFlowChat, TransitionReason } from "./types";

type FlowMachineEvent =
  | {
      type: "ROUTE";
      target: string;
      reason: TransitionReason;
      routeId?: string;
    }
  | {
      type: "END";
      reason: TransitionReason;
      routeId?: string;
    };

export const FLOW_FINAL_STATE = "__ended__";

export const createFlowMachine = <
  Chat extends IFlowChat,
  Message,
  Helpers extends IChatHelpers,
>(
  flow: DefinedFlow<Chat, Message, Helpers>,
) => {
  const stateEntries = Object.keys(flow.steps).map((stepId) => {
    const transitions = Object.keys(flow.steps).map((targetStepId) => ({
      guard: ({ event }: { event: FlowMachineEvent }) =>
        event.type === "ROUTE" && event.target === targetStepId,
      target: targetStepId,
    }));

    return [
      stepId,
      {
        on: {
          ROUTE: transitions,
          END: FLOW_FINAL_STATE,
        },
      },
    ] as const;
  });

  return createMachine({
    id: flow.id,
    initial: flow.startStepId,
    states: {
      ...Object.fromEntries(stateEntries),
      [FLOW_FINAL_STATE]: {
        type: "final",
      },
    },
  });
};
