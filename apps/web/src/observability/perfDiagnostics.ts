interface T3PerfEvent {
  readonly at: string;
  readonly sinceNavigationStartMs: number;
  readonly name: string;
  readonly data: Record<string, unknown>;
}

declare global {
  interface Window {
    __T3_PERF_EVENTS__?: T3PerfEvent[];
  }
}

const MAX_EVENTS = 500;

export function recordClientPerfEvent(name: string, data: Record<string, unknown> = {}): void {
  const event: T3PerfEvent = {
    at: new Date().toISOString(),
    sinceNavigationStartMs: Math.round(performance.now()),
    name,
    data,
  };

  if (typeof window !== "undefined") {
    const events = (window.__T3_PERF_EVENTS__ ??= []);
    events.push(event);
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }
  }

  console.info("[t3:perf]", event);
}
