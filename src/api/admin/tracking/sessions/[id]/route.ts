import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { TRACKING_MODULE } from "../../../../../modules/tracking"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const tracking = req.scope.resolve(TRACKING_MODULE) as any
  const { id } = req.params

  const sessions = await tracking.listVisitorSessions({ id: [id] })
  const session = sessions[0]
  if (!session) {
    return res.status(404).json({ message: "Session not found" })
  }

  const events = await tracking.listSessionEvents(
    { session_id: [id] },
    { order: { created_at: "DESC" }, take: 200 }
  )
  const tags = await tracking.listIntentTags({ session_id: [id] })

  res.json({ session, events, tags })
}
