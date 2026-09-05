/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" only in the hosted interface preview build; never set for dev or production. */
  readonly VITE_PREVIEW_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
