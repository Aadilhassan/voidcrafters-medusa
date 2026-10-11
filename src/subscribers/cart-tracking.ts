import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { TRACKING_MODULE } from "../modules/tracking"

// Links anonymous sessions to carts the moment an email appears on one.
export default async function cartLinkHandler({
  event: { data: eventData },
  container,
}: SubscriberArgs<{ id: string }>) {
  try {
    const query: any = container.resolve("query")
    const { data } = await query.graph({
      entity: "cart",
      fields: ["id", "email"],
      filters: { id: eventData.id },
    })
    const cart = data?.[0]
    if (!cart?.email) {
      return
    }

    const tracking: any = container.resolve(TRACKING_MODULE)
    const sessions = await tracking.listVisitorSessions(
      { email: [cart.email] },
      { order: { updated_at: "DESC" }, take: 5 }
    )
    for (const s of sessions) {
      if (!s.cart_id) {
        await tracking.updateVisitorSessions([{ id: s.id, cart_id: cart.id }])
      }
      await tracking.trackEvent({
        session_id: s.id,
        type: "cart_updated",
        cart_id: cart.id,
        email: cart.email,
      })
    }
  } catch {
    // tracking must never break checkout
  }
}

export const config: SubscriberConfig = {
  event: ["cart.created", "cart.updated"],
}
