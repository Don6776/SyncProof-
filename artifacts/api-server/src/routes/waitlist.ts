import { Router } from "express";
import { db, waitlistApplications } from "@workspace/db";

const router = Router();

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  if (!result || result.length > maxLength) return null;
  return result;
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  let current: unknown = error;

  for (let depth = 0; depth < 5; depth++) {
    if (typeof current !== "object" || current === null) return undefined;

    const record = current as {
      code?: unknown;
      cause?: unknown;
    };

    if (typeof record.code === "string") return record.code;
    current = record.cause;
  }

  return undefined;
}

router.post("/", async (req, res) => {
  const body: unknown = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      error: "Please provide valid application information.",
    });
  }

  const input = body as Record<string, unknown>;

  const name = readText(input.name, 120);
  const email = readText(input.email, 320)?.toLowerCase();
  const role = readText(input.role, 80);
  const reconciliationMethod = readText(input.reconciliationMethod, 500);
  const monthlyInvoiceVolume = readText(input.monthlyInvoiceVolume, 80);

  if (!name || !email || !role || !reconciliationMethod || !monthlyInvoiceVolume) {
    return res.status(400).json({
      error: "Please complete all required fields.",
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      error: "Please provide a valid email address.",
    });
  }

  try {
    const [application] = await db
      .insert(waitlistApplications)
      .values({
        name,
        email,
        role,
        reconciliationMethod,
        monthlyInvoiceVolume,
      })
      .returning({
        id: waitlistApplications.id,
      });

    return res.status(201).json({
      message: "Your application has been received.",
      applicationId: application.id,
    });
  } catch (error) {
    const databaseCode = getDatabaseErrorCode(error);

    if (databaseCode === "23505") {
      return res.status(409).json({
        error: "An application with this email already exists.",
      });
    }

    console.error("Waitlist submission failed:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      databaseCode: databaseCode ?? "unavailable",
    });

    return res.status(500).json({
      error: "We couldn't process your application. Please try again.",
    });
  }
});

export default router;
