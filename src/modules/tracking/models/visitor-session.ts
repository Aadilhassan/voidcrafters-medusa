import { model } from "@medusajs/framework/utils"

export const VisitorSession = model.define("visitor_session", {
  id: model.id().primaryKey(),
  email: model.text().nullable(),
  cart_id: model.text().nullable(),
  utm_source: model.text().nullable(),
  utm_medium: model.text().nullable(),
  utm_campaign: model.text().nullable(),
  country: model.text().nullable(),
  converted_order_id: model.text().nullable(),
  last_seen_at: model.dateTime().nullable(),
})

