import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { buildDraftThreadRouteParams, buildThreadRouteParams } from "../../threadRoutes";
import type { ShellWorkspaceRoute } from "./shellStore";

export function useNavigateToShellWorkspace() {
  const navigate = useNavigate();

  return useCallback(
    (route: ShellWorkspaceRoute) => {
      if (route.kind === "server") {
        return navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams({
            environmentId: route.environmentId,
            threadId: route.threadId,
          }),
        });
      }
      if (route.kind === "draft") {
        return navigate({
          to: "/draft/$draftId",
          params: buildDraftThreadRouteParams(route.draftId),
        });
      }
      return navigate({ to: "/" });
    },
    [navigate],
  );
}
