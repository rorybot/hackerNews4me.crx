/**
 * RES-inspired keyboard navigation.
 *
 * List:
 *   j / k     next / prev row
 *   Enter     open comments (in-app)
 *   l / o     open story URL (background tab)
 *   a         upvote
 *   x         hide (undoable for a few seconds)
 *   u         undo last/selected pending hide
 *   r         refresh
 *   g then h  go home (top)
 *   g then n  newest
 *   ?         toggle help
 *
 * Thread:
 *   j / k     next / prev comment
 *   h         collapse
 *   l / o     open story link (background tab)
 *   Enter     (list: comments — thread: stay / focus)
 *   a         upvote focused comment/story
 */

/**
 * @param {object} handlers
 * @param {() => void} [handlers.onNext]
 * @param {() => void} [handlers.onPrev]
 * @param {() => void} [handlers.onOpen]       // story link → background tab
 * @param {() => void} [handlers.onComments]  // open comments
 * @param {() => void} [handlers.onUpvote]
 * @param {() => void} [handlers.onHide]
 * @param {() => void} [handlers.onUndoHide]
 * @param {() => void} [handlers.onRefresh]
 * @param {() => void} [handlers.onCollapse]
 * @param {() => void} [handlers.onExpand]
 * @param {() => void} [handlers.onHelp]
 * @param {(path: string) => void} [handlers.onGo]
 */
export function bindKeyboard(handlers) {
  let chord = null;
  let chordTimer = null;

  function clearChord() {
    chord = null;
    if (chordTimer) clearTimeout(chordTimer);
    chordTimer = null;
  }

  /**
   * @param {KeyboardEvent} e
   */
  function onKey(e) {
    const t = e.target;
    if (
      t &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable)
    ) {
      return;
    }

    // Don't steal keys while focusing buttons/links we want to activate with Enter
    if (t && t.tagName === "BUTTON" && e.key === "Enter") {
      return;
    }

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
        // Enter → comments
        e.preventDefault();
        handlers.onComments?.();
        break;
      case "l":
      case "o":
        // l / o → story link in background tab
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
