import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { TRACKING_MODULE } from "../../../../modules/tracking"

// Returns the newest unused personal offer minted for this session, if any.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const sessionId = req.query.session_id as string | undefined
  if (!sessionId) {
    return res.json({ personal_offer: null })
  }

  const tracking = req.scope.resolve(TRACKING_MODULE) as any
  const tags = await tracking.listIntentTags(
    { session_id: [sessionId], key: ["personal_offer"] },
    { order: { created_at: "DESC" }, take: 5 }
  )

  const used: string[] = (
    await tracking.listIntentTags(
      { session_id: [sessionId], key: ["offer_used"] },
      {},
      undefined
    )
  ).map((t: any) => t.value)

  const offer = (tags as any[]).find((t) => !used.includes(t.value))

  res.json({
    personal_offer: offer
      ? { code: offer.value, confidence: offer.confidence }
      : null,
  })
}
