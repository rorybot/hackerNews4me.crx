// @ts-nocheck
import { getEnglandDisplayState } from "../fixtures/england";

/**
 * Pitchside banner + wide LED scoreboard.
 * Shows the next England game when available, or a commiseration message
 * once England have been knocked out (no upcoming fixtures).
 * @returns {HTMLElement}
 */
export function createBanner() {
  const bannerUrl = chrome.runtime.getURL("assets/hn-eng-banner.svg");
  const wrap = document.createElement("div");
  wrap.className = "shn-banner";
  wrap.setAttribute("role", "img");

  const state = getEnglandDisplayState();

  if (state.kind === "fixture") {
    const bb = state.bb;
    wrap.setAttribute(
      "aria-label",
      `Hacker News stadium banner. ${bb.fullTitle || bb.match}`
    );

    wrap.innerHTML = `
      <div class="shn-banner-scene">
        <img
          class="shn-banner-img"
          src="${bannerUrl}"
          alt=""
          width="960"
          height="144"
          draggable="false"
        />
        <div class="shn-billboard" aria-live="polite">
          <div class="shn-billboard-screen">
            <div class="shn-bb-header">
              <span class="shn-bb-hn">HACKER&nbsp;NEWS</span>
              <span class="shn-bb-pulse" aria-hidden="true"></span>
              <span class="shn-bb-label">${escapeHtml(bb.label)}</span>
              <span class="shn-bb-comp">FIFA&nbsp;WC&nbsp;26</span>
            </div>

            <div class="shn-bb-fixture">
              <div class="shn-bb-team shn-bb-home">
                <span class="shn-bb-code">${escapeHtml(bb.homeCode)}</span>
                <span class="shn-bb-name">${escapeHtml(bb.homeName)}</span>
              </div>
              <div class="shn-bb-vs-block">
                <span class="shn-bb-vs">VS</span>
              </div>
              <div class="shn-bb-team shn-bb-away">
                <span class="shn-bb-code">${escapeHtml(bb.awayCode)}</span>
                <span class="shn-bb-name">${escapeHtml(bb.awayName)}</span>
              </div>
            </div>

            <div class="shn-bb-footer">
              <span class="shn-bb-when">
                <span class="shn-bb-date">${escapeHtml(bb.date)}</span>
                <span class="shn-bb-clock">${escapeHtml(bb.time)}</span>
              </span>
              <span class="shn-bb-where">
                <span class="shn-bb-stage">${escapeHtml(bb.stage)}</span>
                <span class="shn-bb-venue">${escapeHtml(bb.venue)}</span>
              </span>
            </div>

            <div class="shn-bb-ticker" aria-hidden="true">
              <span class="shn-bb-ticker-text">■ KICK-OFF ■ ${escapeHtml(
                bb.date
              )} ■ ${escapeHtml(bb.time)} ■ ${escapeHtml(
      bb.stageFull || bb.stage
    )} ■ ${escapeHtml(bb.venue)} ■ IT'S COMING HOME ■</span>
            </div>

            <div class="shn-bb-scan" aria-hidden="true"></div>
            <div class="shn-bb-grid" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    `;
  } else {
    // Eliminated / commiseration state
    const { title, main, sub, footer } = state;
    wrap.setAttribute(
      "aria-label",
      `Hacker News stadium banner. England ${main.toLowerCase()} — ${sub}`
    );

    wrap.innerHTML = `
      <div class="shn-banner-scene">
        <img
          class="shn-banner-img"
          src="${bannerUrl}"
          alt=""
          width="960"
          height="144"
          draggable="false"
        />
        <div class="shn-billboard" aria-live="polite">
          <div class="shn-billboard-screen shn-bb-eliminated">
            <div class="shn-bb-header">
              <span class="shn-bb-hn">HACKER&nbsp;NEWS</span>
              <span class="shn-bb-pulse" aria-hidden="true"></span>
              <span class="shn-bb-label">${escapeHtml(title)}</span>
              <span class="shn-bb-comp">FIFA&nbsp;WC&nbsp;26</span>
            </div>

            <div class="shn-bb-out">
              <div class="shn-bb-out-main">${escapeHtml(main)}</div>
              <div class="shn-bb-out-sub">${escapeHtml(sub)}</div>
            </div>

            <div class="shn-bb-footer">
              <span class="shn-bb-when">
                <span class="shn-bb-date">TOURNAMENT</span>
                <span class="shn-bb-clock">OVER</span>
              </span>
              <span class="shn-bb-where">
                <span class="shn-bb-stage">OUT</span>
                <span class="shn-bb-venue">${escapeHtml(footer)}</span>
              </span>
            </div>

            <div class="shn-bb-ticker" aria-hidden="true">
              <span class="shn-bb-ticker-text">■ ENGLAND OUT ■ PROUD OF THE LADS ■ THANKS FOR EVERYTHING ■ IT'S COMING HOME ONE DAY ■</span>
            </div>

            <div class="shn-bb-scan" aria-hidden="true"></div>
            <div class="shn-bb-grid" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    `;
  }

  return wrap;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
