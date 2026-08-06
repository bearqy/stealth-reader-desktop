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
