import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { configuredChannels } from "../../../../modules/tracking/notifier"
import { TRACKING_MODULE } from "../../../../modules/tracking"

// Integration health + volume snapshot for the Intelligence dashboard.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const tracking = req.scope.resolve(TRACKING_MODULE) as any

  const [, sessionCount] = await tracking.listAndCountVisitorSessions(
    {},
    { take: 1 }
  )
  const [, eventCount] = await tracking.listAndCountSessionEvents(
    {},
    { take: 1 }
  )
  const [, abandonedCount] = await tracking.listAndCountAbandonedCarts(
    {},
    { take: 1 }
  )
  const [, offerCount] = await tracking.listAndCountIntentTags(
    { key: ["personal_offer"] },
    { take: 1 }
  )

  res.json({
    integrations: {
      mail: process.env.SENDGRID_API_KEY ? "live" : "missing-key",
      channels: configuredChannels(),
      clef: process.env.OPENROUTER_API_KEY ? "live" : "heuristic",
      meilisearch: process.env.MEILISEARCH_HOST ? "live" : "missing-host",
      odoo: process.env.ODOO_URL ? "configured" : "dormant",
      r2: process.env.R2_BUCKET ? "live" : "local",
    },
    volumes: {
      sessions: sessionCount,
      events: eventCount,
      abandoned: abandonedCount,
      personal_offers: offerCount,
    },
  })
}
