import * as ravioli from './ravioli'
import * as Crafter from '@warfog/crafter'

export default {
  ...ravioli,
  ...Crafter
}

if (window) {
  window['$ravioli'] = ravioli
}