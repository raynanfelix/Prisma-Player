export type VideoStatus = "draft" | "processing" | "ready" | "failed";
// Cloudflare R2 é o único storage desde a migração (CHECK em videos.storage_provider).
export type StorageProvider = "r2";

export interface StoredVideo {
  id: string;
  title: string;
  folder_id: string | null;
  mime_type: string;
  status: VideoStatus;
  signed_url: string | null;
  created_at: string;
  plays: number;
  player_id: string | null;
  published: boolean;
}

export interface CreatedVideo {
  id: string;
  title: string;
  folder_id: string | null;
  mime_type: string;
  object_path: string;
  status: "processing";
  created_at: string;
  storage_provider: StorageProvider;
}

export interface VideoFolder {
  id: string;
  name: string;
}

export interface PlayerConfigReference {
  id: string;
}
