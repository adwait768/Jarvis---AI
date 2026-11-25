// Daily 5:00 AM IST phone call via Twilio.
// Vercel Cron sends Authorization: Bearer <CRON_SECRET> automatically.
// GET ?dryRun=1 checks configuration only and never places a call.

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function validE164(value) {
  return typeof value === "string" && /^\\+[1-9]\\d{7,14}$/.test(value);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }

  try {
    const secret = (process.env.CRON_SECRET || "").trim();
    const authorization = String(req.headers?.authorization || "").trim();
    if (!secret || authorization !== `Bearer ${secret}`) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" });
    }

    const requestUrl = new URL(req.url || "/api/morning-call", `https://${req.headers?.host || "localhost"}`);
    const dryRun = requestUrl.searchParams.get("dryRun") === "1";

    const config = {
      enabled: process.env.MORNING_CALL_ENABLED === "true",
      toValid: validE164(process.env.MORNING_CALL_TO),
      fromValid: validE164(process.env.TWILIO_FROM_NUMBER),
      accountSidPresent: Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()),
      authTokenPresent: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim())
    };
    const configured = config.toValid && config.fromValid &&
      config.accountSidPresent && config.authTokenPresent;

    if (dryRun) {
      return sendJson(res, 200, {
        ok: true,
        mode: "dry-run",
        configured,
        enabled: config.enabled,
        checks: {
          recipientNumberValid: config.toValid,
          callerNumberValid: config.fromValid,
          accountCredentialsPresent: config.accountSidPresent && config.authTokenPresent
        }
      });
    }

    if (!config.enabled) {
      return sendJson(res, 409, { ok: false, error: "Calling is disabled." });
    }
    if (!configured) {
      return sendJson(res, 503, { ok: false, error: "Phone-call configuration is incomplete." });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN.trim();
    const form = new URLSearchParams({
      To: process.env.MORNING_CALL_TO.trim(),
      From: process.env.TWILIO_FROM_NUMBER.trim(),
      Twiml: '<Response><Pause length="1"/><Say voice="alice">Good morning. This is your 768 AI. It is 5 AM. Have a good day.</Say></Response>'
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls.json`,
      {
        method: "POST",
        headers: {
          "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: form.toString()
      }
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Twilio call request rejected:", response.status, result?.code || "unknown", result?.message || "no message");
      return sendJson(res, 502, {
        ok: false,
        error: "Twilio rejected the call request.",
        providerStatus: response.status,
        providerCode: result?.code || null
      });
    }

    console.log("Twilio call accepted:", result.sid, result.status);
    return sendJson(res, 200, {
      ok: true,
      status: "call-requested",
      callStatus: result.status || "queued"
    });
  } catch (error) {
    console.error("Morning-call handler failed:", error?.stack || error);
    return sendJson(res, 500, { ok: false, error: "Morning-call function failed." });
  }
}
