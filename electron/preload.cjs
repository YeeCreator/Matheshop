const { contextBridge } = require('electron')

// Keep this minimal. Add APIs here when you truly need native capabilities.
contextBridge.exposeInMainWorld('matheshop', {
  platform: process.platform,
})

