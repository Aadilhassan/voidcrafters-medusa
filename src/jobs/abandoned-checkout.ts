import { MedusaContainer } from "@medusajs/framework/types"
import { TRACKING_MODULE } from "../modules/tracking"
import { sendAbandonment } from "../modules/tracking/notifier"

export const STAGES = [
  { stage: 1, afterHours: 2, subject: "Your relics are waiting 🖤" },
  { stage: 2, afterHours: 24, subject: "Still thinking? 10% off your crypt drop" },
  { stage: 3, afterHours: 72, subject: "Last call from the crypt" },
]

export function recoveryUrl(cartId: string) {
  const base = (
    process.env.STOREFRONT_URL || "https://voidcrafters.com"
  ).replace(/\/$/, "")
  return `${base}/in/recover?cart_id=${cartId}`
}

export function abandonmentEmail(
  cart: any,
  subject: string
): string {
  const items = (cart.items || [])
    .map((i: any) => `<li>${i.title} × ${i.quantity}</li>`)
    .join("")
  const total = ((cart.total || 0) / 100).toFixed(0)

  return `
    <div style="font-family:Georgia,serif;background:#0a0a0a;color:#e8e6e1;padding:32px;max-width:560px">
      <h1 style="letter-spacing:.15em">VOIDCRAFTERS</h1>
      <h2>${subject}</h2>
      <p>You left these in your cart:</p>
      <ul>${items}</ul>
      <p style="font-size:20px">Total: ₹${total} ${cart.currency_code?.toUpperCase() || ""}</p>
      <p><a href="${recoveryUrl(cart.id)}" style="background:#8a0303;color:#e8e6e1;padding:12px 28px;text-decoration:none;letter-spacing:.2em">RESUME CHECKOUT</a></p>
      <p style="color:#6e6d69;font-size:12px">Prepaid secure · 7-day exchange · Free ship over ₹499</p>
    </div>`
}

// Shared by the hourly job and the manual admin trigger. Returns counts
// so the dashboard can report what happened.
export async function runAbandonedSweep(container: MedusaContainer): Promise<{
  processed: number
  sent: number
  pending: number
}> {
  const logger = container.resolve("logger")
  const tracking: any = container.resolve(TRACKING_MODULE)
  const query: any = container.resolve("query")

  const now = Date.now()
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "email", "total", "currency_code", "updated_at", "items.*"],
    filters: { completed_at: null },
    pagination: { take: 200 },
  })

  let processed = 0
  let sent = 0
  for (const cart of carts || []) {
    if (!cart.email || !(cart.items || []).length) {
      continue
    }
    const ageHours =
      (now - new Date(cart.updated_at).getTime()) / (1000 * 60 * 60)
    const dueStage = [...STAGES].reverse().find((s) => ageHours >= s.afterHours)
    if (!dueStage) {
      continue
    }

    const existing = await tracking.listAbandonedCarts({
      cart_id: [cart.id],
    })
    const row = existing[0]
    if (row && (row.stage >= dueStage.stage || row.status === "recovered")) {
      continue
    }

    const result = await sendAbandonment({
      to: cart.email,
      subject: dueStage.subject,
      html: abandonmentEmail(cart, dueStage.subject),
    })

    const patch = {
      stage: dueStage.stage,
      status: result.sent ? "sent" : "pending",
      channel: result.channel,
      sent_at: result.sent ? new Date() : undefined,
    }
    if (row) {
      await tracking.updateAbandonedCarts([{ id: row.id, ...patch }])
    } else {
      await tracking.createAbandonedCarts([
        { cart_id: cart.id, email: cart.email, ...patch },
      ])
    }
    processed++
    if (result.sent) {
      sent++
    }
  }

  logger.info(
    `Abandoned checkout sweep: ${processed} processed, ${sent} sent`
  )
  return { processed, sent, pending: processed - sent }
}

export default async function abandonedCheckoutJob(
  container: MedusaContainer
) {
  await runAbandonedSweep(container)
}

export const config = {
  name: "abandoned-checkout-sweep",
  schedule: "15 * * * *",
}
