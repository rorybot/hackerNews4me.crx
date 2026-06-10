// @ts-nocheck
import {
  getNextEnglandFixture,
  formatFixtureBillboard,
} from "../fixtures/england";

/**
 * Pitchside banner + wide LED scoreboard for next England match.
 * @returns {HTMLElement}
 */
export function createBanner() {
  const bannerUrl = chrome.runtime.getURL("assets/hn-eng-banner.svg");
  const wrap = document.createElement("div");
  wrap.className = "shn-banner";
  wrap.setAttribute("role", "img");

  const fixture = getNextEnglandFixture();
  const bb = fixture
    ? formatFixtureBillboard(fixture)
    : {
        label: "THREE LIONS",
        homeCode: "ENG",
        awayCode: "???",
        homeName: "ENGLAND",
        awayName: "TBD",
        match: "ENG v ???",
        date: "TBD",
        time: "—",
        stage: "WC",
        stageFull: "WORLD CUP",
        venue: "2026",
        fullTitle: "England · FIFA World Cup 2026",
      };

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

  return wrap;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
