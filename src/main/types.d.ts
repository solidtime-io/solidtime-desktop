// Vite's ?raw suffix imports a file as a string. This is used by the KDE
// Wayland activity backend to inline its KWin scripts into the main bundle
// at build time. electron-vite's own ambient type declarations don't cover
// ?raw imports, so we declare the pattern locally.
declare module '*?raw' {
    const src: string
    export default src
}
