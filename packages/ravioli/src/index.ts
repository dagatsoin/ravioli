import * as ravioli from './ravioli'

export default {
  ...ravioli
}

if (window) {
  window['$ravioli'] = ravioli
}