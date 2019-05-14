import { WebRTCConfiguration } from '../interface'
import { SDPMessageProcessor } from './SDPMessageProcessor'
import { forEach } from 'lodash'
import { supportGetUserMedia, queryForCamera, getUserMedia, createWebSocket } from '../utils'

export class WebRTCPublisher {

  private userAgent = navigator.userAgent
  private localStream?: MediaStream                         // if set, preview stream is available.
  private currentContraints: MediaStreamConstraints = {
    video: true,                // default = no-facing-mode
    audio: true
  }
  private peerConnection?: RTCPeerConnection = undefined    // if set, we are publishing.
  private wsConnection?: WebSocket = undefined
  private userData = {param1:"value1"}
  private videoElement?: HTMLVideoElement = undefined

  private statusCameraMuted: boolean = true
  private _lastError?: Error = undefined

  /**
   * Holding = disable microphone only.
   */
  public get isHolding(): boolean {
    if (!this.localStream) {
      return false
    }
    const audioTracks = this.localStream.getAudioTracks()
    if (audioTracks.length > 0) {
      return !audioTracks[0].enabled
    }
    return false
  }

  public set isHolding(value: boolean) {
    if (!this.localStream) {
      return
    }
    forEach(this.localStream.getAudioTracks(), (track) => { track.enabled = !value })
    this.statusListener && this.statusListener()
  }

  public set isCameraMuted(muted: boolean) {
    this.statusCameraMuted = muted
    this.statusListener && this.statusListener()
  }

  public get isCameraMuted(): boolean {
    return this.statusCameraMuted
  }

  public get isPublishing(): boolean {
    return !!this.peerConnection
  }

  public get isPreviewEnabled(): boolean {
    return !!this.videoElement && (!!this.videoElement.src || !!this.videoElement.srcObject)
  }

  public get streamSourceConstraints(): MediaStreamConstraints {
    return this.currentContraints
  }

  public get lastError(): Error|undefined {
    return this._lastError
  }

  constructor(private config: WebRTCConfiguration, mediaStreamConstraints: MediaStreamConstraints, public enhanceMode: 'auto'|boolean, private statusListener?: () => void) {
    // Validate if browser support getUserMedia or not?
    if (!supportGetUserMedia()) {
      throw new Error('Your browser does not support getUserMedia API')
    }

    // Normalize window/navigator APIs
    navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia
    window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection
    window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate
    window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription
    window.URL = window.URL || window.webkitURL
    
    // Update constraints.
    this.currentContraints = mediaStreamConstraints

    console.log('WebRTC Handler started (agent=', this.userAgent, this.currentContraints, ')')
    queryForCamera(this.streamSourceConstraints)
      .then(hasCamera => this.isCameraMuted = !hasCamera)
      .catch(error => {
        console.error('[Publisher] Unable to locate Camera', error)
      })
  }

  public async switchStream(constraints: MediaStreamConstraints, force: boolean = false) {
    const current = JSON.stringify(this.currentContraints)
    const target = JSON.stringify(constraints)
    if (!force && current === target) {
      console.log('[Publisher] Constraints already matched. ignore switchStream request.')
      return
    }
    this.currentContraints = constraints

    // Disable current stream before claiming a new one.
    if (this.localStream) {
      // stop current tracks
      if (this.localStream.stop) {
        this.localStream.stop()
      } else {
        this.localStream.getTracks().forEach(o => o.stop())
      }
    }
    
    await this._claimMedia(constraints)
  }

  /**
   * Attach user media to configured VideoElement
   */
  public async attachUserMedia(videoElement: HTMLVideoElement) {
    // save videoElement
    this.videoElement = videoElement

    // Claim the stream
    await this._claimMedia(this.streamSourceConstraints)
  }
  
  private async _claimMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    // Try getting user media.
    const stream = await getUserMedia(constraints)

    // Camera is not muted. (Camera is available.)
    this.isCameraMuted = false

    // If videoElement exists - attach it.
    if (this.videoElement) {
      try {
        this.videoElement.srcObject = stream
      } catch(elementError) {
        console.error('[Publisher] attaching video.srcObject failed, Fallback to src ...', this.videoElement, stream)
        this.videoElement.src = window.URL.createObjectURL(stream)
      }
    }

    // If peerConnection exists - replace it.
    const peerConnection = this.peerConnection
    if (peerConnection) {
      // Replace track
      stream.getTracks().forEach((track) => {
        const sender = peerConnection.getSenders().find((sender) => {
          return sender.track && sender.track.kind == track.kind || false
        })
        sender && sender.replaceTrack(track)
      })
    }

    // Select the stream to Local Stream.
    this.localStream = stream

    // status updated.
    this.statusListener && this.statusListener()

