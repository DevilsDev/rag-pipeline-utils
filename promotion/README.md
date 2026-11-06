# Automated promotion

Posts about the project are written and published with no one reviewing
them, so the safeguards are in code.

| What                                                                                                        | When                          | Written by                                                                                       | Published by                                                |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Release announcement: GitHub Discussions, dev.to (the blog post, with its canonical URL), Bluesky, Mastodon | A GitHub release is published | `scripts/promote/release-posts.js`, from the release notes and blog post                         | `.github/workflows/promote.yml`                             |
| One dev.to article                                                                                          | Monthly, by a Claude routine  | The routine, following [routines/monthly-article.md](routines/monthly-article.md), into `queue/` | `.github/workflows/promote.yml`, on the push                |
| Growth review                                                                                               | Monthly, by a Claude routine  | The routine, following [routines/growth-review.md](routines/growth-review.md)                    | A comment on the "Monthly growth log" issue; nothing public |

Hacker News and Reddit are left out on purpose: both forbid automated
self-promotion.

## Safeguards

Every post goes through `scripts/promote/post.js`, which publishes only if
`scripts/promote/guards.js` passes:

- every number in the post appears in the files it was written from;
- every link is https, on github.com, npmjs.com, devilsdev.github.io,
  stackblitz.com or dev.to, and answers;
- it fits the channel, with no placeholders or hype words;
- it hasn't been published before: each post is recorded in the "Automated
  promotion log" issue under its key, and a recorded key is never posted
  again.

A failed check stops that post and fails the workflow run, so GitHub emails
the failure.

## Setup (once)

Repository **secrets** (Settings → Secrets and variables → Actions):
`DEVTO_API_KEY`, `BLUESKY_APP_PASSWORD`, `MASTODON_ACCESS_TOKEN`.
Repository **variables**: `BLUESKY_HANDLE` (for example
`ragpipelineutils.bsky.social`), `MASTODON_INSTANCE` (for example
`https://fosstodon.org`). A channel without its secret is skipped.

## Stop it

Disable the Promote workflow (Actions → Promote → Disable workflow) and
pause the two routines at claude.ai/code/routines.
