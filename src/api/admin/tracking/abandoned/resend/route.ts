import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  abandonmentEmail,
  recoveryUrl,
  STAGES,
} from "../../../../../jobs/abandoned-checkout"
import { sendAbandonment } from "../../../../../modules/tracking/notifier"
import { TRACKING_MODULE } from "../../../../../modules/tracking"

// Force-send a recovery message for one cart, regardless of age/stage.
// Used to test channels end-to-end before picking one.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const cartId = (req.body as any)?.cart_id
  const channel = (req.body as any)?.channel
  if (!cartId) {
    return res.status(400).json({ message: "cart_id is required" })
  }

  const tracking = req.scope.resolve(TRACKING_MODULE) as any
  const query: any = req.scope.resolve("query")
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "email", "total", "currency_code", "items.*"],
    filters: { id: cartId },
  })
  const cart = data?.[0]
  if (!cart?.email || !(cart.items || []).length) {
    return res
      .status(400)
      .json({ message: "Cart needs an email and at least one item" })
  }

  const result = await sendAbandonment(
    {
      to: cart.email,
      subject: STAGES[0].subject,
      html: abandonmentEmail(cart, STAGES[0].subject),
    },
    channel
  )

  const existing = await tracking.listAbandonedCarts({ cart_id: [cart.id] })
  const patch = {
    stage: 1,
    status: result.sent ? "sent" : "pending",
    channel: result.channel,
    sent_at: result.sent ? new Date() : undefined,
  }
  if (existing[0]) {
    await tracking.updateAbandonedCarts([{ id: existing[0].id, ...patch }])
  } else {
    await tracking.createAbandonedCarts([
      { cart_id: cart.id, email: cart.email, ...patch },
    ])
  }

  res.json({ result, recovery_url: recoveryUrl(cart.id) })
}
