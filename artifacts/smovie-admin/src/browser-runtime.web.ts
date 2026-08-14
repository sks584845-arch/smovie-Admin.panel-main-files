import type { BrowserFileAsset, BrowserImageAsset, VideoAsset } from './browser-runtime';

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('/sw.js').catch(() => {
    // PWA enhancement only; never block the app.
  });
}

export function pickMultipleImages(
  onPicked: (assets: BrowserImageAsset[]) => void,
): boolean {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = (event: Event) => {
    const files = (event.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    onPicked(
      Array.from(files).map((file) => ({
        uri: URL.createObjectURL(file),
        name: file.name,
        file,
      })),
    );
  };
  input.click();
  return true;
}

export function pickMultipleVideos(onPicked: (assets: VideoAsset[]) => void): boolean {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'video/*';
  input.onchange = (event: Event) => {
    const files = (event.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    onPicked(
      Array.from(files).map((file) => ({
        uri: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
        type: file.type || 'video/*',
        file,
      })),
    );
  };
  input.click();
  return true;
}

export function pickMultipleFiles(
  accept: string,
  onPicked: (assets: BrowserFileAsset[]) => void,
): boolean {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = true;
  input.onchange = (event: Event) => {
    const files = (event.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    onPicked(Array.from(files).map((file) => ({
      uri: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
      type: file.type,
      file,
    })));
  };
  input.click();
  return true;
}

export function uploadVideoAsset(
  asset: VideoAsset,
  endpoint: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<string | undefined> {
  const file = asset.file;
  if (!file) {
    return Promise.reject(new Error('The selected video is not available as a browser File.'));
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      callback();
    };
    const abort = () => xhr.abort();

    xhr.open('POST', endpoint);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(() => reject(new Error(`Upload failed (${xhr.status})`)));
        return;
      }
      const body =
        xhr.response && typeof xhr.response === 'object'
          ? xhr.response
          : (() => {
              try {
                return JSON.parse(xhr.responseText || '{}');
              } catch {
                return {};
              }
            })();
      finish(() => resolve(typeof body?.url === 'string' ? body.url : undefined));
    };
    xhr.onerror = () => finish(() => reject(new Error('Network error while uploading video.')));
    xhr.onabort = () => finish(() => reject(new DOMException('Upload cancelled.', 'AbortError')));
    signal.addEventListener('abort', abort, { once: true });

    const form = new FormData();
    form.append('file', file, asset.name);
    xhr.send(form);
  });
}

export function notifyPublished(
  title: string,
  type: string,
  year: string,
): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  new Notification(`✓ Published: ${title}`, {
    body: `${type} · ${year || '—'} added to your library.`,
    icon: '/assets/images/icon.png',
    tag: 'smovie-publish',
  });
}

export async function requestBrowserNotifications(): Promise<void> {
  if (!('Notification' in window)) return;
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    new Notification('sMovie Admin Notifications Enabled', {
      body: 'You will receive alerts for new OTT releases.',
      icon: '/assets/images/icon.png',
      tag: 'smovie-welcome',
    });
  }
}

export async function clearBrowserCachesAndReload(): Promise<void> {
  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  }
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
  }
  await new Promise((resolve) => setTimeout(resolve, 2200));
  window.location.reload();
}