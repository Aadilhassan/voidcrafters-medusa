import { MedusaService } from "@medusajs/framework/utils"
import { VisitorSession } from "./models/visitor-session"
import { SessionEvent } from "./models/session-event"
import { IntentTag } from "./models/intent-tag"
import { AbandonedCart } from "./models/abandoned-cart"

export default class TrackingModuleService extends MedusaService({
  VisitorSession,
  SessionEvent,
  IntentTag,
  AbandonedCart,
}) {
  async trackEvent(
    input: {
      session_id?: string
      type: string
      path?: string
      data?: Record<string, any>
      email?: string
      cart_id?: string
      utm?: { source?: string; medium?: string; campaign?: string }
      country?: string
    },
    sharedContext?: any
  ) {
    let sessionId = input.session_id
    let session: any = null

    if (sessionId) {
      const existing = await this.listVisitorSessions(
        { id: [sessionId] },
        {},
        sharedContext
      )
      session = existing[0] || null
    }

    // Fall back to matching by email or cart when no session id travels along.
    if (!session && (input.email || input.cart_id)) {
      const filters: any[] = []
      if (input.email) filters.push({ email: input.email })
      if (input.cart_id) filters.push({ cart_id: input.cart_id })
      for (const f of filters) {
        const found = await this.listVisitorSessions(
          f,
          { order: { updated_at: "DESC" }, take: 1 },
          sharedContext
        )
        if (found[0]) {
          session = found[0]
          break
        }
      }
    }

    if (!session) {
      const created = await this.createVisitorSessions(
        [
          {
            email: input.email || undefined,
            cart_id: input.cart_id || undefined,
            utm_source: input.utm?.source,
            utm_medium: input.utm?.medium,
            utm_campaign: input.utm?.campaign,
            country: input.country,
            last_seen_at: new Date(),
          },
        ],
        sharedContext
      )
      session = created[0]
      sessionId = session.id
    } else {
      sessionId = session.id
      await this.updateVisitorSessions(
        [
          {
            id: session.id,
            ...(input.email ? { email: input.email } : {}),
            ...(input.cart_id ? { cart_id: input.cart_id } : {}),
            ...(input.utm?.source
              ? { utm_source: input.utm.source }
              : {}),
            last_seen_at: new Date(),
          },
        ],
        sharedContext
      )
    }

    await this.createSessionEvents(
      [
        {
          session_id: sessionId,
          type: input.type,
          path: input.path,
          data: input.data,
        },
      ],
      sharedContext
    )

    return { session_id: sessionId }
  }

  async setIntentTags(
    sessionId: string,
    tags: { key: string; value: string; confidence: number }[],
    sharedContext?: any
  ) {
    const existing = await this.listIntentTags(
      { session_id: [sessionId] },
      {},
      sharedContext
    )
    if (existing.length) {
      await this.deleteIntentTags(
        existing.map((t) => t.id),
        sharedContext
      )
    }
    return this.createIntentTags(
      tags.map((t) => ({ session_id: sessionId, ...t })),
      sharedContext
    )
  }
}
