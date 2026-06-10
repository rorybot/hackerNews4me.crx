export interface KeyboardHandlers {
  onNext?: () => void;
  onPrev?: () => void;
  onOpen?: () => void;
  onComments?: () => void;
  onUpvote?: () => void;
  onHide?: () => void;
  onUndoHide?: () => void;
  onRefresh?: () => void;
  onCollapse?: () => void;
  onExpand?: () => void;
  onHelp?: () => void;
  onGo?: (path: string) => void;
}

export function bindKeyboard(handlers: KeyboardHandlers): () => void {
  let chord: string | null = null;
  let chordTimer: ReturnType<typeof setTimeout> | null = null;

  function clearChord() {
    chord = null;
    if (chordTimer) clearTimeout(chordTimer);
    chordTimer = null;
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable)
    ) {
      return;
    }

    if (t && t.tagName === "BUTTON" && e.key === "Enter") return;

    const key = e.key;

    if (chord === "g") {
      clearChord();
      if (key === "h") {
        e.preventDefault();
        handlers.onGo?.("/");
        return;
      }
      if (key === "n") {
        e.preventDefault();
        handlers.onGo?.("/newest");
        return;
      }
      if (key === "a") {
        e.preventDefault();
        handlers.onGo?.("/ask");
        return;
      }
      if (key === "s") {
        e.preventDefault();
        handlers.onGo?.("/show");
        return;
      }
      if (key === "j") {
        e.preventDefault();
        handlers.onGo?.("/jobs");
        return;
      }
    }

    if (key === "g" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      chord = "g";
      chordTimer = setTimeout(clearChord, 800);
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    switch (key) {
      case "j":
        e.preventDefault();
        handlers.onNext?.();
        break;
      case "k":
        e.preventDefault();
        handlers.onPrev?.();
        break;
      case "Enter":
        e.preventDefault();
        handlers.onComments?.();
        break;
      case "l":
      case "o":
        e.preventDefault();
        handlers.onOpen?.();
        break;
      case "a":
        e.preventDefault();
        handlers.onUpvote?.();
        break;
      case "x":
        e.preventDefault();
        handlers.onHide?.();
        break;
      case "u":
        e.preventDefault();
        handlers.onUndoHide?.();
        break;
      case "r":
        e.preventDefault();
        handlers.onRefresh?.();
        break;
      case "h":
        e.preventDefault();
        handlers.onCollapse?.();
        break;
      case "?":
        e.preventDefault();
        handlers.onHelp?.();
        break;
      default:
        break;
    }
  }

  document.addEventListener("keydown", onKey, true);
  return () => document.removeEventListener("keydown", onKey, true);
}
