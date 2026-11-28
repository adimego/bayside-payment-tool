// Emails the admin when a new staff access request is pending.
// Invoked by a database trigger over pg_net. Auth is a shared secret
// header (x-notify-secret), not a user JWT.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const ALERT_TO =
  Deno.env.get("ALERT_TO") ??
  Deno.env.get("ADMIN_EMAIL") ??
  "baysidekg@gmail.com";
const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "baysidekg@gmail.com";
const GMAIL_APP_PASSWORD = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replaceAll(" ", "");
const HOOK_SECRET = Deno.env.get("NOTIFY_PENDING_STAFF_SECRET") ?? "";
const FROM_NAME = "Bayside Pricing Tool";
const ADMIN_URL = "https://adimego.github.io/bayside-payment-tool/#/admin";

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(aa.length, bb.length);
  let out = aa.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    out |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return out === 0;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatEastern(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return iso || "unknown";
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  return formatted;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const provided =
    req.headers.get("x-notify-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (!HOOK_SECRET || !timingSafeEqual(provided, HOOK_SECRET)) {
    return json(401, { error: "unauthorized" });
  }

  if (!GMAIL_APP_PASSWORD) {
    console.error("GMAIL_APP_PASSWORD is not configured");
    return json(500, { error: "email not configured" });
  }

  let body: {
    full_name?: string;
    email?: string;
    phone?: string;
    created_at?: string;
    id?: string;
    test?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }

  const name = (body.full_name || "").trim() || "A staff member";
  const email = (body.email || "").trim() || "not provided";
  const phone = (body.phone || "").trim();
  const when = formatEastern(body.created_at);
  const isTest = Boolean(body.test);
  const subject = isTest
    ? `TEST: Pending staff access request: ${name}`
    : `Pending staff access request: ${name}`;

  const textLines = [
    isTest ? "This is a test of the pending staff request alert." : "",
    `${name} requested staff access to the Bayside pricing tool.`,
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : "",
    `Requested: ${when}`,
    "",
    "Review and approve or deny the request here:",
    ADMIN_URL,
  ].filter((line, index, arr) => line !== "" || (index > 0 && arr[index - 1] !== ""));

  const text = textLines.join("\n");

  const html = `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.5;">
    ${isTest ? "<p><strong>This is a test of the pending staff request alert.</strong></p>" : ""}
    <p>${escapeHtml(name)} requested staff access to the Bayside pricing tool.</p>
    <p>
      <strong>Name:</strong> ${escapeHtml(name)}<br>
      <strong>Email:</strong> ${escapeHtml(email)}
      ${phone ? `<br><strong>Phone:</strong> ${escapeHtml(phone)}` : ""}
      <br><strong>Requested:</strong> ${escapeHtml(when)}
    </p>
    <p>
      <a href="${ADMIN_URL}">Open the admin page to approve or deny this request</a>
    </p>
  </body>
</html>`;

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: {
        username: GMAIL_USER,
        password: GMAIL_APP_PASSWORD,
      },
    },
  });

  try {
    await client.send({
      from: `${FROM_NAME} <${GMAIL_USER}>`,
      to: ALERT_TO,
      subject,
      content: text,
      html,
    });
  } catch (error) {
    console.error("smtp send failed", error instanceof Error ? error.message : "unknown error");
    return json(502, { error: "email send failed" });
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
  }

  console.log(`pending-staff alert sent test=${isTest}`);
  return json(200, { ok: true });
});
