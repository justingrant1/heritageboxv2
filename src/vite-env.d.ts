
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SQUARE_APP_ID: string;
  readonly VITE_SQUARE_LOCATION_ID: string;
  readonly VITE_SQUARE_ENVIRONMENT: string;
  // add other env variables here...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    Tawk_API?: {
      onLoad?: () => void;
    };
  }
}
