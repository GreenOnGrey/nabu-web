import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { AdminCatalogItem, AdminChannel, Agent, Me, ModelConnectionList, PublicConfig, SandboxProfiles, UserGroup } from "./types";

// Query keys shared by pages and the SSE invalidation in App.
export const keys = {
  config: ["config"] as const,
  me: ["me"] as const,
  agent: ["agent"] as const,
  conversations: (archived: boolean) => ["conversations", archived] as const,
  messages: (id: string) => ["messages", id] as const,
  memories: (q: string) => ["memories", q] as const,
  commState: ["comm", "state"] as const,
  commNotes: (query: string) => ["comm", "notes", query] as const,
  commNote: (id: string) => ["comm", "note", id] as const,
  commGraph: (query: string) => ["comm", "graph", query] as const,
  commTags: (kind: string) => ["comm", "tags", kind] as const,
  commitments: (query: string) => ["commitments", query] as const,
  memoryTasks: ["memoryTasks"] as const,
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

// The lists of the administration shared by its pages (FTR.NAB.CMN-0007).
export const adminKeys = {
  groups: ["admin", "groups"] as const,
  catalog: ["admin", "catalog"] as const,
  connections: ["admin", "connections"] as const,
  channels: ["admin", "channels"] as const,
  // FTR.NAB.CMN-0008: the profiles of sandboxes — the page of images and the form of a service agent
  sandboxProfiles: ["admin", "sandbox-profiles"] as const,
};

/** The profiles of sandboxes; `follow` re-reads them while a custom image is being checked. */
export const useSandboxProfiles = (follow = false) =>
  useQuery({
    queryKey: adminKeys.sandboxProfiles, queryFn: () => api.get<SandboxProfiles>("/admin/api/v1/sandbox/profiles"),
    refetchInterval: follow ? (query) => (query.state.data?.profiles.some((p) => p.state === "checking" || p.pendingRef) ? 5000 : false) : false,
  });

export const useAdminGroups = () =>
  useQuery({ queryKey: adminKeys.groups, queryFn: () => api.get<{ items: UserGroup[] }>("/admin/api/v1/groups") });

export const useAdminCatalog = () =>
  useQuery({ queryKey: adminKeys.catalog, queryFn: () => api.get<{ items: AdminCatalogItem[] }>("/admin/api/v1/catalog") });

export const useModelConnections = () =>
  useQuery({ queryKey: adminKeys.connections, queryFn: () => api.get<ModelConnectionList>("/admin/api/v1/model-connections") });

export const useAdminChannels = () =>
  useQuery({ queryKey: adminKeys.channels, queryFn: () => api.get<{ items: AdminChannel[] }>("/admin/api/v1/channels") });
