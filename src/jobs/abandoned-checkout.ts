import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { TRACKING_MODULE } from "../modules/tracking"

const STAGES = [
  { stage: 1, afterHours: 2, subject: "Your relics are waiting 🖤" },
  { stage: 2, afterHours: 24, subject: "Still thinking? 10% off your crypt drop" },
  { stage: 3, afterHours: 72, subject: "Last call from the crypt" },
]

function recoveryUrl(cartId: string) {
  const base = (
    process.env.STOREFRONT_URL || "https://voidcrafters.com"
  ).replace(/\/$/, "")
  return `${base}/in/recover?cart_id=${cartId}`
}

async function sendMail(opts: {
  to: string
  subject: string
  html: string
}) {
  const apiKey = process.env.SENDGRID_API_KEY
  const from =
    process.env.SENDGRID_FROM || "Voidcrafters <crypt@voidcrafters.com>"
  if (!apiKey) {
    return { sent: false, reason: "SENDGRID_API_KEY not configured" }
  }
  const sg = (await import("@sendgrid/mail")).default
  sg.setApiKey(apiKey)
  await sg.send({ to: opts.to, from, subject: opts.subject, html: opts.html })
  return { sent: true }
}

// Shopify-style abandoned checkout: 2h / 24h / 72h sequence for carts
// with an email + items that never converted. Without a mail key the
// rows still accumulate as "pending" and stay visible in the admin
// Intelligence page until sending is switched on.
export default async function abandonedCheckoutJob(
  container: MedusaContainer
) {
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

  let queued = 0
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

    const items = (cart.items || [])
      .map(
        (i: any) =>
          `<li>${i.title} × ${i.quantity} — ${(cart.total / 100).toFixed(0)} ${cart.currency_code?.toUpperCase()}</li>`
      )
      .join("")

    const html = `
      <div style="font-family:Georgia,serif;background:#0a0a0a;color:#e8e6e1;padding:32px;max-width:560px">
        <h1 style="letter-spacing:.15em">VOIDCRAFTERS</h1>
        <h2>${dueStage.subject}</h2>
        <p>You left these in your cart:</p>
        <ul>${items}</ul>
        <p><a href="${recoveryUrl(cart.id)}" style="background:#8a0303;color:#e8e6e1;padding:12px 28px;text-decoration:none;letter-spacing:.2em">RESUME CHECKOUT</a></p>
        <p style="color:#6e6d69;font-size:12px">Prepaid secure · 7-day exchange · Free ship over ₹499</p>
      </div>`

    const result = await sendMail({
      to: cart.email,
      subject: dueStage.subject,
      html,
    })

    if (row) {
      await tracking.updateAbandonedCarts([
        {
          id: row.id,
          stage: dueStage.stage,
          status: result.sent ? "sent" : "pending",
          sent_at: result.sent ? new Date() : undefined,
        },
      ])
    } else {
      await tracking.createAbandonedCarts([
        {
          cart_id: cart.id,
          email: cart.email,
          stage: dueStage.stage,
          status: result.sent ? "sent" : "pending",
          sent_at: result.sent ? new Date() : undefined,
        },
      ])
    }
    queued++
  }

  logger.info(`Abandoned checkout sweep: ${queued} cart(s) processed`)
}

export const config = {
  name: "abandoned-checkout-sweep",
  schedule: "15 * * * *",
}
