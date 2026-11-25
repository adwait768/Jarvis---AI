// Daily 5:00 AM IST phone call via Twilio.
// Required Vercel environment variables (set by the adult account owner):
// MORNING_CALL_ENABLED=true
// MORNING_CALL_TO=+91...
// TWILIO_ACCOUNT_SID=AC...
// TWILIO_AUTH_TOKEN=...
// TWILIO_FROM_NUMBER=+1...
// CRON_SECRET=<long random secret>
//
// GET ?dryRun=1 checks configuration only and never places a call.

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function validE164(value) {
  return typeof value === "string" && /^\+[1-9]\d{7,14}$/.test(value);
}

export async function GET(request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") || "";

  if (!secret || authorization !== `Bearer ${secret}`) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  const config = {
    enabled: process.env.MORNING_CALL_ENABLED === "true",
    toValid: validE164(process.env.MORNING_CALL_TO),
    fromValid: validE164(process.env.TWILIO_FROM_NUMBER),
    accountSidPresent: Boolean(process.env.TWILIO_ACCOUNT_SID),
    authTokenPresent: Boolean(process.env.TWILIO_AUTH_TOKEN)
  };
  const configured = config.toValid && config.fromValid &&
    config.accountSidPresent && config.authTokenPresent;

  if (dryRun) {
    return json(200, { ok: true, mode: "dry-run", configured, enabled: config.enabled, checks: {
      recipientNumberValid: config.toValid,
      callerNumberValid: config.fromValid,
      accountCredentialsPresent: config.accountSidPresent && config.authTokenPresent
    }});
  }

  if (!config.enabled) return json(409, { ok: false, error: "Calling is disabled. Enable it only after the account owner approves the recurring calls and charges." });
  if (!configured) return json(503, { ok: false, error: "Phone-call configuration is incomplete." });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const form = new URLSearchParams({
    To: process.env.MORNING_CALL_TO,
    From: process.env.TWILIO_FROM_NUMBER,
    Twiml: "<Response><Pause length=\"1\"/><Say voice=\"alice\">Good morning. This is your 768 AI. It is 5 AM. Have a good day.</Say></Response>"
  });

  try {
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
      console.error("Twilio call request failed:", response.status, result?.message || "Unknown provider error");
      return json(502, { ok: false, error: "Phone provider rejected the call request.", providerStatus: response.status });
    }
    return json(200, { ok: true, status: "call-requested", callStatus: result.status || "queued" });
  } catch (error) {
    console.error("Twilio request error:", error);
    return json(502, { ok: false, error: "Could not contact the phone provider." });
  }
}
