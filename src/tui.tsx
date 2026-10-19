import { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import { useKeyboard } from "@opentui/solid"
import { Effect } from "effect"
import { UsageRpc, type UsageResult } from "./rpc.js"

function percent(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function relativeReset(resetsAt: number) {
  const remainingSeconds = Math.max(0, resetsAt - Math.floor(Date.now() / 1_000))
  const days = Math.floor(remainingSeconds / 86_400)
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600)
  const minutes = Math.floor((remainingSeconds % 3_600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function planName(plan: string) {
  return plan.length === 0 ? "ChatGPT" : plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase()
}

function UsageDialog(props: { context: Context; usage: UsageResult }) {
  const { context, usage } = props
  const theme = () => context.theme.surface("dialog")
  const close = () => context.ui.dialog.clear()

  useKeyboard((event) => {
    if (event.name !== "return" && event.name !== "enter") return
    event.preventDefault()
    event.stopPropagation()
    close()
  })

  return (
    <box flexDirection="column" width="100%">
      <box
        height={2}
        paddingLeft={2}
        paddingRight={2}
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <text fg={theme().text.base} attributes={1}>
          ChatGPT Usage · {planName(usage.plan)}
        </text>
        <text fg={theme().text.muted}>esc</text>
      </box>

      <box
        flexDirection="column"
        backgroundColor={theme().background.raised.base}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        gap={1}
      >
        {usage.windows.length === 0 ? (
          <text fg={theme().text.muted}>OpenAI returned no active usage windows.</text>
        ) : (
          usage.windows.map((window) => (
            <box flexDirection="column">
              <box flexDirection="row" justifyContent="space-between">
                <text fg={theme().text.base} attributes={1}>
                  {window.label}
                </text>
                <text fg={theme().text.base}>{percent(window.remainingPercent)}% remaining</text>
              </box>
              <text fg={theme().text.muted}>
                Resets in {relativeReset(window.resetsAt)} · {new Date(window.resetsAt * 1_000).toLocaleString()}
              </text>
            </box>
          ))
        )}

        {usage.credits ? (
          <box flexDirection="row" justifyContent="space-between">
            <text fg={theme().text.muted}>Credits</text>
            <text fg={theme().text.base}>
              {usage.credits.unlimited ? "Unlimited" : (usage.credits.balance ?? "—")}
            </text>
          </box>
        ) : null}
      </box>

      <box height={3} paddingLeft={2} paddingRight={2} flexDirection="row" justifyContent="flex-end" alignItems="center">
        <box
          height={1}
          paddingLeft={3}
          paddingRight={3}
          justifyContent="center"
          alignItems="center"
          backgroundColor={theme().background.action.primary.focused}
          onMouseUp={close}
        >
          <text fg={theme().text.action.primary.focused}>ok</text>
        </box>
      </box>
    </box>
  )
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return "Could not load ChatGPT usage."
}

export default Plugin.define({
  id: "chatgpt-usage.cli",
  setup(context) {
    const usage = context.client.rpc(UsageRpc)

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "chatgpt-usage.show",
          title: "Show ChatGPT usage",
          group: "OpenAI",
          palette: true,
          suggested: true,
          slash: { name: "usage" },
          run: () =>
            Effect.tryPromise({
              try: () => usage.read({}, { location: context.location ?? context.data.location.default() }),
              catch: (cause) => cause,
            }).pipe(
              Effect.flatMap((result) =>
                Effect.sync(() => {
                  context.ui.dialog.set({ size: "medium", centered: true })
                  context.ui.dialog.show(() => <UsageDialog context={context} usage={result} />)
                }),
              ),
              Effect.catch((error) =>
                Effect.sync(() =>
                  context.ui.toast.show({
                    title: "ChatGPT Usage",
                    message: errorMessage(error),
                    variant: "error",
                  }),
                ),
              ),
              Effect.runPromise,
            ),
        },
      ],
    }))
  },
})
