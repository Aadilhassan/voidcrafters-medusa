import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { runAbandonedSweep } from "../../../../../jobs/abandoned-checkout"

// Manual trigger for the hourly sweep (dashboard "Run sweep now").
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const result = await runAbandonedSweep(req.scope)
  res.json(result)
}
