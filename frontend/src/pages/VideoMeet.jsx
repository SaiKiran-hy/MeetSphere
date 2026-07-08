import React, { useCallback, useContext, useEffect, useRef, useState } from 'react'
import io from "socket.io-client";
import { Badge, IconButton, TextField } from '@mui/material';
import { Button } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import styles from "../styles/videoComponent.module.css";
import CallEndIcon from '@mui/icons-material/CallEnd'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare'
import ChatIcon from '@mui/icons-material/Chat'
import server from '../utils/environment.js';
import { AuthContext } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const server_url = server;

const peerConfigConnections = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
    ]
}

// Namespaced logger so WebRTC debug output can be found/filtered easily,
// and muted in one place for production builds if desired.
const log = (...args) => console.log('[VideoMeet]', ...args);
const logWarn = (...args) => console.warn('[VideoMeet]', ...args);
const logError = (...args) => console.error('[VideoMeet]', ...args);

export default function VideoMeetComponent() {

    const { addToUserHistory } = useContext(AuthContext);
    const navigate = useNavigate();

    const socketRef = useRef();
    const socketIdRef = useRef();
    const localVideoref = useRef();

    // The local MediaStream lives in a ref, not state or `window.localStream`.
    // It's mutated by WebRTC callbacks that don't need to trigger re-renders,
    // and keeping it off `window` avoids leaking it across component
    // mounts/route changes in an SPA.
    const localStreamRef = useRef(null);

    // Map of socketId -> { pc, isPolite, makingOffer, ignoreOffer,
    // candidateQueue, videoSender, audioSender }.
    // This replaces the original module-level `var connections = {}`.
    // A module-level object is shared by every instance of this component
    // that has ever mounted in the page's lifetime (e.g. React StrictMode's
    // double-invoke, or leaving and rejoining a call in the same SPA
    // session) and is never cleared - a real memory/connection leak and a
    // source of "ghost" peers. Scoping it to a ref inside the component
    // ties its lifetime to this component instance.
    const connectionsRef = useRef({});

    const hasInitializedRef = useRef(false);
    const isScreenSharingRef = useRef(false);

    const [videoAvailable, setVideoAvailable] = useState(true);
    const [audioAvailable, setAudioAvailable] = useState(true);
    const [video, setVideo] = useState(false);
    const [audio, setAudio] = useState(false);
    const [screen, setScreen] = useState(false);
    const [showModal, setModal] = useState(true);
    const [screenAvailable, setScreenAvailable] = useState(false);
    const [messages, setMessages] = useState([])
    const [message, setMessage] = useState("");
    const [newMessages, setNewMessages] = useState(3);
    const [askForUsername, setAskForUsername] = useState(true);
    const [username, setUsername] = useState("");
    const [videos, setVideos] = useState([])

    // Holds the actual MediaStream per remote peer, keyed by socketId.
    // Read from here (not from React state) inside ref callbacks, since a
    // ref is always current at the moment the callback runs - no stale
    // closure risk.
    const remoteStreamsRef = useRef({});

    // One stable ref-callback function per remote peer, cached here so its
    // identity never changes across re-renders. Without this, the inline
    // `ref={ref => {...}}` used directly in JSX gets a brand new function
    // identity on every render (any chat message, any mic/camera toggle,
    // literally any state change in this component) - and React treats a
    // changed ref identity as "this ref moved", detaching and reattaching
    // it. That thrashing is what can cause a remote video to blank out or
    // never stabilize even though the underlying MediaStream/track is
    // arriving fine (which your console logs already confirm - ontrack IS
    // firing on both sides).
    const remoteVideoRefCallbacks = useRef({});
    const getRemoteVideoRef = (socketId) => {
        if (!remoteVideoRefCallbacks.current[socketId]) {
            remoteVideoRefCallbacks.current[socketId] = (node) => {
                const stream = remoteStreamsRef.current[socketId];
                if (node && stream) {
                    node.srcObject = stream;
                }
            };
        }
        return remoteVideoRefCallbacks.current[socketId];
    };

    // ---------------------------------------------------------------------
    // Local video element attachment
    // ---------------------------------------------------------------------
    // IMPORTANT: the lobby view and the meet-room view each render their OWN
    // <video> element (they're two different branches of the ternary in the
    // JSX below), so `localVideoref.current` points to a DIFFERENT DOM node
    // before vs. after clicking Connect. A plain `ref={localVideoref}` only
    // gets its `srcObject` set once - whenever initializeLocalMedia() happens
    // to run - which meant the meet-room's own camera preview was often just
    // blank, because by the time we set the stream, the ref still pointed at
    // the (about to be unmounted) lobby video element, or the code had
    // already returned early because the stream already existed.
    //
    // A callback ref fixes this: it fires every single time a <video>
    // element mounts (lobby OR meet-room), so we can (re)attach the current
    // stream immediately, no matter which element it is or when the stream
    // became available.
    const attachLocalVideo = useCallback((node) => {
        localVideoref.current = node;
        if (node && localStreamRef.current) {
            node.srcObject = localStreamRef.current;
        }
    }, []);

    // ---------------------------------------------------------------------
    // Mount / unmount
    // ---------------------------------------------------------------------
    useEffect(() => {
        // The original effect had NO dependency array at all, so
        // getPermissions() (which calls getUserMedia three times) re-ran on
        // *every* render - re-prompting for camera/mic and re-acquiring the
        // camera repeatedly. The ref guard + empty dependency array makes
        // this a true "on mount" effect.
        if (hasInitializedRef.current) return;
        hasInitializedRef.current = true;
        getPermissions();

        return () => {
            // Full teardown on unmount so nothing keeps the camera/mic on,
            // no peer connections linger, and no socket keeps trying to
            // reconnect after the component is gone.
            cleanupCall();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getPermissions = async () => {
        try {
            let videoOk = false;
            let audioOk = false;

            // Probe permissions independently, and - unlike the original,
            // which never stopped these probe streams - stop each probe
            // stream's tracks immediately. Leaving them open was holding the
            // camera/mic open twice before the "real" stream was even
            // requested (visible as the camera light staying on longer than
            // necessary, and occasionally as NotReadableError on some
            // webcams that don't support concurrent opens).
            try {
                const v = await navigator.mediaDevices.getUserMedia({ video: true });
                v.getTracks().forEach(t => t.stop());
                videoOk = true;
            } catch (e) {
                logWarn('Camera not available/permitted', e);
            }

            try {
                const a = await navigator.mediaDevices.getUserMedia({ audio: true });
                a.getTracks().forEach(t => t.stop());
                audioOk = true;
            } catch (e) {
                logWarn('Microphone not available/permitted', e);
            }

            setVideoAvailable(videoOk);
            setAudioAvailable(audioOk);
            setVideo(videoOk);
            setAudio(audioOk);
            setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);

            if (videoOk || audioOk) {
                const stream = await navigator.mediaDevices.getUserMedia({ video: videoOk, audio: audioOk });
                localStreamRef.current = stream;
                if (localVideoref.current) {
                    localVideoref.current.srcObject = stream;
                }
                log('Lobby preview stream acquired:', stream.getTracks().map(t => t.kind));
            }
        } catch (error) {
            logError('getPermissions failed', error);
        }
    };

    // ---------------------------------------------------------------------
    // Local media
    // ---------------------------------------------------------------------
    const initializeLocalMedia = async (wantVideo, wantAudio) => {
        if (!wantVideo && !wantAudio) {
            logWarn('Joining without local media (no camera/mic available)');
            return;
        }

        // getPermissions() already acquired a live stream for the lobby
        // preview - reuse it for the call instead of calling getUserMedia a
        // second time. The original code fetched a fresh stream on every
        // video/audio state change via a chained useEffect, which is both
        // wasteful (re-opens the camera) and was the root cause of several
        // race conditions between "new stream arrived" and "renegotiate all
        // peers".
        if (localStreamRef.current) {
            log('Reusing existing local media stream for the call');
            // Make sure whichever <video> element is currently mounted has
            // the stream attached. attachLocalVideo() (the ref callback)
            // handles this on mount, but if the element was already mounted
            // before this runs, we still attach it here as a safety net.
            if (localVideoref.current) {
                localVideoref.current.srcObject = localStreamRef.current;
            }
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: wantVideo, audio: wantAudio });
            localStreamRef.current = stream;
            if (localVideoref.current) localVideoref.current.srcObject = stream;
        } catch (e) {
            logError('getUserMedia failed in initializeLocalMedia', e);
        }
    };

    const addLocalTracksToConnection = (entry) => {
        const stream = localStreamRef.current;
        if (!stream) return;
        stream.getTracks().forEach(track => {
            // Guard against adding the same track twice, which would create
            // duplicate senders and duplicate/ghost video or double audio on
            // the remote end.
            const alreadyAdded = entry.pc.getSenders().some(s => s.track === track);
            if (alreadyAdded) return;
            const sender = entry.pc.addTrack(track, stream); // addTrack, not the deprecated addStream
            if (track.kind === 'video') entry.videoSender = sender;
            if (track.kind === 'audio') entry.audioSender = sender;
        });
    };

    // ---------------------------------------------------------------------
    // Peer connection lifecycle (Perfect Negotiation)
    // ---------------------------------------------------------------------
    const createPeerConnection = (remoteSocketId) => {
        const existing = connectionsRef.current[remoteSocketId];
        if (existing) {
            // Prevents the duplicate-PeerConnection bug: if the same remote
            // id is seen twice (e.g. overlapping 'user-joined' events, or a
            // signal arriving before the connection map was updated), we
            // reuse the existing RTCPeerConnection instead of creating a
            // second one competing for the same media.
            log('Peer connection for', remoteSocketId, 'already exists - reusing it');
            return existing;
        }

        log('Creating RTCPeerConnection ->', remoteSocketId);
        const pc = new RTCPeerConnection(peerConfigConnections);

        // Perfect Negotiation requires exactly one "polite" and one
        // "impolite" peer per pair, agreed without extra signaling. Comparing
        // socket IDs deterministically gives both sides the same answer.
        const isPolite = socketIdRef.current > remoteSocketId;

        const entry = {
            pc,
            isPolite,
            makingOffer: false,
            ignoreOffer: false,
            candidateQueue: [],
            videoSender: null,
            audioSender: null,
        };
        connectionsRef.current[remoteSocketId] = entry;

        // onnegotiationneeded fires automatically whenever tracks are added
        // (and, later, whenever replaceTrack would require it - which it
        // doesn't, that's the point). This single handler replaces every
        // hand-rolled "createOffer().then(setLocalDescription).then(emit)"
        // call scattered through the original file, removing most of the
        // duplicate-offer / race-condition surface area.
        pc.onnegotiationneeded = async () => {
            try {
                entry.makingOffer = true;
                log('onnegotiationneeded ->', remoteSocketId);
                await pc.setLocalDescription(); // no-arg form: browser infers offer/answer
                socketRef.current.emit('signal', remoteSocketId, JSON.stringify({ sdp: pc.localDescription }));
            } catch (e) {
                logError('Negotiation failed for', remoteSocketId, e);
            } finally {
                entry.makingOffer = false;
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socketRef.current.emit('signal', remoteSocketId, JSON.stringify({ ice: event.candidate }));
            }
        };

        // ontrack replaces the deprecated onaddstream. It fires once per
        // remote track (not once per stream), so we key off event.streams[0]
        // to keep a single <video> per remote peer, same as before.
        pc.ontrack = (event) => {
            log('ontrack from', remoteSocketId, '-', event.track.kind);
            const stream = event.streams[0];
            remoteStreamsRef.current[remoteSocketId] = stream;
            setVideos((prev) => {
                const alreadyExists = prev.some(v => v.socketId === remoteSocketId);
                if (alreadyExists) {
                    return prev.map(v => v.socketId === remoteSocketId ? { ...v, stream } : v);
                }
                return [...prev, { socketId: remoteSocketId, stream, autoplay: true, playsinline: true }];
            });
        };

        pc.oniceconnectionstatechange = () => {
            log('ICE state ->', remoteSocketId, ':', pc.iceConnectionState);
            if (pc.iceConnectionState === 'failed' && pc.restartIce) {
                logWarn('ICE failed for', remoteSocketId, '- attempting restartIce()');
                pc.restartIce();
            }
        };

        pc.onconnectionstatechange = () => {
            log('Connection state ->', remoteSocketId, ':', pc.connectionState);
            if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
                removePeer(remoteSocketId);
            }
        };

        addLocalTracksToConnection(entry);

        return entry;
    };

    const removePeer = (remoteSocketId) => {
        const entry = connectionsRef.current[remoteSocketId];
        if (entry) {
            entry.pc.close();
            delete connectionsRef.current[remoteSocketId];
        }
        delete remoteStreamsRef.current[remoteSocketId];
        delete remoteVideoRefCallbacks.current[remoteSocketId];
        setVideos((prev) => prev.filter(v => v.socketId !== remoteSocketId));
        log('Removed peer', remoteSocketId);
    };

    // Handles both SDP and ICE signaling messages using the Perfect
    // Negotiation pattern (see https://w3c.github.io/webrtc-pc/#perfect-negotiation-example).
    const gotMessageFromServer = async (fromId, message) => {
        if (fromId === socketIdRef.current) return;

        const entry = connectionsRef.current[fromId] || createPeerConnection(fromId);
        const { pc } = entry;
        const signal = JSON.parse(message);

        try {
            if (signal.sdp) {
                const description = signal.sdp;

                // Glare detection: both peers happened to create an offer at
                // the same time. The impolite peer ignores the incoming
                // offer and keeps its own; the polite peer rolls back its
                // own local offer and accepts the incoming one instead.
                // This single check is what makes duplicate/competing SDP
                // offers self-resolve instead of desyncing the connection.
                const offerCollision =
                    description.type === 'offer' &&
                    (entry.makingOffer || pc.signalingState !== 'stable');

                entry.ignoreOffer = !entry.isPolite && offerCollision;
                if (entry.ignoreOffer) {
                    logWarn('Ignoring colliding offer from', fromId, '(impolite peer)');
                    return;
                }

                if (offerCollision) {
                    log('Offer collision with', fromId, '- rolling back (polite peer)');
                    await Promise.all([
                        pc.setLocalDescription({ type: 'rollback' }),
                        pc.setRemoteDescription(description),
                    ]);
                } else {
                    await pc.setRemoteDescription(description);
                }

                // Flush any ICE candidates that arrived before we had a
                // remote description to attach them to. The original code
                // called addIceCandidate() unconditionally and let it throw
                // into a swallowed .catch(console.log) - candidates that
                // arrived early were silently lost, which is a classic cause
                // of "connects sometimes, not others" flakiness.
                if (entry.candidateQueue.length) {
                    log('Flushing', entry.candidateQueue.length, 'queued ICE candidate(s) for', fromId);
                    for (const candidate of entry.candidateQueue) {
                        try {
                            await pc.addIceCandidate(candidate);
                        } catch (e) {
                            logError('Failed to add queued ICE candidate', e);
                        }
                    }
                    entry.candidateQueue = [];
                }

                if (description.type === 'offer') {
                    await pc.setLocalDescription();
                    socketRef.current.emit('signal', fromId, JSON.stringify({ sdp: pc.localDescription }));
                }
            } else if (signal.ice) {
                if (pc.remoteDescription && pc.remoteDescription.type) {
                    try {
                        await pc.addIceCandidate(signal.ice);
                    } catch (e) {
                        if (!entry.ignoreOffer) logError('addIceCandidate failed for', fromId, e);
                    }
                } else {
                    // No remote description yet - queue instead of dropping.
                    entry.candidateQueue.push(signal.ice);
                }
            }
        } catch (e) {
            logError('Error handling signal from', fromId, e);
        }
    };

    // ---------------------------------------------------------------------
    // Signaling connection
    // ---------------------------------------------------------------------
    const connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, { secure: false });

        socketRef.current.on('signal', gotMessageFromServer);

        socketRef.current.on('connect', () => {
            socketIdRef.current = socketRef.current.id;
            log('Connected to signaling server as', socketIdRef.current);
            socketRef.current.emit('join-call', window.location.href);

            socketRef.current.on('chat-message', addMessage);

            socketRef.current.on('user-left', (id) => {
                log('user-left ->', id);
                removePeer(id);
            });

            socketRef.current.on('user-joined', (id, clients) => {
                log('user-joined ->', id, 'clients:', clients);
                clients.forEach((remoteSocketId) => {
                    if (remoteSocketId === socketIdRef.current) return;
                    // createPeerConnection() is idempotent (see above), so
                    // it's safe to call for every id in every 'user-joined'
                    // event without tracking "have I already handled this
                    // id" separately.
                    createPeerConnection(remoteSocketId);
                    // No manual "create an offer for everyone" branch here -
                    // adding local tracks inside createPeerConnection already
                    // triggers onnegotiationneeded, which sends the offer.
                    // The original's separate hand-rolled offer loop for the
                    // newly-joined client was the main source of duplicate
                    // offers and offer/answer glare.
                });
            });
        });

        socketRef.current.on('disconnect', (reason) => {
            log('Disconnected from signaling server:', reason);
        });
    };

    // ---------------------------------------------------------------------
    // Chat
    // ---------------------------------------------------------------------
    const addMessage = (data, sender, socketIdSender) => {
        setMessages((prevMessages) => [
            ...prevMessages,
            { sender: sender, data: data }
        ]);
        if (socketIdSender !== socketIdRef.current) {
            setNewMessages((prevNewMessages) => prevNewMessages + 1);
        }
    };

    const sendMessage = () => {
        socketRef.current.emit('chat-message', message, username)
        setMessage("");
    }

    const handleMessage = (e) => setMessage(e.target.value);

    // ---------------------------------------------------------------------
    // Mic / camera toggle - no renegotiation
    // ---------------------------------------------------------------------
    const handleVideo = () => {
        setVideo((prev) => {
            const next = !prev;
            const track = localStreamRef.current?.getVideoTracks()[0];
            if (track) {
                // Toggling `track.enabled` mutes/unmutes the outgoing media
                // without adding or removing the track from any
                // RTCPeerConnection, so it never fires onnegotiationneeded
                // and never triggers a new SDP offer/answer round. This
                // replaces the original approach of stopping the real track
                // and replacing the whole stream with a synthetic black
                // canvas + silent audio track, then renegotiating every peer
                // connection just to turn the camera off.
                track.enabled = next;
                log('Local video track.enabled =', next, '(no renegotiation)');
            }
            return next;
        });
    };

    const handleAudio = () => {
        setAudio((prev) => {
            const next = !prev;
            const track = localStreamRef.current?.getAudioTracks()[0];
            if (track) {
                track.enabled = next;
                log('Local audio track.enabled =', next, '(no renegotiation)');
            }
            return next;
        });
    };

    // ---------------------------------------------------------------------
    // Screen sharing - replaceTrack, no renegotiation
    // ---------------------------------------------------------------------
    const handleScreen = async () => {
        if (!screenAvailable) return;

        if (!isScreenSharingRef.current) {
            try {
                const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                const screenTrack = displayStream.getVideoTracks()[0];

                // replaceTrack swaps the outgoing video for every peer
                // without removing/re-adding a track, so it does NOT fire
                // onnegotiationneeded and does NOT require a new SDP
                // exchange. This is the standard, race-free way to switch
                // between camera and screen share - the original code
                // instead stopped the whole local stream and called
                // createOffer()/setLocalDescription() on every connection,
                // which briefly dropped the video and could race with other
                // negotiations already in flight.
                const results = await Promise.allSettled(
                    Object.entries(connectionsRef.current).map(([peerId, entry]) => {
                        if (!entry.videoSender) {
                            // If this fires, that peer's connection never
                            // got a video track added in the first place
                            // (e.g. camera unavailable when the connection
                            // was created, or the offer/answer never
                            // completed) - replaceTrack has nothing to
                            // swap, so that remote peer will never see the
                            // screen share no matter what we do here. This
                            // points at the peer-connection/negotiation
                            // itself, not at screen sharing.
                            logWarn('No videoSender for peer', peerId, '- screen share cannot reach them');
                            return Promise.resolve();
                        }
                        return entry.videoSender.replaceTrack(screenTrack);
                    })
                );
                results.forEach((r, i) => {
                    if (r.status === 'rejected') {
                        logError('replaceTrack failed for a peer while starting screen share', r.reason);
                    }
                });

                if (localVideoref.current) {
                    localVideoref.current.srcObject = new MediaStream([
                        screenTrack,
                        ...(localStreamRef.current?.getAudioTracks() || []),
                    ]);
                }

                isScreenSharingRef.current = true;
                setScreen(true);

                // Handle the browser's native "Stop sharing" bar as well as
                // our own toggle button.
                screenTrack.onended = () => {
                    log('Screen share ended via browser control');
                    stopScreenShare();
                };
            } catch (e) {
                logError('getDisplayMedia failed or was cancelled by the user', e);
            }
        } else {
            stopScreenShare();
        }
    };

    const stopScreenShare = async () => {
        const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;

        const results = await Promise.allSettled(
            Object.values(connectionsRef.current).map((entry) =>
                entry.videoSender ? entry.videoSender.replaceTrack(cameraTrack) : Promise.resolve()
            )
        );
        results.forEach((r) => {
            if (r.status === 'rejected') {
                logError('replaceTrack failed for a peer while stopping screen share', r.reason);
            }
        });

        if (localVideoref.current) {
            localVideoref.current.srcObject = localStreamRef.current;
        }
        isScreenSharingRef.current = false;
        setScreen(false);
    };

    // ---------------------------------------------------------------------
    // Call setup / teardown
    // ---------------------------------------------------------------------
    const getMedia = async () => {
        await initializeLocalMedia(videoAvailable, audioAvailable);
        connectToSocketServer();
    };

    const connect = () => {
        setAskForUsername(false);

        // Save this meeting into the user's history. addToUserHistory
        // comes from AuthContext and already handles attaching the auth
        // token - we just need to tell it which meeting code this is.
        // This is fire-and-forget: a failure here shouldn't block joining
        // the call, so we just log it.
        const meetingCode = window.location.pathname.split('/').filter(Boolean).pop();
        addToUserHistory(meetingCode).catch((e) => logError('Failed to save meeting to history', e));

        getMedia();
    }

    const cleanupCall = () => {
        // Close every RTCPeerConnection explicitly - just letting them be
        // garbage collected leaves the underlying ICE/DTLS sessions (and, on
        // some browsers, the OS-level media pipeline) alive until the page
        // is fully unloaded.
        Object.values(connectionsRef.current).forEach((entry) => entry.pc.close());
        connectionsRef.current = {};

        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;

        if (socketRef.current) {
            socketRef.current.off('signal', gotMessageFromServer);
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        isScreenSharingRef.current = false;
        log('Cleaned up: closed all peer connections, stopped local tracks, disconnected socket');
    };

    const handleEndCall = () => {
        cleanupCall();
        // useNavigate keeps this an SPA transition (no full page reload).
        // If you specifically need a hard reload (e.g. to guarantee every
        // media device/socket is fully torn down), use
        // window.location.href = "/home" instead - but cleanupCall() above
        // already closes every RTCPeerConnection, stops every track, and
        // disconnects the socket, so a hard reload shouldn't be necessary.
        navigate("/home");
    }

    const openChat = () => {
        setModal(true);
        setNewMessages(0);
    }
    const closeChat = () => {
        setModal(false);
    }

    return (
        <div>

            {askForUsername === true ?

                <div>


                    <h2>Enter into Lobby </h2>
                    <TextField id="outlined-basic" label="Username" value={username} onChange={e => setUsername(e.target.value)} variant="outlined" />
                    <Button variant="contained" onClick={connect}>Connect</Button>


                    <div>
                        <video ref={attachLocalVideo} autoPlay muted></video>
                    </div>

                </div> :


                <div className={styles.meetVideoContainer}>

                    {showModal ? <div className={styles.chatRoom}>

                        <div className={styles.chatContainer}>
                            <h1>Chat</h1>

                            <div className={styles.chattingDisplay}>

                                {messages.length !== 0 ? messages.map((item, index) => {
                                    return (
                                        <div style={{ marginBottom: "20px" }} key={index}>
                                            <p style={{ fontWeight: "bold" }}>{item.sender}</p>
                                            <p>{item.data}</p>
                                        </div>
                                    )
                                }) : <p>No Messages Yet</p>}


                            </div>

                            <div className={styles.chattingArea}>
                                <TextField value={message} onChange={handleMessage} id="outlined-basic" label="Enter Your chat" variant="outlined" />
                                <Button variant='contained' onClick={sendMessage}>Send</Button>
                            </div>


                        </div>
                    </div> : <></>}


                    <div className={styles.buttonContainers}>
                        <IconButton onClick={handleVideo} style={{ color: "white" }}>
                            {(video === true) ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>
                        <IconButton onClick={handleEndCall} style={{ color: "red" }}>
                            <CallEndIcon />
                        </IconButton>
                        <IconButton onClick={handleAudio} style={{ color: "white" }}>
                            {audio === true ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>

                        {screenAvailable === true ?
                            <IconButton onClick={handleScreen} style={{ color: "white" }}>
                                {screen === true ? <ScreenShareIcon /> : <StopScreenShareIcon />}
                            </IconButton> : <></>}

                        <Badge badgeContent={newMessages} max={999} color='orange'>
                            <IconButton onClick={() => setModal(!showModal)} style={{ color: "white" }}>
                                <ChatIcon />                        </IconButton>
                        </Badge>

                    </div>


                    <video className={styles.meetUserVideo} ref={attachLocalVideo} autoPlay muted></video>

                    <div className={styles.conferenceView}>
                        {videos.map((video) => (
                            <div key={video.socketId}>
                                <video
                                    data-socket={video.socketId}
                                    ref={getRemoteVideoRef(video.socketId)}
                                    autoPlay
                                >
                                </video>
                            </div>

                        ))}

                    </div>

                </div>

            }

        </div>
    )
}