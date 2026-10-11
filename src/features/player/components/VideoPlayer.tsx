"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPlayer } from "@videojs/react";
import { Video, VideoSkin, videoFeatures } from "@videojs/react/video";
import "@videojs/react/video/skin.css";
import "./video-player.css";
import type { VideoPlayerProps } from "./types";

const Player = createPlayer({ features: videoFeatures, displayName: "PrismaPlayer" });

export default function VideoPlayer({
  sources,
  poster,
  autoplay = false,
  muted = false,
  controls = true,
  loop = false,
  playbackRate = 1,
  bigPlayButton = true,
  pauseWhenHidden = false,
  protectContent,
  onTimeUpdate,
  onLoadedMetadata,
  onEnded,
  onPause,
  onPlay,
  startTime = 0,
  restartWithSoundSignal = 0,
  resumePlaybackSignal = 0,
  controlVisibility,
  textTracks = [],
  className = "",
}: VideoPlayerProps) {
  const mediaRef = useRef<HTMLVideoElement>(null);
  const source = sources[0];
  const contentProtection = protectContent ?? (className.includes("prisma-player--embed") && !className.includes("prisma-player--unprotected"));
  const visibilityClasses = useMemo(() => [
    !controls && "prisma-player--controls-hidden",
    !bigPlayButton && "prisma-player--big-play-hidden",
    controlVisibility?.progressControl === false && "prisma-player--progress-hidden",
    controlVisibility?.currentTimeDisplay === false && "prisma-player--time-hidden",
    controlVisibility?.volumePanel === false && "prisma-player--volume-hidden",
    controlVisibility?.fullscreenToggle === false && "prisma-player--fullscreen-hidden",
    controlVisibility?.pictureInPictureToggle === false && "prisma-player--pip-hidden",
    controlVisibility?.playbackRateMenuButton === false && "prisma-player--settings-hidden",
    controlVisibility?.seekBackward === false && "prisma-player--seek-back-hidden",
    controlVisibility?.seekForward === false && "prisma-player--seek-forward-hidden",
  ].filter(Boolean).join(" "), [bigPlayButton, controlVisibility, controls]);

  useEffect(() => {
    if (mediaRef.current) mediaRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !autoplay) return;
    media.muted = muted;
    void media.play().catch(() => undefined);
  }, [autoplay, muted]);

  useEffect(() => {
    const media = mediaRef.current;
    if (media && Number.isFinite(startTime) && Math.abs(media.currentTime - startTime) > 1) media.currentTime = startTime;
  }, [startTime]);

  useEffect(() => {
    if (restartWithSoundSignal <= 0) return;
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = 0;
    media.muted = false;
    void media.play().catch(() => undefined);
  }, [restartWithSoundSignal]);

  useEffect(() => {
    if (resumePlaybackSignal <= 0) return;
    void mediaRef.current?.play().catch(() => undefined);
  }, [resumePlaybackSignal]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !pauseWhenHidden) return;
    const handleVisibility = () => {
      if (document.hidden && !media.paused) media.pause();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [pauseWhenHidden]);

  if (!source) return null;

  return (
    <div className={`prisma-video-player ${visibilityClasses} ${className}`} style={{ "--media-color-primary": "var(--player-accent, #0066cc)" } as React.CSSProperties}>
      <Player.Provider>
        <VideoSkin poster={poster}>
          <Video
            ref={mediaRef}
            src={source.src}
            autoPlay={autoplay}
            muted={muted}
            loop={loop}
            playsInline
            controlsList={contentProtection ? "nodownload noremoteplayback" : undefined}
            disablePictureInPicture={controlVisibility?.pictureInPictureToggle === false}
            onContextMenu={(event) => { if (contentProtection) event.preventDefault(); }}
            draggable={!contentProtection}
            preload="metadata"
            crossOrigin="anonymous"
            onLoadedMetadata={(event) => {
              const media = event.currentTarget;
              media.playbackRate = playbackRate;
              if (startTime > 0 && startTime < media.duration) media.currentTime = startTime;
              onLoadedMetadata?.({ duration: media.duration, width: media.videoWidth, height: media.videoHeight });
            }}
            onTimeUpdate={(event) => onTimeUpdate?.(event.currentTarget.currentTime)}
            onEnded={onEnded}
            onPause={onPause}
            onPlay={onPlay}
          >
            {textTracks.map((track) => (
              <track key={`${track.src}-${track.srclang}`} src={track.src} kind={track.kind} label={track.label} srcLang={track.srclang} default={track.default} />
            ))}
          </Video>
        </VideoSkin>
      </Player.Provider>
    </div>
  );
}
