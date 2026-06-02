import type { VcsStatusResult } from "@t3tools/contracts";

export function shouldShowPushAction(status: VcsStatusResult | null, isPending: boolean): boolean {
  return (
    Boolean(status?.isRepo) &&
    !isPending &&
    status?.refName !== null &&
    (status?.hasUpstream === true || status?.hasPrimaryRemote === true) &&
    (status?.aheadCount ?? 0) > 0 &&
    (status?.behindCount ?? 0) === 0
  );
}
