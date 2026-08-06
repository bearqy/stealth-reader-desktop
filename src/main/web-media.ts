export const HIDDEN_WEB_MEDIA_CSS = `
  img,
  picture,
  video,
  canvas,
  object[type^="video/"],
  embed[type^="video/"] {
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  *,
  *::before,
  *::after {
    background-image: none !important;
  }
`

export const TEXT_ONLY_WEB_CSS = `
  :root,
  html,
  body,
  *,
  *::before,
  *::after {
    background-color: transparent !important;
    background-image: none !important;
    border-color: transparent !important;
    box-shadow: none !important;
    outline-color: transparent !important;
    text-shadow: none !important;
  }

  *::before,
  *::after {
    content: none !important;
    display: none !important;
    background: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
  }

  body,
  body *,
  body *::before,
  body *::after {
    color: #26372e !important;
  }

  a,
  a * {
    color: #3f6f54 !important;
    text-decoration-color: currentColor !important;
  }

  img,
  picture,
  video,
  canvas,
  svg,
  iframe,
  object,
  embed {
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  input,
  textarea,
  select,
  button {
    appearance: none !important;
    background: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
  }
`

export const TRANSPARENT_WEB_CHROME_CSS = `
  ::-webkit-scrollbar,
  ::-webkit-scrollbar-track,
  ::-webkit-scrollbar-thumb,
  ::-webkit-scrollbar-corner {
    background: transparent !important;
    background-color: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
  }
`
