"use client";

import { apiRequest } from "@/services/http/client";
import type {
  CreatedVideo,
  PlayerConfigReference,
  StoredVideo,
  VideoFolder,
  VideoStatus,
} from "@/features/videos/model/types";

interface VideosPayload {
  videos: StoredVideo[];
  nextCursor?: string | null;
}

interface FoldersPayload {
  folders: VideoFolder[];
}

interface CreateVideoInput {
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string | null;
  status: "processing";
}

interface MultipartPayload {
  action: "create" | "sign" | "complete" | "abort";
  uploadId?: string;
  partNumber?: number;
  parts?: Array<{ etag: string; partNumber: number }>;
  durationSeconds?: number | null;
}

export const videosService = {
  async list(filters?: { cursor?: string; folderId?: string; status?: VideoStatus }) {
    const params = new URLSearchParams();
    if (filters?.cursor) params.set("cursor", filters.cursor);
    if (filters?.folderId) params.set("folderId", filters.folderId);
    if (filters?.status) params.set("status", filters.status);
    const query = params.size ? `?${params.toString()}` : "";
    return apiRequest<VideosPayload>(`/api/videos${query}`);
  },

  listFolders() {
    return apiRequest<FoldersPayload>("/api/folders");
  },

  create(input: CreateVideoInput) {
    return apiRequest<{ video: CreatedVideo }>("/api/videos", { method: "POST", body: input });
  },

  update(videoId: string, input: { title?: string; folderId?: string | null; status?: VideoStatus; durationSeconds?: number | null }) {
    return apiRequest<{ video?: StoredVideo }>(`/api/videos/${videoId}`, { method: "PATCH", body: input });
  },

  remove(videoId: string) {
    return apiRequest<Record<string, never>>(`/api/videos/${videoId}`, { method: "DELETE" });
  },

  createFolder(name: string) {
    return apiRequest<{ folder: VideoFolder }>("/api/folders", { method: "POST", body: { name } });
  },

  removeFolder(folderId: string) {
    return apiRequest<Record<string, never>>(`/api/folders/${folderId}`, { method: "DELETE" });
  },

  duplicate(videoId: string) {
    return apiRequest<{ video?: StoredVideo }>(`/api/videos/${videoId}/duplicate`, { method: "POST" });
  },

  publishPlayer(videoId: string) {
    return apiRequest<{ playerConfig: PlayerConfigReference }>("/api/player-configs", {
      method: "POST",
      body: { videoId },
    });
  },

  multipart(videoId: string, payload: MultipartPayload) {
    return apiRequest<{
      uploadId?: string;
      partSize?: number;
      url?: string;
    }>(`/api/videos/${videoId}/multipart`, { method: "POST", body: payload });
  },
};
