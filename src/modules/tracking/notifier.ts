// Channel-agnostic abandonment sender. The job calls sendAbandonment()
// and this module picks the first configured channel, so switching
// between SendGrid / Resend / Twilio SMS / WhatsApp later is a key
// change, not a code change. Every attempt records its channel.

export type Channel = "sendgrid" | "resend" | "twilio_sms" | "whatsapp"

export type SendResult =
  | { sent: true; channel: Channel }
  | { sent: false; channel: Channel | "none"; reason: string }

export type AbandonmentMessage = {
  to: string
  subject: string
  html: string
  phone?: string
}

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.length ? v : undefined
}

async function viaSendGrid(msg: AbandonmentMessage): Promise<SendResult> {
  const apiKey = env("SENDGRID_API_KEY")
  const from =
    env("SENDGRID_FROM") || "Voidcrafters <crypt@voidcrafters.com>"
  if (!apiKey) {
    return { sent: false, channel: "sendgrid", reason: "SENDGRID_API_KEY missing" }
  }
  const sg = (await import("@sendgrid/mail")).default
  sg.setApiKey(apiKey)
  await sg.send({ to: msg.to, from, subject: msg.subject, html: msg.html })
  return { sent: true, channel: "sendgrid" }
}

async function viaResend(msg: AbandonmentMessage): Promise<SendResult> {
  const apiKey = env("RESEND_API_KEY")
  const from = env("RESEND_FROM") || "Voidcrafters <crypt@voidcrafters.com>"
  if (!apiKey) {
    return { sent: false, channel: "resend", reason: "RESEND_API_KEY missing" }
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
    }),
  })
  if (!res.ok) {
    return {
      sent: false,
      channel: "resend",
      reason: `Resend ${res.status}`,
    }
  }
  return { sent: true, channel: "resend" }
}

async function viaTwilioSms(msg: AbandonmentMessage): Promise<SendResult> {
  const sid = env("TWILIO_ACCOUNT_SID")
  const token = env("TWILIO_AUTH_TOKEN")
  const from = env("TWILIO_SMS_FROM")
  if (!sid || !token || !from || !msg.phone) {
    return {
      sent: false,
      channel: "twilio_sms",
      reason: "TWILIO_* keys or recipient phone missing",
    }
  }
  const body = `${msg.subject} — resume: ${(msg as any).shortUrl || ""}`.slice(0, 300)
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: msg.phone,
        From: from,
        Body: body,
      }).toString(),
    }
  )
  if (!res.ok) {
    return { sent: false, channel: "twilio_sms", reason: `Twilio ${res.status}` }
  }
  return { sent: true, channel: "twilio_sms" }
}

async function viaWhatsapp(msg: AbandonmentMessage): Promise<SendResult> {
  const sid = env("TWILIO_ACCOUNT_SID")
  const token = env("TWILIO_AUTH_TOKEN")
  const from = env("WHATSAPP_FROM")
  if (!sid || !token || !from || !msg.phone) {
    return {
      sent: false,
      channel: "whatsapp",
      reason: "WHATSAPP_FROM / TWILIO_* keys or recipient phone missing",
    }
  }
  // WhatsApp senders go through the same Twilio Messages API with a
  // whatsapp: prefixed sender. Template approval happens Meta-side.
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: `whatsapp:${msg.phone}`,
        From: `whatsapp:${from}`,
        Body: `${msg.subject} — ${(msg as any).shortUrl || ""}`.slice(0, 1000),
      }).toString(),
    }
  )
  if (!res.ok) {
    return { sent: false, channel: "whatsapp", reason: `Twilio ${res.status}` }
  }
  return { sent: true, channel: "whatsapp" }
}

// Preference order. Email first (rich carts need images + buttons);
// messaging apps only when their keys exist AND a phone is known.
export async function sendAbandonment(
  msg: AbandonmentMessage,
  preferred?: Channel
): Promise<SendResult> {
  const order: Channel[] = preferred
    ? [preferred]
    : (["sendgrid", "resend", "whatsapp", "twilio_sms"] as Channel[])

  let last: SendResult = {
    sent: false,
    channel: "none",
    reason: "No channel configured",
  }
  for (const channel of order) {
    try {
      const result =
        channel === "sendgrid"
          ? await viaSendGrid(msg)
          : channel === "resend"
          ? await viaResend(msg)
          : channel === "whatsapp"
          ? await viaWhatsapp(msg)
          : await viaTwilioSms(msg)
      if (result.sent) {
        return result
      }
      last = result
    } catch (e: any) {
      last = { sent: false, channel, reason: e.message?.slice(0, 160) }
    }
  }
  return last
}

export function configuredChannels(): Channel[] {
  const out: Channel[] = []
  if (env("SENDGRID_API_KEY")) out.push("sendgrid")
  if (env("RESEND_API_KEY")) out.push("resend")
  if (env("TWILIO_ACCOUNT_SID") && env("WHATSAPP_FROM")) out.push("whatsapp")
  if (env("TWILIO_ACCOUNT_SID") && env("TWILIO_SMS_FROM")) out.push("twilio_sms")
  return out
}
