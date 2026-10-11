import { model } from "@medusajs/framework/utils"

import { VisitorSession } from "./visitor-session"

export const SessionEvent = model.define("session_event", {
  id: model.id().primaryKey(),
  session: model.belongsTo(() => VisitorSession, {
    mappedBy: "session_events",
  }),
  type: model.text().searchable(),
  path: model.text().nullable(),
  data: model.json().nullable(),
})

