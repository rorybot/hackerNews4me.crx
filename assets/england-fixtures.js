/**
 * England fixtures for the stadium billboard.
 * Kickoffs as ISO UTC. Update as the tournament progresses.
 *
 * QF Norway v England — Miami, 11 Jul 2026 17:00 EDT = 22:00 BST
 */

/** @typedef {{
 *   home: string,
 *   away: string,
 *   homeCode: string,
 *   awayCode: string,
 *   kickoffUtc: string,
 *   stage: string,
 *   venue: string,
 * }} Fixture */

/** @type {Fixture[]} */
export const ENGLAND_FIXTURES = [
  {
    home: "Norway",
    away: "England",
    homeCode: "NOR",
    awayCode: "ENG",
    kickoffUtc: "2026-07-11T21:00:00.000Z",
    stage: "Quarter-final",
    venue: "Miami",
  },
];

/**
 * @param {Date} [now]
 * @returns {Fixture | null}
 */
export function getNextEnglandFixture(now = new Date()) {
  const graceMs = 3 * 60 * 60 * 1000;
  const upcoming = ENGLAND_FIXTURES.filter((f) => {
    const t = Date.parse(f.kickoffUtc);
    return Number.isFinite(t) && t + graceMs > now.getTime();
  });
  upcoming.sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc));
  return upcoming[0] || null;
}

/**
 * @param {Fixture} f
 */
export function formatFixtureBillboard(f) {
  const d = new Date(f.kickoffUtc);
  const tz = "Europe/London";
  const weekday = d
    .toLocaleDateString("en-GB", { weekday: "short", timeZone: tz })
    .toUpperCase();
  const dayMonth = d
    .toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: tz,
    })
    .toUpperCase();
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    timeZoneName: "short",
  }).formatToParts(d);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "UK";

  // Short stage for LED
  let stageShort = f.stage.toUpperCase();
  if (/quarter/i.test(f.stage)) stageShort = "QF";
  else if (/semi/i.test(f.stage)) stageShort = "SF";
  else if (/final/i.test(f.stage) && !/semi|quarter/i.test(f.stage))
    stageShort = "FINAL";

  return {
    label: "NEXT UP",
    homeCode: f.homeCode,
    awayCode: f.awayCode,
    homeName: f.home.toUpperCase(),
    awayName: f.away.toUpperCase(),
    match: `${f.homeCode} v ${f.awayCode}`,
    date: `${weekday} ${dayMonth}`,
    time: `${time} ${tzName}`,
    stage: stageShort,
    stageFull: f.stage.toUpperCase(),
    venue: f.venue.toUpperCase(),
    fullTitle: `${f.home} v ${f.away} · ${f.stage} · ${f.venue}`,
  };
}
