import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { TRACKING_MODULE } from "../modules/tracking"

type ScoreInput = { session_id: string }

type Scores = {
  purchase_intent: { value: string; confidence: number }
  price_sensitive: { value: string; confidence: number }
  needs_nudge: { value: string; confidence: number }
  category_affinity: { value: string; confidence: number }
}

const INTENT_OPTIONS = ["high", "medium", "low"]
const YES_NO = ["yes", "no"]
const CATEGORIES = [
  "rings",
  "necklaces",
  "chokers",
  "earrings",
  "piercings",
  "body-chains",
  "none",
]

function heuristicScore(state: any): Scores {
  const cartValue: number = state.cart_value || 0
  const productViews: number = state.product_views || 0
  const coupon = !!state.coupon_attempted
  const intent =
    cartValue > 0 ? "high" : productViews >= 3 ? "medium" : "low"
  return {
    purchase_intent: {
      value: intent,
      confidence: cartValue > 0 ? 0.8 : 0.55,
    },
    price_sensitive: { value: coupon ? "yes" : "no", confidence: 0.6 },
    needs_nudge: {
      value: cartValue > 0 ? "yes" : "no",
      confidence: 0.65,
    },
    category_affinity: {
      value: state.top_category || "none",
      confidence: state.top_category ? 0.7 : 0.4,
    },
  }
}

async function clefScore(state: any): Promise<Scores | null> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return null
  }

  const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://voidcrafters.com",
      "X-Title": "Voidcrafters intent scoring",
    },
    body: JSON.stringify({
      model: "cloudflare/clef-flash",
      state,
      questions: [
        {
          id: "purchase_intent",
          question: "How likely is this visitor to purchase in this session?",
          options: INTENT_OPTIONS,
        },
        {
          id: "price_sensitive",
          question: "Is this visitor price sensitive?",
          options: YES_NO,
        },
        {
          id: "needs_nudge",
          question:
            "Would a small personalized discount move this visitor to checkout?",
          options: YES_NO,
        },
        {
          id: "category_affinity",
          question:
            "Which jewellery category is this visitor most drawn to?",
          options: CATEGORIES,
        },
      ],
    }),
  })

  if (!res.ok) {
    return null
  }

  const data: any = await res.json()
  const pick = (id: string, fallback: string) => {
    const q = (data.questions || data.decisions || []).find(
      (x: any) => x.id === id
    )
    const options = q?.options || q?.answers || []
    const best = [...options].sort(
      (a: any, b: any) => (b.probability ?? 0) - (a.probability ?? 0)
    )[0]
    return {
      value: best?.option ?? best?.value ?? fallback,
      confidence: best?.probability ?? 0.5,
    }
  }

  return {
    purchase_intent: pick("purchase_intent", "low"),
    price_sensitive: pick("price_sensitive", "no"),
    needs_nudge: pick("needs_nudge", "no"),
    category_affinity: pick("category_affinity", "none"),
  }
}

const loadSessionState = createStep(
  "load-session-state",
  async (input: ScoreInput, { container }) => {
    const tracking: any = container.resolve(TRACKING_MODULE)
    const sessions = await tracking.listVisitorSessions({ id: [input.session_id] })
    const session = sessions[0]
    if (!session) {
      throw new Error("Session not found")
    }

    const events: any[] = await tracking.listSessionEvents(
      { session_id: [input.session_id] },
      { order: { created_at: "DESC" }, take: 100 }
    )

    const productViews = events.filter((e) => e.type === "product_view")
    const catHits: Record<string, number> = {}
    for (const e of productViews) {
      const handle: string = e.path?.split("/products/")[1]?.split("/")[0] || ""
      for (const c of CATEGORIES) {
        if (handle.includes(c.replace("-", "")) || handle.includes(c)) {
          catHits[c] = (catHits[c] || 0) + 1
        }
      }
    }
    const top_category =
      Object.entries(catHits).sort((a, b) => b[1] - a[1])[0]?.[0] || null

    // Cart snapshot, when the session is linked to one.
    let cart_value = 0
    let cart_items = 0
    if (session.cart_id) {
      try {
        const query: any = container.resolve("query")
        const { data } = await query.graph({
          entity: "cart",
          fields: ["id", "total", "items.*"],
          filters: { id: session.cart_id },
        })
        const cart = data?.[0]
        if (cart && !cart.completed_at) {
          cart_value = Math.round((cart.total || 0) / 100)
          cart_items = cart.items?.length || 0
        }
      } catch {
        // cart may be gone; score without it
      }
    }

    const pages = events.filter((e) => e.type === "page_view").length
    const first = events[events.length - 1]?.created_at
    const minutes_active = first
      ? Math.max(
          1,
          Math.round(
            (Date.now() - new Date(first).getTime()) / 60000
          )
        )
      : 1

    return new StepResponse({
      session,
      state: {
        pages_viewed: pages,
        product_views: productViews.length,
        cart_value_inr: cart_value,
        cart_value: cart_value,
        cart_items,
        minutes_active,
        utm_source: session.utm_source || "direct",
        coupon_attempted: events.some((e) => e.type === "coupon_attempted"),
        top_category,
      },
    })
  }
)

