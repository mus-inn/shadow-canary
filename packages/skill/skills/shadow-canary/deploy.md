# /shadow-canary:deploy <shadow|prod> [--skip-canary|--keep-canary]

Trigger a deployment by pushing to the relevant branch.

Usage:
- `/shadow-canary:deploy shadow` — push current HEAD to origin/master → triggers deploy-shadow.yml
- `/shadow-canary:deploy prod` — merge master into production → triggers deploy-prod.yml (normal canary ramp)
- `/shadow-canary:deploy prod --skip-canary` — add commit marker `[skip-canary]` → jumps to 100% immediately
- `/shadow-canary:deploy prod --keep-canary` — add commit marker `[keep-canary]` → fix-in-place, no ramp restart

Steps:
1. Read `.shadow-canary.json`. If missing, tell user to run /shadow-canary:install. STOP.
2. Run `git branch --show-current` to verify current branch.
3. For `shadow`:
   a. Confirm with the user: "Push current HEAD to origin/master and trigger a shadow deploy?"
   b. If confirmed, run `git push origin HEAD:master`.
   c. Construct the GitHub Actions run URL:
      `https://github.com/<org>/<repo>/actions/workflows/deploy-shadow.yml`
4. For `prod`:
   a. Ensure master is up to date: `git fetch origin master`.
   b. Determine commit message based on flag:
      - `--skip-canary`: message includes `[skip-canary]`
      - `--keep-canary`: message includes `[keep-canary]`
      - no flag: plain merge message
   c. Confirm with the user: "Merge master into production and trigger a prod deploy?"
   d. If confirmed, run:
      ```
      git checkout production
      git merge --no-ff origin/master -m "<message>"
      git push origin production
      git checkout -
      ```
   e. Construct the GitHub Actions run URL:
      `https://github.com/<org>/<repo>/actions/workflows/deploy-prod.yml`
5. Print the Actions URL so the user can watch the run.
6. Suggest: "Run /shadow-canary:status in a few minutes to watch canary progress."
