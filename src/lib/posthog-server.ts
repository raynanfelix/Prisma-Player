import "server-only";
import { PostHog } from "posthog-node";

type PostHogLike = Pick<PostHog, "capture" | "flush">;

class NoopPostHog implements PostHogLike {
  capture() {}
  async flush() { return undefined; }
}

let posthogClient: PostHog | NoopPostHog | null = null;

export function getPostHogClient(): PostHogLike {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
  if (!token) return new NoopPostHog();
  if (!posthogClient) {
    posthogClient = new PostHog(token, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}
