// Build-time stand-in for Google Fonts, so the sandbox image builds without reaching fonts.googleapis.com.
// The sandbox then shows system fonts. Not used by a normal deployment.
const css = "/* latin */\n@font-face {\n  font-family: 'Mock';\n  font-style: normal;\n  font-weight: 400;\n  font-display: swap;\n  src: url(https://fonts.gstatic.com/s/mock/v1/mock.woff2) format('woff2');\n  unicode-range: U+0000-00FF;\n}\n"
module.exports = new Proxy({}, { get: () => css })
