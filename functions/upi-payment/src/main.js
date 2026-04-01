import { ID } from "node-appwrite";

const DATABASE_ID = "openget-db";
const PLATFORM_FEE_RATE = 0.01;

/** In-memory stub store for QR payment status (replace with DB in production). */
const stubStore = new Map();

function parseBody(req) {
  if (req.body == null || req.body === "") return {};
  if (typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  try {
    return JSON.parse(String(req.body));
  } catch {
    return {};
  }
}

function getQueryParam(req, key) {
  if (req.query && typeof req.query === "object" && req.query[key] != null) {
    return String(req.query[key]);
  }
  const qs = typeof req.path === "string" && req.path.includes("?") ? req.path.split("?")[1] : "";
  if (qs) {
    const params = new URLSearchParams(qs);
    const v = params.get(key);
    if (v) return v;
  }
  return null;
}

export default async ({ req, res, log, error }) => {
  try {
    const method = (req.method || "GET").toUpperCase();

    if (method === "GET") {
      const qr_id = getQueryParam(req, "qr_id");
      if (!qr_id) {
        return res.json({ error: "qr_id query parameter is required" }, 400);
      }
      const row = stubStore.get(qr_id);
      if (!row) {
        return res.json({ error: "Unknown qr_id" }, 404);
      }
      return res.json({
        qr_id,
        status: row.status,
        amount_paisa: row.amount_paisa,
        message: row.message,
        created_at: row.created_at,
      });
    }

    if (method === "POST") {
      const body = parseBody(req);
      const { amount_paisa, message = null } = body;
      if (amount_paisa == null || Number(amount_paisa) <= 0) {
        return res.json({ error: "amount_paisa is required and must be positive" }, 400);
      }

      const qr_id = ID.unique();
      const created_at = new Date().toISOString();

      /**
       * Stub: Razorpay or other UPI QR APIs would be called here.
       * Returns a placeholder payload suitable for UI development.
       */
      const record = {
        status: "pending",
        amount_paisa: Number(amount_paisa),
        message: message != null ? String(message).slice(0, 500) : null,
        created_at,
        upi_uri: `upi://pay?pa=merchant@upi&am=${(Number(amount_paisa) / 100).toFixed(2)}&cu=INR&tn=OpenGet`,
        qr_image_url: null,
        note: "Stub implementation — configure Razorpay or bank UPI QR to go live.",
      };

      stubStore.set(qr_id, record);
      log(`Stub UPI QR created ${qr_id}`);

      return res.json({
        qr_id,
        ...record,
      });
    }

    return res.json({ error: "Method not allowed" }, 405);
  } catch (e) {
    error(e.message || String(e));
    return res.json({ error: e.message || "Internal error" }, 500);
  }
};
