export type BrowserImageAsset = {
  uri: string;
  name: string;
  file?: File;
};

export type VideoAsset = {
  uri: string;
  name: string;
  size?: number;
  type?: string;
  file?: File;
};

export type BrowserFileAsset = {
  uri: string;
  name: string;
  size?: number;
  type?: string;
  file?: File;
};

/**
 * Native implementation. The web implementation lives in
 * browser-runtime.web.ts, so browser globals never enter the Android bundle.
 */
export function registerServiceWorker(): void {}

export function pickMultipleImages(
  _onPicked: (assets: BrowserImageAsset[]) => void,
): boolean {
  return false;
}

export function pickMultipleVideos(
  _onPicked: (assets: VideoAsset[]) => void,
): boolean {
  return false;
}

export function pickMultipleFiles(
  _accept: string,
  _onPicked: (assets: BrowserFileAsset[]) => void,
): boolean {
  return false;
}

export function uploadVideoAsset(
  _asset: VideoAsset,
  _endpoint: string,
  _signal: AbortSignal,
  _onProgress: (percent: number) => void,
): Promise<string | undefined> {
  return Promise.reject(new Error('Video uploads are only available in the web preview.'));
}

export function notifyPublished(
  _title: string,
  _type: string,
  _year: string,
): void {}

export async function requestBrowserNotifications(): Promise<void> {}

export async function clearBrowserCachesAndReload(): Promise<void> {}