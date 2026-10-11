export interface VideoSource {
  src: string;
  type?: string;
}

export interface VideoTextTrack {
  src: string;
  kind: "subtitles" | "captions" | "chapters" | "metadata";
  label: string;
  srclang: string;
  default?: boolean;
}

export interface VideoPlayerProps {
  sources: VideoSource[];
  poster?: string;
  autoplay?: boolean;
  muted?: boolean;
  controls?: boolean;
  loop?: boolean;
  playbackRate?: number;
  playbackRates?: number[];
  bigPlayButton?: boolean;
  pauseWhenHidden?: boolean;
  protectContent?: boolean;
  textTracks?: VideoTextTrack[];
  onTimeUpdate?: (currentTime: number) => void;
  onLoadedMetadata?: (metadata: { duration: number; width: number; height: number }) => void;
  onEnded?: () => void;
  onPause?: () => void;
  onPlay?: () => void;
  startTime?: number;
  restartWithSoundSignal?: number;
  resumePlaybackSignal?: number;
  controlVisibility?: Partial<Record<"progressControl" | "currentTimeDisplay" | "durationDisplay" | "volumePanel" | "fullscreenToggle" | "playbackRateMenuButton" | "pictureInPictureToggle" | "seekBackward" | "seekForward", boolean>>;
  className?: string;
}
