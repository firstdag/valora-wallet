import * as Sentry from '@sentry/react-native'
import BigNumber from 'bignumber.js'
import * as React from 'react'
import { ApolloProvider } from 'react-apollo'
import { Dimensions, Linking, StatusBar, YellowBox } from 'react-native'
import { getNumberFormatSettings } from 'react-native-localize'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { enableScreens } from 'react-native-screens'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { AppEvents } from 'src/analytics/Events'
import ValoraAnalytics from 'src/analytics/ValoraAnalytics'
import { apolloClient } from 'src/apollo/index'
import { appMounted, appUnmounted, openDeepLink } from 'src/app/actions'
import AppLoading from 'src/app/AppLoading'
import ErrorBoundary from 'src/app/ErrorBoundary'
import { isE2EEnv } from 'src/config'
import i18n from 'src/i18n'
import I18nGate from 'src/i18n/I18nGate'
import NavigatorWrapper from 'src/navigator/NavigatorWrapper'
import { waitUntilSagasFinishLoading } from 'src/redux/sagas'
import { persistor, store } from 'src/redux/store'
import Logger from 'src/utils/Logger'

enableScreens()

Logger.debug('App/init', 'Current Language: ' + i18n.language)

const ignoreWarnings = [
  'componentWillReceiveProps',
  'Remote debugger', // To avoid "Remote debugger in background tab" warning
  'cancelTouches', // rn-screens warning on iOS
  'Setting a timer', // warns about long setTimeouts which are actually saga timeouts
]
if (isE2EEnv) {
  ignoreWarnings.push('Overriding previous layout')
}
YellowBox.ignoreWarnings(ignoreWarnings)

const { decimalSeparator, groupingSeparator } = getNumberFormatSettings()

BigNumber.config({
  EXPONENTIAL_AT: 1e9, // toString almost never return exponential notation
  FORMAT: {
    decimalSeparator,
    groupSeparator: groupingSeparator,
  },
})

interface Props {
  appStartedMillis: number
}

// Enables LayoutAnimation on Android. It makes transitions between states smoother.
// https://reactnative.dev/docs/layoutanimation
// Disabling it for now as it seems to cause blank white screens on certain android devices
// if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
//   UIManager.setLayoutAnimationEnabledExperimental(true)
// }

export class App extends React.Component<Props> {
  reactLoadTime: number = Date.now()

  async componentDidMount() {
    await ValoraAnalytics.init()

    Linking.addEventListener('url', this.handleOpenURL)

    const url = await Linking.getInitialURL()
    if (url) {
      await this.handleOpenURL({ url })
    }

    this.logAppLoadTime()

    store.dispatch(appMounted())
  }

  logAppLoadTime() {
    const { appStartedMillis } = this.props
    const reactLoadDuration = (this.reactLoadTime - appStartedMillis) / 1000
    const appLoadDuration = (Date.now() - appStartedMillis) / 1000
    Logger.debug(
      'App/logAppLoadTime',
      `reactLoad: ${reactLoadDuration} appLoad: ${appLoadDuration}`
    )
    const { width, height } = Dimensions.get('window')

    ValoraAnalytics.startSession(AppEvents.app_launched, {
      deviceHeight: height,
      deviceWidth: width,
      reactLoadDuration,
      appLoadDuration,
      language: i18n.language || store.getState().i18n.language,
    })
  }

  componentWillUnmount() {
    Linking.removeEventListener('url', this.handleOpenURL)
    store.dispatch(appUnmounted())
  }

  handleOpenURL = async (event: any) => {
    await waitUntilSagasFinishLoading()
    store.dispatch(openDeepLink(event.url))
  }

  render() {
    return (
      <SafeAreaProvider>
        <ApolloProvider client={apolloClient}>
          <Provider store={store}>
            <PersistGate loading={<AppLoading />} persistor={persistor}>
              <I18nGate loading={<AppLoading />}>
                <StatusBar backgroundColor="transparent" barStyle="dark-content" />
                <ErrorBoundary>
                  <NavigatorWrapper />
                </ErrorBoundary>
              </I18nGate>
            </PersistGate>
          </Provider>
        </ApolloProvider>
      </SafeAreaProvider>
    )
  }
}

export default Sentry.wrap(App)
