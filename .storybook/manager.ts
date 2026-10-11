import { addons } from '@storybook/manager-api'

// The toolbar keeps only Surface, Theme, Frame and Width (and full screen), so it
// fits a narrow window without scrolling sideways.
addons.setConfig({
  toolbar: {
    zoom: { hidden: true },
    remount: { hidden: true },
    eject: { hidden: true },
    copy: { hidden: true },
  },
})
