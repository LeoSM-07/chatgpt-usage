import { Command, Plugin, Slot, Style, createKeyed } from "@opencode/plugin/gui"
import type { LocationRef } from "@opencode/client"
import { For, Show, createEffect, createResource, createSignal, onCleanup } from "solid-js"
import { UsageRpc, type UsageResult } from "./rpc.js"

const cacheDuration = 60_000

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

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return "Could not load ChatGPT usage."
}

const styles = `
  .chatgpt-usage { display: flex; min-width: 22rem; flex-direction: column; gap: 1rem; }
  .chatgpt-usage__loading { display: flex; min-height: 8rem; align-items: center; justify-content: center; }
  .chatgpt-usage__window { display: flex; flex-direction: column; gap: 0.375rem; }
  .chatgpt-usage__row { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
  .chatgpt-usage__footer { align-items: center; justify-content: flex-end; }
  .chatgpt-usage__label { font-weight: 600; }
  .chatgpt-usage__muted { opacity: 0.65; font-size: 0.875rem; }
  .chatgpt-usage__track { height: 0.375rem; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, currentColor 12%, transparent); }
  .chatgpt-usage__bar { height: 100%; border-radius: inherit; background: currentColor; opacity: 0.7; }
  .chatgpt-usage__credits { border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent); padding-top: 1rem; }
  .chatgpt-usage__error { max-width: 28rem; }
`

