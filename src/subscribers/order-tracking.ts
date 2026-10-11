import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { TRACKING_MODULE } from "../modules/tracking"

// Marks sessions converted + abandoned rows recovered when an order lands.
export default async function orderTrackingHandler({
  event: { data: eventData },
  container,
}: SubscriberArgs<{ id: string }>) {
  try {
    const query: any = container.resolve("query")
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "email", "cart_id"],
      filters: { id: eventData.id },
    })
    const order = data?.[0]
    if (!order) {
      return
    }

    const tracking: any = container.resolve(TRACKING_MODULE)
    const sessions = await tracking.listVisitorSessions({
      cart_id: [order.cart_id],
    })
    for (const s of sessions) {
      await tracking.updateVisitorSessions([
        { id: s.id, converted_order_id: order.id },
      ])
      await tracking.trackEvent({
        session_id: s.id,
        type: "purchase",
        cart_id: order.cart_id,
        email: order.email,
        data: { order_id: order.id },
      })
    }

    const abandoned = await tracking.listAbandonedCarts({
      cart_id: [order.cart_id],
    })
    for (const a of abandoned) {
      await tracking.updateAbandonedCarts([
        { id: a.id, status: "recovered", recovered_order_id: order.id },
      ])
    }
  } catch {
    // tracking must never break orders
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
