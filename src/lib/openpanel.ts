import { OpenPanel } from "@openpanel/web"

/**
 * The analytics client, or nothing at all.
 *
 * Upstream this is constructed unconditionally, because upstream always has a client id. On a
 * fork that never configured OpenPanel it was constructed with `clientId: undefined` and
 * `trackScreenViews: true` — and that second flag makes the SDK beacon a screen view on load by
 * itself, without anyone calling `track()`. So a portfolio whose owner had configured no
 * analytics still sent a request to `api.openpanel.dev` on every page view. Confirmed in the
 * running app before this changed: one POST to `https://api.openpanel.dev/track` per load.
 *
 * Gating `trackEvent` was not enough, because the beacon never went through it. The client is
 * therefore not created at all unless an id is present, and `events.ts` treats a null client as
 * "analytics are off" — which is what an empty environment variable should have meant all along.
 */
const clientId = process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID

export const op = clientId
  ? new OpenPanel({ clientId, trackScreenViews: true })
  : null
