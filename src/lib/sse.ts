import { apiUrl } from "../api/base";
import { useEffect, useRef } from "react";

// One SSE stream carries every event of the user (FTR.NAB.CMN-0001 tech §3.2).
export const EVENT_TYPES = [
  "message.created", "message.delta", "message.done", "tool.step", "chat.error",
  "conversation.updated", "space.state",
  "task.created", "task.updated", "task.run.finished",
  "memory.changed", "agent.updated", "connections.changed",
  // FTR.NAB.CMN-0002 tech §3
  "confirmation.created", "confirmation.resolved", "conversation.unread", "access.changed", "restore.requested",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

type Handler = (data: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

const handlers = new Map<EventType, Set<Handler>>();
let source: EventSource | null = null;
const reconnectHandlers = new Set<() => void>();

export function connectEvents() {
  if (source) return;
  source = new EventSource(apiUrl("/api/v1/events"), { withCredentials: true });
  let wasOpen = false;
  source.onopen = () => {
    // After a reconnect, state may have changed while we were away.
    if (wasOpen) reconnectHandlers.forEach((h) => h());
    wasOpen = true;
  };
  for (const type of EVENT_TYPES) {
    source.addEventListener(type, (e) => {
      let data: unknown;
      try {
        data = JSON.parse((e as MessageEvent).data);
      } catch {
        return;
      }
      handlers.get(type)?.forEach((h) => h(data));
    });
  }
}

export function disconnectEvents() {
  source?.close();
  source = null;
}

export function onEvent(type: EventType, h: Handler): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(h);
  return () => handlers.get(type)!.delete(h);
}

export function onReconnect(h: () => void): () => void {
  reconnectHandlers.add(h);
  return () => reconnectHandlers.delete(h);
}

/** Subscribes to an event type for the component's lifetime; the latest handler is always used. */
export function useEvent(type: EventType, h: Handler) {
  const ref = useRef(h);
  ref.current = h;
  useEffect(() => onEvent(type, (d) => ref.current(d)), [type]);
}
