import installExtension, { VUEJS3_DEVTOOLS } from 'electron-devtools-installer'

export function registerVueDevTools() {
    installExtension(VUEJS3_DEVTOOLS)
        .then((name) => console.log(`Added Extension:  ${name}`))
        .catch((err) => console.log('An error occurred: ', err))
}
