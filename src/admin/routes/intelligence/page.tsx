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
  sent_at?: string | null
}

async function get(path: string) {
  const res = await fetch(path, { credentials: "include" })
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`)
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

  useEffect(() => {
    Promise.all([
      get("/admin/tracking/sessions?limit=50"),
      get("/admin/tracking/abandoned?limit=50"),
      get("/admin/tracking/config"),
    ])
      .then(([s, a, c]) => {
        setSessions(s.sessions)
        setAbandoned(a.abandoned)
        setConfig(c)
      })
      .catch((e) => setError(e.message))
  }, [])

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
              {["Cart", "Email", "Stage", "Status", "Sent"].map((h) => (
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
                  <Text className="text-xs">
                    {a.sent_at
                      ? new Date(a.sent_at).toLocaleString()
                      : "—"}
                  </Text>
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
