import { useEffect, useState } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Container, Heading, Table, Text } from "@medusajs/ui"

type SessionRow = {
  id: string
  email?: string | null
  cart_id?: string | null
  utm_source?: string | null
  country?: string | null
  converted_order_id?: string | null
  updated_at: string
  event_count: number
  tags: { key: string; value: string; confidence: number }[]
}

type AbandonedRow = {
  id: string
  cart_id: string
  email: string
  stage: number
  status: string
  channel?: string | null
  sent_at?: string | null
}

async function get(path: string) {
  const res = await fetch(path, { credentials: "include" })
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`)
  }
  return res.json()
}

async function post(path: string, body?: any) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message || `Request failed: ${res.status}`)
  }
  return res.json()
}

const tag = (tags: SessionRow["tags"], key: string) =>
  tags.find((t) => t.key === key)?.value || "—"

const IntelligencePage = () => {
  const [tab, setTab] = useState<"sessions" | "abandoned" | "config">(
    "sessions"
  )
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [abandoned, setAbandoned] = useState<AbandonedRow[]>([])
  const [config, setConfig] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    setError(null)
    return Promise.all([
      get("/admin/tracking/sessions?limit=50"),
      get("/admin/tracking/abandoned?limit=50"),
      get("/admin/tracking/config"),
    ]).then(([s, a, c]) => {
      setSessions(s.sessions)
      setAbandoned(a.abandoned)
      setConfig(c)
    })
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message))
  }, [])

  const runSweep = async () => {
    setBusy(true)
    setNotice(null)
    try {
      const r = await post("/admin/tracking/abandoned/sweep")
      setNotice(
        `Sweep done — ${r.processed} processed, ${r.sent} sent, ${r.pending} pending.`
      )
      await refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const resend = async (cart_id: string) => {
    setBusy(true)
    setNotice(null)
    try {
      const r = await post("/admin/tracking/abandoned/resend", { cart_id })
      setNotice(
        r.result.sent
          ? `Sent via ${r.result.channel}. Recovery: ${r.recovery_url}`
          : `Not sent (${r.result.reason}). Row kept as pending.`
      )
      await refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className="divide-y divide-dashed p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Intelligence</Heading>
          <Text className="text-ui-fg-subtle">
            Anonymous journeys, intent tags, abandoned checkouts, integration
            health.
          </Text>
        </div>
        <div className="flex gap-2">
          {(["sessions", "abandoned", "config"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm capitalize ${
                tab === t
                  ? "bg-ui-bg-interactive text-white"
                  : "bg-ui-bg-subtle text-ui-fg-subtle"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="px-6 py-4">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      )}

      {notice && (
        <div className="px-6 py-4">
          <Text className="text-ui-fg-interactive">{notice}</Text>
        </div>
      )}

      {tab === "abandoned" && (
        <div className="px-6 py-4">
          <button
            onClick={runSweep}
            disabled={busy}
            className="rounded-full bg-ui-bg-interactive px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {busy ? "Working…" : "Run sweep now"}
          </button>
        </div>
      )}

      {tab === "sessions" && (
        <Table>
          <Table.Header>
            <Table.Row>
              {["Session", "UTM", "Events", "Intent", "Nudge", "Affinity", "Converted"].map(
                (h) => (
                  <Table.HeaderCell key={h}>{h}</Table.HeaderCell>
                )
              )}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {sessions.map((s) => (
              <Table.Row key={s.id}>
                <Table.Cell>
                  <Text className="font-mono text-xs">
                    {s.id.slice(0, 8)}…
                  </Text>
                  <Text className="text-xs text-ui-fg-subtle">
                    {s.email || "anonymous"}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Text className="text-xs">
                    {s.utm_source || "direct"}
                  </Text>
                </Table.Cell>
                <Table.Cell>{s.event_count}</Table.Cell>
                <Table.Cell>
                  <Badge
                    color={
                      tag(s.tags, "purchase_intent") === "high"
                        ? "green"
                        : "grey"
                    }
                  >
                    {tag(s.tags, "purchase_intent")}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  {tag(s.tags, "personal_offer") !== "—" ? (
                    <Badge color="purple">
                      {tag(s.tags, "personal_offer")}
                    </Badge>
                  ) : (
                    <Text className="text-xs">—</Text>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Text className="text-xs">
                    {tag(s.tags, "category_affinity")}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  {s.converted_order_id ? (
                    <Badge color="green">yes</Badge>
                  ) : (
                    <Text className="text-xs">—</Text>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {tab === "abandoned" && (
        <Table>
          <Table.Header>
            <Table.Row>
              {["Cart", "Email", "Stage", "Status", "Channel", "Sent", ""].map((h) => (
                <Table.HeaderCell key={h}>{h}</Table.HeaderCell>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {abandoned.map((a) => (
              <Table.Row key={a.id}>
                <Table.Cell>
                  <Text className="font-mono text-xs">
                    {a.cart_id.slice(0, 12)}…
                  </Text>
                </Table.Cell>
                <Table.Cell>{a.email}</Table.Cell>
                <Table.Cell>{a.stage} / 3</Table.Cell>
                <Table.Cell>
                  <Badge
                    color={a.status === "recovered" ? "green" : "grey"}
                  >
                    {a.status}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Text className="text-xs">{a.channel || "—"}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text className="text-xs">
                    {a.sent_at
                      ? new Date(a.sent_at).toLocaleString()
                      : "—"}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <button
                    onClick={() => resend(a.cart_id)}
                    disabled={busy}
                    className="text-sm text-ui-fg-interactive hover:underline disabled:opacity-50"
                  >
                    Resend
                  </button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {tab === "config" && config && (
        <div className="grid grid-cols-2 gap-4 px-6 py-4">
          <div>
            <Heading level="h2" className="mb-2">
              Integrations
            </Heading>
            {Object.entries(config.integrations).map(([k, v]) => (
              <div key={k} className="flex justify-between py-1">
                <Text>{k}</Text>
                <Badge color={String(v).includes("live") ? "green" : "grey"}>
                  {String(v)}
                </Badge>
              </div>
            ))}
          </div>
          <div>
            <Heading level="h2" className="mb-2">
              Volumes
            </Heading>
            {Object.entries(config.volumes).map(([k, v]) => (
              <div key={k} className="flex justify-between py-1">
                <Text>{k}</Text>
                <Text>{String(v)}</Text>
              </div>
            ))}
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Intelligence",
})

export default IntelligencePage
