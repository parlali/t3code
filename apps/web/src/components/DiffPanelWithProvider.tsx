import DiffPanel from "./DiffPanel";
import { DiffWorkerPoolProvider } from "./DiffWorkerPoolProvider";
import type { DiffPanelMode } from "./DiffPanelShell";

export default function DiffPanelWithProvider(props: { mode: DiffPanelMode }) {
  return (
    <DiffWorkerPoolProvider>
      <DiffPanel mode={props.mode} />
    </DiffWorkerPoolProvider>
  );
}
