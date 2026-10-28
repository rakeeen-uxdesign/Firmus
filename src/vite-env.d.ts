/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The local Discord bot's address (subscription reminders). Defaults to http://localhost:3001. */
  readonly VITE_BACKEND_URL?: string;
  /** Webhook the Pomodoro posts focus start / finish messages to. */
  /** goldapi.io key for the gold spot price. */
  readonly VITE_GOLD_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