const runScoring = createStep(
  "run-scoring",
  async (
    input: { session_id: string; state: any },
    { container }
  ) => {
    const tracking: any = container.resolve(TRACKING_MODULE)
    let scores: Scores | null = null
    let engine = "heuristic"

    try {
      scores = await clefScore(input.state)
      if (scores) {
        engine = "clef-flash"
      }
    } catch {
      scores = null
    }
    if (!scores) {
      scores = heuristicScore(input.state)
    }

    await tracking.setIntentTags(input.session_id, [
      {
        key: "purchase_intent",
        value: scores.purchase_intent.value,
        confidence: scores.purchase_intent.confidence,
      },
      {
        key: "price_sensitive",
        value: scores.price_sensitive.value,
        confidence: scores.price_sensitive.confidence,
      },
      {
        key: "needs_nudge",
        value: scores.needs_nudge.value,
        confidence: scores.needs_nudge.confidence,
      },
      {
        key: "category_affinity",
        value: scores.category_affinity.value,
        confidence: scores.category_affinity.confidence,
      },
      { key: "scored_by", value: engine, confidence: 1 },
    ])

    return new StepResponse({ scores, engine })
  }
)

const maybeMintOffer = createStep(
  "maybe-mint-offer",
  async (
    input: { session_id: string; scores: Scores },
    { container }
  ) => {
    const { scores, session_id } = input
    const qualifies =
      scores.needs_nudge.value === "yes" &&
      (scores.purchase_intent.value === "high" ||
        scores.purchase_intent.value === "medium")

    if (!qualifies) {
      return new StepResponse({ personal_offer: null })
    }

    const tracking: any = container.resolve(TRACKING_MODULE)
    const existing = await tracking.listIntentTags({
      session_id: [session_id],
      key: ["personal_offer"],
    })
    if (existing.length) {
      return new StepResponse({ personal_offer: existing[0].value })
    }

    const code = `NUDGE-${session_id
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(-6)
      .toUpperCase()}`

    const { result } = await createPromotionsWorkflow(container).run({
      input: {
        promotionsData: [
          {
            code,
            type: "standard",
            status: "active",
            application_method: {
              type: "percentage",
              target_type: "order",
              allocation: "across",
              value: 10,
            },
          },
        ],
      },
    })

    if (!result?.length) {
      return new StepResponse({ personal_offer: null })
    }

    await tracking.setIntentTags(session_id, [
      { key: "personal_offer", value: code, confidence: 0.9 },
    ])

    return new StepResponse({ personal_offer: code })
  }
)

export const scoreSessionWorkflow = createWorkflow(
  "score-session",
  (input: ScoreInput) => {
    const { state } = loadSessionState(input) as any
    const { scores, engine } = runScoring({
      session_id: input.session_id,
      state,
    })
    const { personal_offer } = maybeMintOffer({
      session_id: input.session_id,
      scores: scores as Scores,
    })

    return new WorkflowResponse({
      session_id: input.session_id,
      scores,
      engine,
      personal_offer,
      state,
    })
  }
)
