# Fixed 3-slot model (nightly / canary / production)

Alternative to the default 2-branch shadow + SLO-gated canary-ramp templates.
Pick **one** model per project — don't mix.

In this model the three slots are stable **Vercel Custom Environments**, each
with its own domain and branch tracking:

| Slot         | Branch       | Custom Environment | Default share |
| ------------ | ------------ | ------------------ | ------------- |
| `nightly`    | `main`       | `nightly`          | 5%            |
| `canary`     | `canary`     | `canary`           | 20%           |
| `production` | `production` | `production`       | 75% (remainder) |

The **production** deploy holds the public domain and owns the traffic split:
its middleware rewrites a fixed, operator-controlled share to the nightly /
canary domains. There is **no auto-ramp** and **no per-deploy URL tracking** —
the slot domains are stable, so deploy workflows never patch Edge Config. The
runtime slot is derived synchronously from `VERCEL_TARGET_ENV`.

## Setup

1. Create `canary` (branch `canary`) and `nightly` (branch `main`) Custom
   Environments in Vercel, each with a stable domain.
2. Copy `proxy.ts` (or fold `slotCanaryProxy` into your existing one).
3. Copy the three workflows under `.github/workflows/`.
4. Seed the Edge Config key `shadow-<repo-slug>-canary` with:
   ```json
   {
     "domainNightly": "nightly.example.com",
     "domainCanary": "canary.example.com",
     "trafficNightlyPercent": 5,
     "trafficCanaryPercent": 20
   }
   ```
5. Adjust percentages live from `/admin` (see `app/api/admin/rollout/route.ts`).

Runtime helpers: `getSlotInfo()` / `getSlotRuntime()` (sync, `VERCEL_TARGET_ENV`).
