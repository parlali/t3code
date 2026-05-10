import { useParams } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  resolveThreadRouteRef,
  resolveThreadRouteTarget,
  type ThreadRouteTarget,
} from "../threadRoutes";

function useRouteParam(name: "draftId" | "environmentId" | "threadId"): string | undefined {
  return useParams({
    strict: false,
    select: (params) => {
      const value = params[name];
      return typeof value === "string" ? value : undefined;
    },
  });
}

export function useThreadRouteTarget(): ThreadRouteTarget | null {
  const environmentId = useRouteParam("environmentId");
  const threadId = useRouteParam("threadId");
  const draftId = useRouteParam("draftId");

  return useMemo(
    () => resolveThreadRouteTarget({ draftId, environmentId, threadId }),
    [draftId, environmentId, threadId],
  );
}

export function useThreadRouteRef() {
  const environmentId = useRouteParam("environmentId");
  const threadId = useRouteParam("threadId");

  return useMemo(
    () => resolveThreadRouteRef({ environmentId, threadId }),
    [environmentId, threadId],
  );
}
