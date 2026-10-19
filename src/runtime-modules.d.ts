declare module "opentui:runtime-module:%40opencode%2Fplugin%2Ftui" {
  export const Plugin: typeof import("@opencode/plugin/tui").Plugin
}

declare module "opentui:runtime-module:%40opentui%2Fsolid" {
  export const useKeyboard: typeof import("@opentui/solid").useKeyboard
}

declare module "opentui:runtime-module:%40opentui%2Fsolid%2Fjsx-runtime" {
  export const jsx: typeof import("@opentui/solid/jsx-runtime").jsx
  export const jsxs: typeof import("@opentui/solid/jsx-runtime").jsxs
}
