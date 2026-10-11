import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { scoreSessionWorkflow } from "../../../../workflows/score-session"

export async function POST(
  req: MedusaRequest<{ session_id?: string }>,
  res: MedusaResponse
) {
  const sessionId = req.body?.session_id
  if (!sessionId) {
    return res.status(400).json({ message: "session_id is required" })
  }

  const { result } = await scoreSessionWorkflow(req.scope).run({
    input: { session_id: sessionId },
  })

  res.json(result)
}