    return stream
  }

  public async detachUserMedia() {
    if (this.localStream) {
      if (this.videoElement && this.videoElement.src) {
        this.videoElement.src = ''
      }
      if (this.videoElement && this.videoElement.srcObject) {
        this.videoElement.srcObject = null
      }
      this._stopStream()
      this.statusListener && this.statusListener()
    }
  }

  /**
   * Begin connect to server, and publish the media.
   * 
   * @throws Error upon failure to create connection.
   */
  public async connect(streamName: string) {
    try {
      await this._connect(streamName)
    } catch (error) {
      // handle error
      this._reportError(error)
      throw error
    }
  }
  private async _connect(streamName: string): Promise<void> {
    if (this.peerConnection) {
      throw new Error('There is already active peerConnection!')
    }
    // grab configs
    const conf: WebRTCConfiguration = this.config
    const wsURL = conf.WEBRTC_SDP_URL
    const streamInfo = {
      applicationName: conf.WEBRTC_APPLICATION_NAME,
      streamName, 
      sessionId: "[empty]"    // random me!
    }
    const videoBitrate = conf.WEBRTC_VIDEO_BIT_RATE
    const audioBitrate = conf.WEBRTC_AUDIO_BIT_RATE
    const videoFrameRate = conf.WEBRTC_FRAME_RATE

    // wsConnect
    let wsConnection = await createWebSocket(wsURL)
    wsConnection.binaryType = 'arraybuffer'

    wsConnection.onopen = async () => {
      console.log('[Publisher] wsConnection.onopen')

      const localStream = this.localStream
      if (!localStream) {
        const err = new Error('Invalid state, open connection without video stream to publish.')
        this._reportError(err)
        throw err
      }

      const peerConnection = new RTCPeerConnection({ iceServers: [] })
      peerConnection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
        if (event.candidate != null) {
          console.log(`[Publisher] gotIceCandidate: ${JSON.stringify({'ice': event.candidate})}`)
        }
      }
  
      // Swizzle between Webkit API versions Support here ...
      const pc: any = peerConnection
      if (!pc.addStream) {
        {
          const localTracks = localStream.getTracks();
          for(const localTrack in localTracks) {
            peerConnection.addTrack(localTracks[localTrack], localStream);
          }
        }
      } else {
        pc.addStream(localStream)
      }

      // Create offer
      try {
        const description = await peerConnection.createOffer()

        if (this.enhanceMode === 'auto' || this.enhanceMode === true) {
          const originalSdp = description.sdp

          // enhance sdp message
          const enhancer = new SDPMessageProcessor(
            '42e01f',    // VideoMode: 'H264=42e01f' or 'VP9=VP9'
            'opus'    // AudioMode: 'OPUS'
          )
          description.sdp = enhancer.enhance(description.sdp, {
            audioBitrate,
            videoBitrate,
            videoFrameRate
          })
  
          if (this.enhanceMode === 'auto' && SDPMessageProcessor.isCorrupted(description.sdp)) {
            console.log('[Publisher] Auto Enhance SDPMessage is corrupted revert to original.')
            description.sdp = originalSdp
          } else {
            console.log('[Publisher] Auto Enhance SDPMessage is valid.')
          }
        }

        await peerConnection.setLocalDescription(description)

        // send offer back with enhanced SDP
        wsConnection.send('{"direction":"publish", "command":"sendOffer", "streamInfo":'+JSON.stringify(streamInfo)+', "sdp":'+JSON.stringify(description)+', "userData":'+JSON.stringify(this.userData)+'}');

        this.peerConnection = peerConnection
        this.statusListener && this.statusListener()

        console.log('[Publisher] Publishing with streamName=', streamName)

      } catch (error) {
        console.error('Failed while waiting for offer result', error)
        this._reportError(error)
      }
    }

    wsConnection.onmessage = async (evt: any) => {
      if (!this.peerConnection) {
        const err = new Error('Invalid state! peerConnection is empty!')
        this._reportError(err)
        throw err
      }

      const peerConnection = this.peerConnection
      const msgJSON = JSON.parse(evt.data)
      const msgStatus = Number(msgJSON['status'])
      const msgCommand = msgJSON['command']

      console.log('Incoming message', msgCommand)

      if (msgStatus != 200) {
        // Error
        const err = new Error(`Failed to publish, cannot handle invalid status: ${msgStatus}`)
        this._reportError(err)
        return
      }

      const sdpData = msgJSON['sdp']
      if (sdpData !== undefined) {
        console.log(`[Publisher] sdp: ${sdpData}`)

        await peerConnection.setRemoteDescription(new RTCSessionDescription(sdpData))
      }

      const iceCandidates = msgJSON['iceCandidates']
      if (iceCandidates !== undefined) {
        for(const index in iceCandidates) {
          console.log('[Publisher] iceCandidates: ' + iceCandidates[index]);
          await peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidates[index]));
        }
      }

      // Connected! SDP Connection is no longer required.
      if (wsConnection != null) {
        wsConnection.close()
      }
    }

    wsConnection.onclose = () => console.log('[Publisher] wsConnection.onclose')

    wsConnection.onerror = (evt) => {
      console.log("[Publisher] wsConnection.onerror: "+JSON.stringify(evt));
      this._reportError(new Error(JSON.stringify(evt)))
    }

    // save it.
    this.wsConnection = wsConnection
  }

  private _reportError(error: Error) {
    this._lastError = error
    this.disconnect()
  }

  public async disconnect() {
    this.peerConnection && this.peerConnection.close()
    this.wsConnection && this.wsConnection.close()

    this.peerConnection = undefined
    this.wsConnection = undefined

    this._stopStream()
    this.statusListener && this.statusListener()

    console.log("[Publisher] Disconnected")
  }

  private _stopStream() {
    // if there is a localStream object, and they are no longer used.
    if (this.localStream && !this.isPreviewEnabled && !this.isPublishing) {
      console.log('[Publisher] Trying to stop stream', this.localStream)
      if (this.localStream.stop) {
        this.localStream.stop()
      } else {
        for(const track of this.localStream.getTracks()) {
          track.stop()
        }
      }
      this.localStream = undefined
    }
  }
}
