export type ListKey = "top" | "new" | "best" | "ask" | "show" | "job";

export type Route =
  | { kind: "list"; list: ListKey; note?: string }
  | { kind: "thread"; id: number };

export type HnItemType =
  | "story"
  | "comment"
  | "job"
  | "poll"
  | "pollopt"
  | string;

/** Firebase HN item (subset we use). */
export interface HnItem {
  id: number;
  type?: HnItemType;
  by?: string;
  time?: number;
  text?: string;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  kids?: number[];
  parent?: number;
  deleted?: boolean;
  dead?: boolean;
  /** Client-only flags */
  _upvoted?: boolean;
  _pendingHide?: boolean;
  _collapsed?: boolean;
  children?: HnItem[];
}

export interface ColumnWidths {
  vote: number;
  rank: number;
  title: number;
  points: number;
  comments: number;
  age: number;
  by: number;
}

export interface Settings {
  columnWidths: ColumnWidths;
  pageSize: number;
  hiddenIds: number[];
  sortByPoints: boolean;
  sortWindowHours: number;
}

export interface LoginState {
  loggedIn: boolean;
  user: string | null;
}

export interface ActionResult {
  ok: boolean;
  reason?: string;
}

export type BgMessage =
  | { type: "openBackgroundTab"; url: string }
  | { type: string; url?: string };
