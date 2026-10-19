import type { Context } from "@opencode/plugin/tui/context"
import { Effect } from "effect"
import { Plugin } from "opentui:runtime-module:%40opencode%2Fplugin%2Ftui"
import { useKeyboard } from "opentui:runtime-module:%40opentui%2Fsolid"
import { jsx, jsxs } from "opentui:runtime-module:%40opentui%2Fsolid%2Fjsx-runtime"
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

  const windows =
    usage.windows.length === 0
      ? [
          jsx("text", {
            get fg() {
              return theme().text.muted
            },
            children: "OpenAI returned no active usage windows.",
          }),
        ]
      : usage.windows.map((window) =>
          jsxs("box", {
            flexDirection: "column",
            children: [
              jsxs("box", {
                flexDirection: "row",
                justifyContent: "space-between",
                children: [
                  jsx("text", {
                    get fg() {
                      return theme().text.base
                    },
                    attributes: 1,
                    children: window.label,
                  }),
                  jsx("text", {
                    get fg() {
                      return theme().text.base
                    },
                    children: `${percent(window.remainingPercent)}% remaining`,
                  }),
                ],
              }),
              jsx("text", {
                get fg() {
                  return theme().text.muted
                },
                children: `Resets in ${relativeReset(window.resetsAt)} · ${new Date(window.resetsAt * 1_000).toLocaleString()}`,
              }),
            ],
          }),
        )

  const credits = usage.credits
    ? jsxs("box", {
        flexDirection: "row",
        justifyContent: "space-between",
        children: [
          jsx("text", {
            get fg() {
              return theme().text.muted
            },
            children: "Credits",
          }),
          jsx("text", {
            get fg() {
              return theme().text.base
            },
            children: usage.credits.unlimited ? "Unlimited" : (usage.credits.balance ?? "—"),
          }),
        ],
      })
    : null

  return jsxs("box", {
    flexDirection: "column",
    width: "100%",
    children: [
      jsxs("box", {
        height: 2,
        paddingLeft: 2,
        paddingRight: 2,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        children: [
          jsx("text", {
            get fg() {
              return theme().text.base
            },
            attributes: 1,
            children: `ChatGPT Usage · ${planName(usage.plan)}`,
          }),
          jsx("text", {
            get fg() {
              return theme().text.muted
            },
            children: "esc",
          }),
        ],
      }),
      jsxs("box", {
        flexDirection: "column",
        get backgroundColor() {
          return theme().background.raised.base
        },
        paddingTop: 1,
        paddingBottom: 1,
        paddingLeft: 2,
        paddingRight: 2,
        gap: 1,
        children: [...windows, credits],
      }),
      jsx("box", {
        height: 3,
        paddingLeft: 2,
        paddingRight: 2,
        flexDirection: "row",
        justifyContent: "flex-end",
        alignItems: "center",
        get children() {
          return jsx("box", {
            height: 1,
            paddingLeft: 3,
            paddingRight: 3,
            justifyContent: "center",
            alignItems: "center",
            get backgroundColor() {
              return theme().background.action.primary.focused
            },
            onMouseUp: close,
            get children() {
              return jsx("text", {
                get fg() {
                  return theme().text.action.primary.focused
                },
                children: "ok",
              })
            },
          })
        },
      }),
    ],
  })
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
                  context.ui.dialog.show(() => UsageDialog({ context, usage: result }))
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
