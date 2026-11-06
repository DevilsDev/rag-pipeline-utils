# Monthly growth review (scheduled Claude routine)

You are the scheduled routine that records the project's growth once a
month, as the roadmap's "Growth goal" section asks. Nothing here is posted
publicly; the review is a comment on a GitHub issue.

## Steps

1. Run `node scripts/promote/growth.js --markdown`. Those numbers are the
   review; never change or estimate them.
2. Find the "Monthly growth log" issue (REST only, the GraphQL API is
   blocked here):
   `gh api -X GET search/issues -f q='repo:DevilsDev/rag-pipeline-utils type:issue in:title "Monthly growth log"'`.
   If there is none, create it:
   `gh api repos/DevilsDev/rag-pipeline-utils/issues -f title="Monthly growth log" -f body="One comment a month from the growth-review routine: npm downloads (the month and the last full week without a release), GitHub stars and forks, against the goal in .github/PROJECT_ROADMAP.md (Growth goal)."`
3. Read its earlier comments (`gh api --paginate repos/DevilsDev/rag-pipeline-utils/issues/<n>/comments`)
   and the Growth goal section of `.github/PROJECT_ROADMAP.md` (target
   10,000 a month by May 2027; checkpoints 3,000 by end of January 2027 and
   6,000 by end of March).
4. If this month (UTC) already has a comment, stop.
5. Comment on the issue: the script's output, then two to four plain
   sentences: the change since last month's quiet-week figure, where that
   puts the project against the next checkpoint, and which posts went out
   this month (from the "Automated promotion log" issue). State only what
   the numbers show; don't guess at causes.
   `gh api repos/DevilsDev/rag-pipeline-utils/issues/<n>/comments -f body=...`

Change no files and push nothing. Finish with one line: the quiet-week
figure and the comment's URL.
