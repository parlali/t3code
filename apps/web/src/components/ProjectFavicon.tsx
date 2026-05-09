import type { EnvironmentId } from "@t3tools/contracts";
import { FolderIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { resolveEnvironmentHttpUrl } from "../environments/runtime";

const loadedProjectFaviconSrcs = new Set<string>();

export function ProjectFavicon(input: {
  environmentId: EnvironmentId;
  cwd: string;
  className?: string;
}) {
  const src = (() => {
    try {
      return resolveEnvironmentHttpUrl({
        environmentId: input.environmentId,
        pathname: "/api/project-favicon",
        searchParams: { cwd: input.cwd },
      });
    } catch {
      return null;
    }
  })();
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(() =>
    src && loadedProjectFaviconSrcs.has(src) ? "loaded" : "loading",
  );
  const [requestedSrc, setRequestedSrc] = useState<string | null>(() =>
    src && loadedProjectFaviconSrcs.has(src) ? src : null,
  );

  useEffect(() => {
    setStatus(src && loadedProjectFaviconSrcs.has(src) ? "loaded" : "loading");

    if (!src) {
      setRequestedSrc(null);
      return;
    }

    if (loadedProjectFaviconSrcs.has(src)) {
      setRequestedSrc(src);
      return;
    }

    let cancelled = false;
    const requestFavicon = () => {
      if (!cancelled) {
        setRequestedSrc(src);
      }
    };

    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(requestFavicon, { timeout: 2_500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(handle);
      };
    }

    const timeoutId = globalThis.setTimeout(requestFavicon, 750);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timeoutId);
    };
  }, [src]);

  if (!src) {
    return (
      <FolderIcon
        className={`size-3.5 shrink-0 text-muted-foreground/50 ${input.className ?? ""}`}
      />
    );
  }

  return (
    <>
      {status !== "loaded" ? (
        <FolderIcon
          className={`size-3.5 shrink-0 text-muted-foreground/50 ${input.className ?? ""}`}
        />
      ) : null}
      <img
        src={requestedSrc ?? undefined}
        alt=""
        className={`size-3.5 shrink-0 rounded-sm object-contain ${status === "loaded" ? "" : "hidden"} ${input.className ?? ""}`}
        onLoad={() => {
          loadedProjectFaviconSrcs.add(src);
          setStatus("loaded");
        }}
        onError={() => setStatus("error")}
      />
    </>
  );
}
