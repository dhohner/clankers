import { readPersistedStyleName, writePersistedStyleName, type PersistedStyleRead } from "./settings.ts";

/** Reads report failure as a value; writes reject so an active session can report an unsaved selection. */
export interface StylePersistence {
  read(path: string): Promise<PersistedStyleRead>;
  write(path: string, name: string): Promise<void>;
}

export const stylePersistence: StylePersistence = {
  read: readPersistedStyleName,
  write: writePersistedStyleName,
};
