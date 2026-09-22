import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

const WaitlistSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  xHandle: z.string().trim().max(100).optional(),
});

const submissionsByIp = new Map<string, number>();
let rateLimitWindow = 0;

function checkRateLimit(ip: string, reply: FastifyReply): void {
  const window = Math.floor(Date.now() / 60000);
  if (window !== rateLimitWindow) {
    submissionsByIp.clear();
    rateLimitWindow = window;
  }

  const count = submissionsByIp.get(ip) ?? 0;
  if (count >= 3) {
    reply.header("Retry-After", "60");
    throw { statusCode: 429, message: "Please wait before trying again." };
  }
  submissionsByIp.set(ip, count + 1);
}

export async function registerWaitlistRoutes(
  app: FastifyInstance,
  dataDir: string,
): Promise<void> {
  const waitlistDir = join(dataDir, "waitlist");
  await mkdir(waitlistDir, { recursive: true });

  app.post(
    "/api/waitlist",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ip = request.ip;
      checkRateLimit(ip, reply);

      const origin = request.headers.origin;
      const expectedOrigin = process.env.PUBLIC_SITE_URL || "http://localhost:3478";
      if (origin !== new URL(expectedOrigin).origin) {
        return reply.code(403).send({ error: "Invalid origin" });
      }

      let data;
      try {
        data = WaitlistSchema.parse(request.body);
      } catch {
        return reply.code(400).send({ error: "Invalid input" });
      }

      const timestamp = new Date().toISOString();
      const entry = JSON.stringify({
        email: data.email,
        xHandle: data.xHandle || null,
        timestamp,
        ip,
      });

      try {
        const logFile = join(waitlistDir, "entries.jsonl");
        await appendFile(logFile, entry + "\n", "utf8");
        app.log.info({ email: data.email, xHandle: data.xHandle }, "Waitlist submission");
        return reply.send({ success: true });
      } catch (error) {
        app.log.error({ error }, "Failed to save waitlist entry");
        return reply.code(500).send({ error: "Failed to save entry" });
      }
    },
  );
}
