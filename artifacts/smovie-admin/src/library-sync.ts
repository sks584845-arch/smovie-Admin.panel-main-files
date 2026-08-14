import { auth } from './firebase';

export type LibraryItem = Record<string, any> & {
  id: string;
  videoUrls: string[];
};

export type LibraryState = {
  items: LibraryItem[];
  categories: string[];
  metadata: Record<string, unknown>;
  updatedAt?: string;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || '';
const CLIENT_API_KEY = process.env.EXPO_PUBLIC_CLIENT_API_KEY || '';

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function toVideoUrls(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

export function normalizeLibraryItem(input: Record<string, any>): LibraryItem {
  const item: LibraryItem = {
    ...input,
    id: String(input.id ?? Date.now()),
    videoUrls: toVideoUrls(input.videoUrls ?? input.videoUrl),
  };

  if (Array.isArray(input.seasons)) {
    item.seasons = input.seasons.map((season: any) => ({
      ...season,
      episodes: Array.isArray(season.episodes)
        ? season.episodes.map((episode: any) => ({
            ...episode,
            videoUrls: toVideoUrls(episode.videoUrls ?? episode.videoUrl),
          }))
        : [],
    }));
  }

  return item;
}

export function normalizeLibraryItems(items: unknown): LibraryItem[] {
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, any> => Boolean(item) && typeof item === 'object').map(normalizeLibraryItem)
    : [];
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth?.currentUser?.getIdToken();
  return {
    Authorization: token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json',
  };
}

export async function restoreAdminLibrary(): Promise<LibraryState> {
  const response = await fetch(apiUrl('/api/admin/library'), { headers: await authHeaders() });
  if (!response.ok) throw new Error(`Library restore failed (HTTP ${response.status})`);
  const state = await response.json() as LibraryState;
  return {
    ...state,
    items: normalizeLibraryItems(state.items),
    categories: Array.isArray(state.categories) ? state.categories : [],
    metadata: state.metadata && typeof state.metadata === 'object' ? state.metadata : {},
  };
}

export async function syncAdminLibrary(items: LibraryItem[], categories: string[], metadata: Record<string, unknown> = {}): Promise<LibraryState> {
  const response = await fetch(apiUrl('/api/admin/library'), {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify({ items, categories, metadata }),
  });
  if (!response.ok) throw new Error(`Library sync failed (HTTP ${response.status})`);
  const state = await response.json() as LibraryState;
  return { ...state, items: normalizeLibraryItems(state.items) };
}

export async function fetchClientLibrary(): Promise<LibraryState> {
  if (!CLIENT_API_KEY) throw new Error('EXPO_PUBLIC_CLIENT_API_KEY is not configured');
  const response = await fetch(apiUrl('/api/client/library'), {
    headers: { 'x-api-key': CLIENT_API_KEY, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Client library request failed (HTTP ${response.status})`);
  const state = await response.json() as LibraryState;
  return { ...state, items: normalizeLibraryItems(state.items) };
}

export function getVideoSources(item: Record<string, any>): string[] {
  return toVideoUrls(item.videoUrls ?? item.videoUrl);
}