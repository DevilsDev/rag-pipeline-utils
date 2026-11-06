#!/usr/bin/env node
"use strict";

/**
 * The monthly growth review's numbers, measured the way the roadmap's
 * Growth goal section asks: the month's npm downloads next to the last
 * full week with no release (release days are inflated by mirrors and
 * scanners), plus GitHub stars and forks.
 *
 *   node scripts/promote/growth.js            # print the numbers as JSON
 *   node scripts/promote/growth.js --markdown # the note for the growth log
 */

const PKG = "@devilsdev/rag-pipeline-utils";
const REPO = "DevilsDev/rag-pipeline-utils";

async function json(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": "rag-pipeline-utils-growth" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** The latest Monday-to-Sunday week in `days` with no release day in it. */
function quietWeek(days, releaseDays) {
  const byDay = new Map(days.map((d) => [d.day, d.downloads]));
  const sorted = days.map((d) => d.day).sort();
  for (let i = sorted.length - 1; i >= 6; i--) {
    const end = new Date(`${sorted[i]}T00:00:00Z`);
    if (end.getUTCDay() !== 0) continue; // weeks end on Sunday
    const week = [];
    for (let k = 6; k >= 0; k--) {
      const d = new Date(end);
      d.setUTCDate(d.getUTCDate() - k);
      week.push(d.toISOString().slice(0, 10));
    }
    if (week.some((d) => releaseDays.has(d) || !byDay.has(d))) continue;
    return {
      from: week[0],
      to: week[6],
      downloads: week.reduce((s, d) => s + byDay.get(d), 0),
    };
  }
  return null;
}

async function measure({ fetchImpl = fetch } = {}) {
  const [range, registry, repo] = await Promise.all([
    json(`https://api.npmjs.org/downloads/range/last-month/${PKG}`, fetchImpl),
    json(`https://registry.npmjs.org/${PKG}`, fetchImpl),
    json(`https://api.github.com/repos/${REPO}`, fetchImpl),
  ]);
  const releaseDays = new Set(
    Object.entries(registry.time || {})
      .filter(([k]) => /^\d+\.\d+\.\d+$/.test(k))
      .map(([, t]) => t.slice(0, 10)),
  );
  const days = range.downloads || [];
  const inMonth = days.filter((d) => releaseDays.has(d.day));
  return {
    package: PKG,
    period: { from: range.start, to: range.end },
    monthDownloads: days.reduce((s, d) => s + d.downloads, 0),
    releaseDayDownloads: inMonth.reduce((s, d) => s + d.downloads, 0),
    releaseDays: inMonth.map((d) => d.day),
    quietWeek: quietWeek(days, releaseDays),
    latestVersion: registry["dist-tags"] && registry["dist-tags"].latest,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
  };
}

function markdown(m) {
  const q = m.quietWeek
    ? `${m.quietWeek.downloads} (${m.quietWeek.from} to ${m.quietWeek.to}, about ${Math.round((m.quietWeek.downloads / 7) * 30)} a month at that rate)`
    : "no full week without a release in the period";
  return [
    `**${m.period.from} to ${m.period.to}** (latest version ${m.latestVersion})`,
    "",
    `- npm downloads, 30 days: ${m.monthDownloads}, of which ${m.releaseDayDownloads} on ${m.releaseDays.length} release days`,
    `- Last full week without a release: ${q}`,
    `- GitHub: ${m.stars} stars, ${m.forks} forks`,
  ].join("\n");
}

if (require.main === module) {
  measure().then(
    (m) => {
      console.log(
        process.argv.includes("--markdown")
          ? markdown(m)
          : JSON.stringify(m, null, 2),
      );
    },
    (err) => {
      console.error(`✗ ${err.message}`);
      process.exit(1);
    },
  );
}

module.exports = { measure, markdown, quietWeek };
