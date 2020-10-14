export const isMobileBrowser = () => {
  // Check my self as agent
  let a = navigator.userAgent || navigator.vendor || (window as any).opera
  return /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))
}

export const cnsl = {
  log: (...args: any) => {
    window && window.cnsl_debug && window.console && console.log.apply(console, args)
  },
  warn: (...args: any) => {
    window && window.cnsl_debug && window.console && console.warn.apply(console, args)
  },
  error: (...args: any) => {
    window && window.cnsl_debug && window.console && console.error.apply(console, args)
  },
  info: (...args: any) => {
    window && window.cnsl_debug && window.console && console.info.apply(console, args)
  }
}

export default interface CancellablePromise<T> extends Promise<T> {
  cancel(): void
}

export type Resolver<T> = (o?: T) => void
export type Rejector = (error?: Error) => void
export type Canceller = (callme?: () => void) => void
export type Executor<T> = (resolver: Resolver<T>, rejector: Rejector, defineCanceller: Canceller) => void

export const cancellable = <T> (executor: Executor<T>): CancellablePromise<T> => {
  let o: CancellablePromise<T>|null = null
  let canceller: () => void = () => {}
  let promise: Promise<T> = new Promise<T>((resolver, reject) => {
    return executor(resolver, reject, (callme?: () => void) => {
      canceller = () => {
        o = null
        callme && callme()
      }
    })
  })
  o = promise as any
  o!.cancel = canceller
  return o!
}

export const supportGetUserMedia = (): boolean => {
  // has navigator
  // also ...
  // = has .mediaDevices && .mediaDevices.getUserMedia
  // or ...
  // = has .getUserMedia
  return navigator && (navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia || !!navigator.getUserMedia)
}

/**
 * Query user media stream from navigator object.
 * 
 * @param constraints 
 */
export const getUserMedia = async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
  if (!navigator) {
    throw new Error('Your browser does not support getUserMedia API.')
  }
  // if there is mediaDevices API.
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
      cnsl.error('Failed to getUserMedia(', error, ')')
      throw error
    }
  }
  return new Promise((resolve, reject) => {
    if (navigator.getUserMedia) {
      navigator.getUserMedia(constraints, resolve, reject)
    } else {
      reject(new Error('Your browser does not support getUserMedia API.'))
    }
  })
}

/**
 * Query user media stream from navigator object.
 * 
 * @param constraints 
 */
export const getDisplayMedia = async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
  // https://github.com/microsoft/TypeScript/issues/33232
  const mediaDevices = navigator.mediaDevices as any
  if (mediaDevices && mediaDevices.getDisplayMedia) {
    try {
      return await mediaDevices.getDisplayMedia(constraints)
    } catch (error) {
      cnsl.error('Failed to getUserMedia(', error, ')')
      throw error
    }
  }
  
  throw new Error('Your browser does not support getDisplayMedia API.')
}

/**
 * Query browser for Camera device based on given constraints
 * 
 * @param constraints 
 */
export const queryForCamera = async (constraints: MediaStreamConstraints): Promise<boolean> => {
  if (navigator && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter(o => /video/.test(o.kind)).length > 0
  }
  const media = await getUserMedia(constraints)
  if (media) {
    const m = media as any
    if (m.stop) { m.stop() }
    else {
      media.getTracks().forEach(t => t.stop())
    }
    return true
  }
  return false
}

/**
 * Resolve reason as readable string.
 * 
 * @see https://tools.ietf.org/html/rfc6455#section-7.4.1
 * @param event CloseEvent
 */
const closeReason = (event: CloseEvent): string => {
  if (event.code == 1000)
    return "Normal closure, meaning that the purpose for which the connection was established has been fulfilled."
  else if(event.code == 1001)
    return "An endpoint is \"going away\", such as a server going down or a browser having navigated away from a page."
  else if(event.code == 1002)
    return "An endpoint is terminating the connection due to a protocol error"
  else if(event.code == 1003)
    return "An endpoint is terminating the connection because it has received a type of data it cannot accept (e.g., an endpoint that understands only text data MAY send this if it receives a binary message)."
  else if(event.code == 1004)
    return "Reserved. The specific meaning might be defined in the future."
  else if(event.code == 1005)
    return "No status code was actually present."
  else if(event.code == 1006)
    return "The connection was closed abnormally, e.g., without sending or receiving a Close control frame"
  else if(event.code == 1007)
    return "An endpoint is terminating the connection because it has received data within a message that was not consistent with the type of the message (e.g., non-UTF-8 [http://tools.ietf.org/html/rfc3629] data within a text message)."
  else if(event.code == 1008)
    return "An endpoint is terminating the connection because it has received a message that \"violates its policy\". This reason is given either if there is no other sutible reason, or if there is a need to hide specific details about the policy."
  else if(event.code == 1009)
    return "An endpoint is terminating the connection because it has received a message that is too big for it to process."
  else if(event.code == 1010) // Note that this status code is not used by the server, because it can fail the WebSocket handshake instead.
    return "An endpoint (client) is terminating the connection because it has expected the server to negotiate one or more extension, but the server didn't return them in the response message of the WebSocket handshake. <br /> Specifically, the extensions that are needed are: " + event.reason
  else if(event.code == 1011)
    return "A server is terminating the connection because it encountered an unexpected condition that prevented it from fulfilling the request."
  else if(event.code == 1015)
    return "The connection was closed due to a failure to perform a TLS handshake (e.g., the server certificate can't be verified)."
  return "Unknown reason"
}

/**
 * Return a well established WebSocket connection.
 * 
 * Resolved only when onopen is emitted.
 * Reject when onclose is emitted.
 *
 * @param wsURL 
 * @return WebSocket instance.
 */
export const createWebSocket = (wsURL: string): Promise<WebSocket> => {
  return new Promise<WebSocket>((resolve, reject) => {
    const o = new WebSocket(wsURL)
    o.onopen = () => {
      o.onopen = null
      o.onclose = null
      cnsl.log('createWebSocket -> open!')
      resolve(o)
    }
    o.onclose = (closeEvent) => {
      o.onopen = null
      o.onclose = null
      cnsl.log('createWebSocket -> close!')
      reject(new Error(closeReason(closeEvent)))
    }
  })
}