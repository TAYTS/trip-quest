import type { Entry, EntryMap } from '../data/game';
import type { Repo } from './repo';
import { safeStorage } from './safeStorage';
import { blobToDataURL, downscaleImage } from './image';

const KEY = 'trip-quest:entries:v1';

export function createLocalRepo(): Repo {
  const read = () => safeStorage.getJSON<EntryMap>(KEY, {});
  const write = (m: EntryMap) => {
    if (!safeStorage.setJSON(KEY, m)) {
      console.warn('Browser storage unavailable or full — journal kept in memory for this session.');
    }
  };
  return {
    kind: 'local',
    label: 'This device only',
    async loadEntries() {
      return read();
    },
    async saveEntry(entry: Entry) {
      write({ ...read(), [entry.checkpointId]: entry });
    },
    async deleteEntry(id: string) {
      const m = read();
      delete m[id];
      write(m);
    },
    async savePhoto(_id: string, file: File) {
      // Small (640px) JPEG stored inline, so ~30 photos still fit in browser storage.
      return blobToDataURL(await downscaleImage(file, 640, 0.7));
    },
    async photoUrl(ref: string) {
      return ref;
    },
    subscribe() {
      return () => {};
    },
  };
}

export function readLocalEntries(): EntryMap {
  return safeStorage.getJSON<EntryMap>(KEY, {});
}
export function replaceLocalEntries(m: EntryMap) {
  safeStorage.setJSON(KEY, m);
}
