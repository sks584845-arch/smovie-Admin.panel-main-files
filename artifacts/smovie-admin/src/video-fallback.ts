export type VideoFallbackOptions = {
  timeoutMs?: number;
  onSourceChange?: (url: string, index: number) => void;
  onExhausted?: (error: Error) => void;
};

/**
 * Shared failover controller for the user app's video player.
 *
 * The player adapter calls `start`, `reportProgress`, and `reportFailure`
 * from its native/web media callbacks. A stalled source is treated as failed
 * after the configured timeout, then the next server URL is selected.
 */
export class VideoFallbackController {
  private readonly urls: string[];
  private readonly timeoutMs: number;
  private readonly onSourceChange?: VideoFallbackOptions['onSourceChange'];
  private readonly onExhausted?: VideoFallbackOptions['onExhausted'];
  private currentIndex = 0;
  private stallTimer: ReturnType<typeof setTimeout> | undefined;
  private hasProgress = false;

  constructor(urls: string[], options: VideoFallbackOptions = {}) {
    this.urls = [...new Set(urls.filter(url => typeof url === 'string' && url.trim()))];
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.onSourceChange = options.onSourceChange;
    this.onExhausted = options.onExhausted;
  }

  get currentUrl(): string | undefined {
    return this.urls[this.currentIndex];
  }

  get sourceIndex(): number {
    return this.currentIndex;
  }

  start(): string | undefined {
    const url = this.currentUrl;
    if (!url) {
      this.onExhausted?.(new Error('No playable video sources were provided.'));
      return undefined;
    }
    this.armStallTimeout();
    this.onSourceChange?.(url, this.currentIndex);
    return url;
  }

  reportProgress(): void {
    this.hasProgress = true;
    this.clearStallTimer();
  }

  reportFailure(reason = 'Video source failed'): string | undefined {
    this.clearStallTimer();
    if (this.currentIndex >= this.urls.length - 1) {
      const error = new Error(`${reason}; all video servers were exhausted.`);
      this.onExhausted?.(error);
      return undefined;
    }

    this.currentIndex += 1;
    this.hasProgress = false;
    return this.start();
  }

  reset(): void {
    this.clearStallTimer();
    this.currentIndex = 0;
    this.hasProgress = false;
  }

  private armStallTimeout(): void {
    this.clearStallTimer();
    this.stallTimer = setTimeout(() => {
      if (!this.hasProgress) this.reportFailure('Video source timed out or buffered too slowly');
    }, this.timeoutMs);
  }

  private clearStallTimer(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = undefined;
  }
}

export function getVideoUrls(item: { videoUrls?: unknown; videoUrl?: unknown }): string[] {
  if (Array.isArray(item.videoUrls)) {
    return item.videoUrls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
  }
  return typeof item.videoUrl === 'string' && item.videoUrl.trim() ? [item.videoUrl.trim()] : [];
}