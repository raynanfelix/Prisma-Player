"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import posthog from "posthog-js";
import type { CreatedVideo } from "@/features/videos/model/types";
import { videosService } from "@/services/videos/client";

export interface VideoUploadTask {
  videoId: string;
  fileName: string;
  progress: number;
  state: "uploading" | "completed" | "failed";
  error?: string;
}

interface VideoUploadContextValue {
  tasks: VideoUploadTask[];
  startUpload: (file: File, folderId: string | null) => Promise<CreatedVideo>;
}

const VideoUploadContext = createContext<VideoUploadContextValue | null>(null);

function readDuration(file: File) {
  return new Promise<number>((resolve) => {
    const element = document.createElement("video");
    const url = URL.createObjectURL(file);
    const finish = (duration = 0) => {
      URL.revokeObjectURL(url);
      element.removeAttribute("src");
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    element.preload = "metadata";
    element.onloadedmetadata = () => finish(element.duration);
    element.onerror = () => finish();
    element.src = url;
  });
}

export function VideoUploadProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<VideoUploadTask[]>([]);

  const updateTask = useCallback((videoId: string, updates: Partial<VideoUploadTask>) => {
    setTasks((current) => current.map((task) => task.videoId === videoId ? { ...task, ...updates } : task));
  }, []);

  const notifyVideosChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent("prisma:videos-changed"));
  }, []);

  const startUpload = useCallback(async (file: File, folderId: string | null) => {
    const durationPromise = readDuration(file);
    const { video } = await videosService.create({
      title: file.name,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      folderId,
      status: "processing",
    });
    setTasks((current) => [{ videoId: video.id, fileName: file.name, progress: 0, state: "uploading" }, ...current.filter((task) => task.videoId !== video.id)]);
    notifyVideosChanged();

    void (async () => {
      let uploadId = "";
      try {
        const init = await videosService.multipart(video.id, { action: "create" });
        if (!init.uploadId || !init.partSize) throw new Error("Não foi possível iniciar o upload no R2.");
        uploadId = init.uploadId;
        const partCount = Math.ceil(file.size / init.partSize);
        const completed: Array<{ etag: string; partNumber: number }> = [];
        let nextPart = 1;
        let uploadedBytes = 0;

        const worker = async () => {
          while (nextPart <= partCount) {
            const partNumber = nextPart++;
            const start = (partNumber - 1) * init.partSize!;
            const end = Math.min(file.size, start + init.partSize!);
            const signed = await videosService.multipart(video.id, { action: "sign", uploadId, partNumber });
            if (!signed.url) throw new Error("Falha ao autorizar uma parte do upload.");
            const uploadResponse = await fetch(signed.url, { method: "PUT", body: file.slice(start, end) });
            const etag = uploadResponse.headers.get("etag");
            if (!uploadResponse.ok || !etag) throw new Error("O R2 não confirmou uma parte do arquivo. Confira o CORS do bucket.");
            completed.push({ etag, partNumber });
            uploadedBytes += end - start;
            updateTask(video.id, { progress: Math.min(99, Math.round((uploadedBytes / file.size) * 100)) });
          }
        };
        await Promise.all(Array.from({ length: Math.min(3, partCount) }, () => worker()));
        const duration = await durationPromise;
        await videosService.multipart(video.id, {
          action: "complete",
          uploadId,
          parts: completed,
          durationSeconds: duration || null,
        });
        posthog.capture("video_upload_completed", { storage_provider: "r2", file_name: file.name, size_bytes: file.size });
        updateTask(video.id, { progress: 100, state: "completed" });
      } catch (error) {
        if (uploadId) await videosService.multipart(video.id, { action: "abort", uploadId }).catch(() => undefined);
        posthog.capture("video_upload_failed", { storage_provider: "r2", file_name: file.name, size_bytes: file.size, error: error instanceof Error ? error.message : "unknown" });
        updateTask(video.id, { state: "failed", error: error instanceof Error ? error.message : "Falha no envio ao R2." });
      } finally {
        notifyVideosChanged();
      }
    })();
    return video;
  }, [notifyVideosChanged, updateTask]);

  const value = useMemo(() => ({ tasks, startUpload }), [startUpload, tasks]);
  return <VideoUploadContext.Provider value={value}>{children}</VideoUploadContext.Provider>;
}

export function useVideoUploads() {
  const context = useContext(VideoUploadContext);
  if (!context) throw new Error("useVideoUploads must be used inside VideoUploadProvider");
  return context;
}
