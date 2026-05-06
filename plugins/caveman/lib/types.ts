export type ModeAction = "toggle" | "on" | "off" | "status";

export interface CavemanState {
  enabled: boolean;
}

export interface CavemanStateRef {
  get: () => CavemanState;
  set: (state: CavemanState) => void;
}

export interface CustomEntry {
  type?: string;
  customType?: string;
  data?: Partial<CavemanState>;
}
