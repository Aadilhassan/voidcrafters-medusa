import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { TRACKING_MODULE } from "../../../../modules/tracking"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const tracking = req.scope.resolve(TRACKING_MODULE) as any
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Number(req.query.offset) || 0

  const [sessions, count] = await tracking.listAndCountVisitorSessions(
    {},
    { order: { updated_at: "DESC" }, take: limit, skip: offset }
  )

  const withCounts = await Promise.all(
    (sessions as any[]).map(async (s) => {
      const [, eventCount] = await tracking.listAndCountSessionEvents(
        { session_id: [s.id] },
        { take: 1 }
      )
      const tags = await tracking.listIntentTags({ session_id: [s.id] })
      return { ...s, event_count: eventCount, tags }
    })
  )

  res.json({ sessions: withCounts, count, limit, offset })
}
