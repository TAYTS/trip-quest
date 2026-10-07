// Storage abstraction. The game only talks to a Repo, so switching between
// "local mode" (this browser) and "cloud mode" (Supabase) changes nothing else.
import type { Entry, EntryMap } from '../data/game';

export interface Repo {
  kind: 'local' | 'cloud';
  label: string;
  loadEntries(): Promise<EntryMap>;
  saveEntry(entry: Entry): Promise<void>;
  deleteEntry(checkpointId: string): Promise<void>;
  /** Stores a (downscaled) photo and returns the reference to keep in Entry.photos. */
  savePhoto(checkpointId: string, file: File): Promise<string>;
  /** Turns an Entry.photos reference into something an <img> can show. */
  photoUrl(ref: string): Promise<string>;
  /** Live updates from other devices. Returns an unsubscribe function. */
  subscribe(onChange: (entry: Entry | { deleted: string }) => void): () => void;
}
