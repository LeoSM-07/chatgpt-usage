import { Rpc } from "@opencode/plugin/rpc"
import { Schema } from "effect"

export const UsageWindow = Schema.Struct({
  label: Schema.String,
  usedPercent: Schema.Number,
  remainingPercent: Schema.Number,
  windowMinutes: Schema.Number,
  resetsAt: Schema.Number,
})

const UsageResultSchema = Schema.Struct({
  plan: Schema.String,
  windows: Schema.Array(UsageWindow),
  credits: Schema.NullOr(
    Schema.Struct({
      unlimited: Schema.Boolean,
      balance: Schema.NullOr(Schema.String),
    }),
  ),
})

export const UsageRpc = Rpc.define({
  id: "chatgpt-usage",
  methods: {
    read: {
      input: Schema.toStandardSchemaV1(Schema.Struct({})),
      output: Schema.toStandardSchemaV1(UsageResultSchema),
      errors: {
        not_authenticated: Schema.toStandardSchemaV1(Schema.Struct({})),
        request_failed: Schema.toStandardSchemaV1(Schema.Struct({})),
      },
    },
  },
  events: {},
})

export type UsageResult = typeof UsageResultSchema.Type
