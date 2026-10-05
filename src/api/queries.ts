import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { Agent, Me, PublicConfig } from "./types";

// Query keys shared by pages and the SSE invalidation in App.
export const keys = {
  config: ["config"] as const,
  me: ["me"] as const,
  agent: ["agent"] as const,
  conversations: (archived: boolean) => ["conversations", archived] as const,
  messages: (id: string) => ["messages", id] as const,
  memories: (q: string) => ["memories", q] as const,
  tasks: (status: string) => ["tasks", status] as const,
  taskRuns: (id: string) => ["taskRuns", id] as const,
  space: ["space"] as const,
  files: ["files"] as const,
  catalog: ["catalog"] as const,
  channels: ["channels"] as const,
};

export const useConfig = () =>
  useQuery({ queryKey: keys.config, queryFn: () => api.get<PublicConfig>("/api/v1/config"), staleTime: Infinity });

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api.get<Me>("/api/v1/me"), retry: false });

export const useAgent = () => useQuery({ queryKey: keys.agent, queryFn: () => api.get<Agent>("/api/v1/agent") });
