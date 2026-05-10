interface T3DiagnosticEvent {
  readonly at: string;
  readonly name: string;
  readonly data: Record<string, unknown>;
}

declare global {
  interface Window {
    __T3_DIAGNOSTICS__?: T3DiagnosticEvent[];
  }
}

const MAX_DIAGNOSTIC_EVENTS = 200;

export function recordDiagnosticEvent(name: string, data: Record<string, unknown> = {}): void {
  const event: T3DiagnosticEvent = {
    at: new Date().toISOString(),
    name,
    data,
  };
  const events = (window.__T3_DIAGNOSTICS__ ??= []);
  events.push(event);
  if (events.length > MAX_DIAGNOSTIC_EVENTS) {
    events.splice(0, events.length - MAX_DIAGNOSTIC_EVENTS);
  }
  console.info("[t3:diagnostic]", event);
}

export function recentDiagnosticEvents(): readonly T3DiagnosticEvent[] {
  return window.__T3_DIAGNOSTICS__?.slice(-50) ?? [];
}
