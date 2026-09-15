/// <reference types="vite/client" />
// Needed as soon as anything imports a non-TS asset — `dom.ts` pulls the
// adapter's stylesheet, and without this tsc has no declaration for it.
