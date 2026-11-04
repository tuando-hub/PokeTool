# PokeTool Unified Logs

Use `Core.addLog(message, level)` with levels `info`, `success`, `warn`, `error`, `wait`, `debug`.

Technical frame JSON, selectors and periodic heartbeat logs should use `Core.debugLog(message)`. They are hidden by default. To enable them programmatically: `Core.setDebugLogs(true)`; disable with `Core.setDebugLogs(false)`. This flag is in-memory only and resets at restart.

UI displays a compact time + severity icon + message. Repeated identical non-warning messages within 3 seconds are suppressed.

Premium Lottery now emits concise state changes and clipboard detection; per-poll details are DEBUG only. The polling behavior remains unchanged.