export default Plugin.define({
  i18n: {
    en: {
      "command.show": "Show ChatGPT usage",
      "dialog.title": "ChatGPT Usage",
      "dialog.close": "Close",
      "dialog.refresh": "Refresh",
      "titlebar.label": "Limits",
      "titlebar.remaining": "ChatGPT limits: {{remaining}}% remaining",
      "usage.remaining": "remaining",
      "usage.resets": "Resets in",
      "usage.empty": "OpenAI returned no active usage windows.",
      "usage.credits": "Credits",
      "usage.unlimited": "Unlimited",
    },
  },
  setup(ctx) {
    const ui = ctx.ui
    const cache = new Map<
      string,
      { value?: UsageResult; loadedAt?: number; pending?: Promise<UsageResult> }
    >()
    const [cacheRevision, setCacheRevision] = createSignal(0)
    const changed = () => setCacheRevision((revision) => revision + 1)

    const cacheKey = (location?: LocationRef) =>
      location ? `${location.directory}\0${location.workspaceID ?? ""}` : "default"

    const cachedUsage = (location?: LocationRef) => cache.get(cacheKey(location))?.value

    const loadUsage = (location?: LocationRef, force = false): Promise<UsageResult> => {
      const key = cacheKey(location)
      const cached = cache.get(key)

      if (!force && cached?.value && cached.loadedAt && Date.now() - cached.loadedAt < cacheDuration) {
        return Promise.resolve(cached.value)
      }
      if (cached?.pending) {
        return force ? cached.pending.then(() => loadUsage(location, true)) : cached.pending
      }

      const client = ctx.client.rpc(UsageRpc)
      const pending = (location ? client.read({}, { location }) : client.read({})).then(
        (value) => {
          cache.set(key, { value, loadedAt: Date.now() })
          changed()
          return value
        },
        (error) => {
          cache.set(key, { value: cached?.value, loadedAt: cached?.loadedAt })
          changed()
          throw error
        },
      )

      cache.set(key, { ...cached, pending })
      changed()
      return pending
    }

    createEffect(() => {
      const location = ctx.sessions.current()?.location
      void loadUsage(location).catch(() => undefined)
    })

    createKeyed(
      () => ctx.servers.get("sidecar")?.data,
      (data) =>
        onCleanup(
          data.on("session.execution.succeeded", (event) => {
            const location =
              event.location ?? ctx.sessions.list().find((session) => session.id === event.data.sessionID)?.location

            void loadUsage(location, true).catch(() => undefined)
          }),
        ),
    )

    function UsageDialog(props: { close: () => void }) {
      const location = ctx.sessions.current()?.location
      const key = cacheKey(location)
      const [usage, { refetch }] = createResource(() => loadUsage(location), {
        initialValue: cachedUsage(location),
      })

      const refresh = () => {
        cache.delete(key)
        changed()
        void refetch()
      }

      const footer = () => (
        <div class="chatgpt-usage__row chatgpt-usage__footer">
          <ui.Tooltip value={ctx.t("dialog.refresh")}>
            <ui.IconButton
              icon="outline-rotate-clockwise"
              label={ctx.t("dialog.refresh")}
              variant="neutral"
              busy={usage.loading}
              onClick={refresh}
            />
          </ui.Tooltip>
          <ui.Button variant="contrast" onClick={props.close} autofocus>
            {ctx.t("dialog.close")}
          </ui.Button>
        </div>
      )

      return (
        <ui.Dialog
          title={usage() ? `${ctx.t("dialog.title")} · ${planName(usage()!.plan)}` : ctx.t("dialog.title")}
          footer={footer()}
        >
          <Show
            when={usage()}
            fallback={
              <Show
                when={usage.error}
                fallback={
                  <div class="chatgpt-usage__loading">
                    <ui.Loader size="large" />
                  </div>
                }
              >
                <div class="chatgpt-usage__error">{errorMessage(usage.error)}</div>
              </Show>
            }
          >
            <UsageContent usage={usage()!} />
          </Show>
        </ui.Dialog>
      )
    }

    function UsageContent(props: { usage: UsageResult }) {
      return (
        <div class="chatgpt-usage">
          <Show when={props.usage.windows.length > 0} fallback={<div class="chatgpt-usage__muted">{ctx.t("usage.empty")}</div>}>
            <For each={props.usage.windows}>
              {(window) => (
                <div class="chatgpt-usage__window">
                  <div class="chatgpt-usage__row">
                    <span class="chatgpt-usage__label">{window.label}</span>
                    <span>
                      {percent(window.remainingPercent)}% {ctx.t("usage.remaining")}
                    </span>
                  </div>
                  <div class="chatgpt-usage__track">
                    <div
                      class="chatgpt-usage__bar"
                      style={{ width: `${Math.min(100, Math.max(0, window.remainingPercent))}%` }}
                    />
                  </div>
                  <div class="chatgpt-usage__muted">
                    {ctx.t("usage.resets")} {relativeReset(window.resetsAt)} · {new Date(window.resetsAt * 1_000).toLocaleString()}
                  </div>
                </div>
              )}
            </For>
          </Show>
          <Show when={props.usage.credits}>
            <div class="chatgpt-usage__row chatgpt-usage__credits">
              <span class="chatgpt-usage__muted">{ctx.t("usage.credits")}</span>
              <span>
                {props.usage.credits!.unlimited
                  ? ctx.t("usage.unlimited")
                  : (props.usage.credits!.balance ?? "—")}
              </span>
            </div>
          </Show>
        </div>
      )
    }

    function openUsageDialog() {
      ctx.dialogs.open((dialog) => <UsageDialog close={dialog.close} />)
    }

    function UsageIndicator(props: { readonly location?: LocationRef }) {
      const entry = () => {
        cacheRevision()
        return cache.get(cacheKey(props.location))
      }
      const remaining = () => {
        const windows = entry()?.value?.windows
        return windows?.length ? Math.min(...windows.map((window) => window.remainingPercent)) : undefined
      }
      const label = () => {
        const value = remaining()
        return value === undefined ? ctx.t("titlebar.label") : `${percent(value)}%`
      }
      const title = () => {
        const value = remaining()
        return value === undefined
          ? ctx.t("command.show")
          : ctx.t("titlebar.remaining", { remaining: percent(value) })
      }

      return (
        <ui.Tooltip value={title()}>
          <ui.Button
            variant="ghost-muted"
            size="small"
            icon={remaining() !== undefined && remaining()! <= 20 ? "warning" : "status"}
            busy={!!entry()?.pending}
            onClick={openUsageDialog}
          >
            {label()}
          </ui.Button>
        </ui.Tooltip>
      )
    }

    ctx.add(Style, styles)
    ctx.add(Slot, {
      at: "session.header",
      order: 100,
      render: (input) => <UsageIndicator location={input.session.location} />,
    })
    ctx.add(Command, () => ({
      id: "show",
      title: ctx.t("command.show"),
      group: "OpenAI",
      slash: { name: "limits" },
      suggested: true,
      run: openUsageDialog,
    }))
  },
})
