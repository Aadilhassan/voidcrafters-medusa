import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { TRACKING_MODULE } from "../../../../modules/tracking"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const tracking = req.scope.resolve(TRACKING_MODULE) as any
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Number(req.query.offset) || 0

  const [rows, count] = await tracking.listAndCountAbandonedCarts(
    {},
    { order: { updated_at: "DESC" }, take: limit, skip: offset }
  )

  res.json({ abandoned: rows, count, limit, offset })
}
