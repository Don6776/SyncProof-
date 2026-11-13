import { Router, type RequestHandler } from "express";
import {
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { db, waitlistApplications } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router = Router();

const COOKIE_NAME = "__Host-syncproof_admin";
const SESSION_DURATION = 8 * 60 * 60 * 1000;

function getSecrets() {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!password || !secret || secret.length < 32) {
    throw new Error("Admin authentication is not configured correctly.");
  }

  return { password, secret };
}

function safeCompare(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(value)
    .digest("base64url");
}

function createSession(secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      expires: Date.now() + SESSION_DURATION,
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");

  return `${payload}.${sign(payload, secret)}`;
}

function getCookie(req: Parameters<RequestHandler>[0]): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  const item = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));

  return item?.slice(COOKIE_NAME.length + 1);
}

function isValidSession(token: string | undefined, secret: string): boolean {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payload, signature] = parts;

  if (!payload || !signature) return false;

  const expected = sign(payload, secret);

  if (!safeCompare(signature, expected)) return false;

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { expires?: unknown };

    return (
      typeof decoded.expires === "number" &&
      decoded.expires > Date.now()
    );
  } catch {
    return false;
  }
}

function setSessionCookie(res: Parameters<RequestHandler>[1], token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: SESSION_DURATION,
  });
}

function clearSessionCookie(res: Parameters<RequestHandler>[1]) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });
}

const requireAdmin: RequestHandler = (req, res, next) => {
  try {
    const { secret } = getSecrets();

    if (!isValidSession(getCookie(req), secret)) {
      res.status(401).json({
        error: "Admin authentication required.",
      });
      return;
    }

    next();
  } catch {
    res.status(503).json({
      error: "Admin authentication is not configured.",
    });
    return;
  }
};

router.post("/login", (req, res) => {
  try {
    const { password, secret } = getSecrets();
    const submitted =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!safeCompare(submitted, password)) {
      return res.status(401).json({ error: "Invalid admin credentials." });
    }

    const token = createSession(secret);
    setSessionCookie(res, token);

    return res.json({ message: "Admin login successful." });
  } catch {
    return res.status(503).json({
      error: "Admin authentication is not configured.",
    });
  }
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  return res.json({ message: "Logged out." });
});

router.get("/session", requireAdmin, (_req, res) => {
  return res.json({ authenticated: true });
});

router.get("/applications", requireAdmin, async (_req, res) => {
  try {
    const applications = await db
      .select()
      .from(waitlistApplications)
      .orderBy(desc(waitlistApplications.createdAt))
      .limit(200);

    return res.json({ applications });
  } catch {
    return res.status(500).json({
      error: "Could not load applications.",
    });
  }
});

router.patch("/applications/:id/status", requireAdmin, async (req, res) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const status = req.body?.status;

  if (
    !id ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return res.status(400).json({ error: "Invalid application ID." });
  }

  if (status !== "approved" && status !== "rejected" && status !== "pending") {
    return res.status(400).json({ error: "Invalid application status." });
  }

  try {
    const [application] = await db
      .update(waitlistApplications)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(waitlistApplications.id, id))
      .returning({
        id: waitlistApplications.id,
        status: waitlistApplications.status,
      });

    if (!application) {
      return res.status(404).json({ error: "Application not found." });
    }

    return res.json({ application });
  } catch {
    return res.status(500).json({
      error: "Could not update application status.",
    });
  }
});

export default router;
