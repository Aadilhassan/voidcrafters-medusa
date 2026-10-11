import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { TRACKING_MODULE } from "../../../../modules/tracking"

type Body = {
  session_id?: string
  type: string
  path?: string
  data?: Record<string, any>
  email?: string
  cart_id?: string
  utm?: { source?: string; medium?: string; campaign?: string }
  country?: string
}

// Public, auth-free: anonymous journey capture. Never requires PII —
// email/cart travel only when the shopper already gave them to the shop.
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const tracking = req.scope.resolve(TRACKING_MODULE) as any
  const { type } = req.body || {}

  if (!type || typeof type !== "string") {
    return res.status(400).json({ message: "Event type is required" })
  }

  // Derive richer types server-side so the client stays dumb.
  let eventType = type
  const path: string = req.body.path || ""
  if (type === "page_view" && path.includes("/products/")) {
    eventType = "product_view"
  }

  const result = await tracking.trackEvent({
    session_id: req.body.session_id,
    type: eventType,
    path: path || undefined,
    data: req.body.data,
    email: req.body.email,
    cart_id: req.body.cart_id,
    utm: req.body.utm,
    country: req.body.country,
  })

  res.json(result)
}
