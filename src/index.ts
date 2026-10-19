import { Plugin } from "@opencode/plugin/effect"
import { Integration } from "@opencode/schema/integration"
import { Effect } from "effect"
import { fetchUsage } from "./openai.js"
import { UsageRpc } from "./rpc.js"

export default Plugin.define({
  id: "chatgpt-usage",
  effect: (ctx) =>
    Effect.gen(function* () {
      yield* ctx.rpc.register(UsageRpc, {
        read: (_, rpc) =>
          Effect.gen(function* () {
            const integration = yield* ctx.integration.get({ integrationID: Integration.ID.make("openai") }).pipe(
              Effect.mapError(() =>
                rpc.error("not_authenticated", "OpenCode could not read the OpenAI connections.", {}),
              ),
            )
            const credentials = yield* Effect.forEach(integration.data.connections, (connection) =>
              ctx.integration.connection.resolve(connection).pipe(Effect.orElseSucceed(() => undefined)),
            )
            const credential = credentials.find(
              (value) =>
                value?.type === "oauth" &&
                (value.methodID === "chatgpt-browser" || value.methodID === "chatgpt-headless"),
            )

            if (credential?.type !== "oauth") {
              return yield* Effect.fail(
                rpc.error(
                  "not_authenticated",
                  "OpenAI does not expose usage to token-sharing logins. Add a Codex browser or device-code connection.",
                  {},
                ),
              )
            }

            return yield* fetchUsage(credential).pipe(
              Effect.mapError((error) =>
                rpc.error(
                  "request_failed",
                  error._tag === "UsageHttpError"
                    ? error.status === 401
                      ? "OpenAI rejected the saved Codex login. Reconnect the Codex browser or device-code connection."
                      : `OpenAI rejected the usage request with HTTP ${error.status}.`
                    : error._tag === "UsageResponseError"
                      ? "OpenAI returned an unsupported usage response."
                      : "Could not connect to OpenAI's usage service.",
                  {},
                ),
              ),
            )
          }),
      })
    }).pipe(Effect.orDie),
})
