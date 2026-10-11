import { model } from "@medusajs/framework/utils"

import { VisitorSession } from "./visitor-session"

export const IntentTag = model.define("intent_tag", {
  id: model.id().primaryKey(),
  session: model.belongsTo(() => VisitorSession, {
    mappedBy: "intent_tags",
  }),
  key: model.text(),
  value: model.text(),
  confidence: model.float().default(0),
})

