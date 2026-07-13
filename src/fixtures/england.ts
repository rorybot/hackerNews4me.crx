// @ts-nocheck
/**
 * England fixtures for the stadium billboard.
 * Kickoffs as ISO UTC. Update / prune this list as the tournament progresses.
 *
 * Add future games in order. Once a game has passed + a grace period,
 * getNextEnglandFixture() will skip it. When the list has no future games,
 * the banner switches to a commiseration state.
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
  // Add the next game here when known (e.g. semi-final), then final, etc.
  // Example (uncomment / replace with real schedule):
  // {
  //   home: "TBD",
  //   away: "England",
  //   homeCode: "TBD",
  //   awayCode: "ENG",
  //   kickoffUtc: "2026-07-15T19:00:00.000Z",
  //   stage: "Semi-final",
  //   venue: "TBD",
  // },
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

/** Possible commiseration messages (one is chosen when England are out). */
const COMMISERATION_MESSAGES = [
  {
    title: "THREE LIONS",
    main: "OUT",
    sub: "PROUD OF THE BOYS",
    footer: "THANKS FOR THE RUN • 2026",
  },
  {
    title: "ENGLAND",
    main: "ELIMINATED",
    sub: "IT'S BEEN A HELL OF A TOURNAMENT",
    footer: "WE'LL BE BACK • 2030",
  },
  {
    title: "THREE LIONS",
    main: "OUT",
    sub: "THEY GAVE IT EVERYTHING",
    footer: "RESPECT • SEE YOU NEXT TIME",
  },
];

/**
 * @param {Date} [now]
 * @returns {{ kind: 'fixture', bb: ReturnType<typeof formatFixtureBillboard> } |
 *           { kind: 'eliminated', title: string, main: string, sub: string, footer: string }}
 */
export function getEnglandDisplayState(now = new Date()) {
  const fixture = getNextEnglandFixture(now);
  if (fixture) {
    return { kind: "fixture", bb: formatFixtureBillboard(fixture) };
  }

  // Knocked out / no more upcoming fixtures — pick a commiseration message.
  // Deterministic per day so it doesn't jump around on every reload.
  const day = now.getUTCDate();
  const idx = day % COMMISERATION_MESSAGES.length;
  const msg = COMMISERATION_MESSAGES[idx];

  return {
    kind: "eliminated",
    title: msg.title,
    main: msg.main,
    sub: msg.sub,
    footer: msg.footer,
  };
}
