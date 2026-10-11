import { model } from "@medusajs/framework/utils"

export const AbandonedCart = model.define("abandoned_cart", {
  id: model.id().primaryKey(),
  cart_id: model.text().unique(),
  email: model.text(),
  stage: model.number().default(0),
  status: model.text().default("pending"),
  channel: model.text().nullable(),
  sent_at: model.dateTime().nullable(),
  recovered_order_id: model.text().nullable(),
})
