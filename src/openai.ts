import type { Credential } from "@opencode/schema/credential"
import { Effect, Option, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http"
import type { UsageResult } from "./rpc.js"

const usageUrl = "https://chatgpt.com/backend-api/wham/usage"

const Claims = Schema.fromJsonString(
  Schema.Struct({
    chatgpt_account_id: Schema.optional(Schema.String),
    organizations: Schema.optional(Schema.Array(Schema.Struct({ id: Schema.String }))),
    "https://api.openai.com/auth": Schema.optional(
      Schema.Struct({ chatgpt_account_id: Schema.optional(Schema.String) }),
    ),
  }),
)
const decodeClaims = Schema.decodeUnknownOption(Claims)

const RateLimitWindow = Schema.Struct({
  used_percent: Schema.Number,
  limit_window_seconds: Schema.Number,
  reset_after_seconds: Schema.Number,
  reset_at: Schema.Number,
})

const RateLimit = Schema.Struct({
  primary_window: Schema.NullOr(RateLimitWindow),
  secondary_window: Schema.NullOr(RateLimitWindow),
})

const Credits = Schema.Struct({
  unlimited: Schema.Boolean,
  balance: Schema.optional(Schema.NullOr(Schema.String)),
})

const UsagePayload = Schema.Struct({
  plan_type: Schema.String,
  rate_limit: Schema.optional(Schema.NullOr(RateLimit)),
  credits: Schema.optional(Schema.NullOr(Credits)),
})

type RateLimitWindow = typeof RateLimitWindow.Type

export class UsageHttpError extends Schema.TaggedError<UsageHttpError>()("UsageHttpError", {
  status: Schema.Number,
}) {}

export class UsageResponseError extends Schema.TaggedError<UsageResponseError>()("UsageResponseError", {}) {}

export class UsageNetworkError extends Schema.TaggedError<UsageNetworkError>()("UsageNetworkError", {}) {}

export type UsageFetchError = UsageHttpError | UsageResponseError | UsageNetworkError

function accountID(credential: Credential.OAuth) {
  const metadata = credential.metadata
  const saved = metadata?.accountID ?? metadata?.accountId
  if (typeof saved === "string" && saved.length > 0) return saved

  const payload = credential.access.split(".")[1]
  if (!payload) return undefined
  const claims = Option.getOrUndefined(decodeClaims(Buffer.from(payload, "base64url").toString()))
  return (
    claims?.chatgpt_account_id ??
    claims?.["https://api.openai.com/auth"]?.chatgpt_account_id ??
    claims?.organizations?.[0]?.id
  )
}

function labelForWindow(seconds: number) {
  const minutes = Math.ceil(seconds / 60)
  if (minutes === 300) return "5-hour limit"
  if (minutes === 1_440) return "Daily limit"
  if (minutes === 10_080) return "Weekly limit"
  return `${minutes}-minute limit`
}

function normalizeWindow(window: RateLimitWindow) {
  const usedPercent = Math.min(100, Math.max(0, window.used_percent))
  return {
    label: labelForWindow(window.limit_window_seconds),
    usedPercent,
    remainingPercent: 100 - usedPercent,
    windowMinutes: Math.ceil(window.limit_window_seconds / 60),
    resetsAt: window.reset_at,
  }
}

export function fetchUsage(credential: Credential.OAuth): Effect.Effect<UsageResult, UsageFetchError> {
  const account = accountID(credential)
  const headers: Record<string, string> = {
    authorization: `Bearer ${credential.access}`,
    accept: "application/json",
    "user-agent": "codex-cli",
  }
  if (account) headers["chatgpt-account-id"] = account

  return Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.get(usageUrl, { headers }).pipe(
      Effect.mapError(() => new UsageNetworkError()),
    )
    if (response.status < 200 || response.status >= 300) {
      return yield* new UsageHttpError({ status: response.status })
    }
    const payload = yield* HttpClientResponse.schemaBodyJson(UsagePayload)(response).pipe(
      Effect.mapError(() => new UsageResponseError()),
    )
    const windows = [payload.rate_limit?.primary_window, payload.rate_limit?.secondary_window]
      .filter((window): window is RateLimitWindow => window !== null && window !== undefined)
      .map(normalizeWindow)

    return {
      plan: payload.plan_type,
      windows,
      credits: payload.credits
        ? {
            unlimited: payload.credits.unlimited,
            balance: payload.credits.balance ?? null,
          }
        : null,
    }
  }).pipe(Effect.provide(FetchHttpClient.layer))
}
