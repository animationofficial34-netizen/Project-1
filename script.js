const socket = io();

let localStream;
let remoteStream;
let peerConnection;
let currentRoomId = null;
let targetSocketId = null;
let isVideoChatMode = true;

// STUN Servers (Google के फ्री STUN सर्वर ताकि दो अलग नेटवर्क के लोग कनेक्ट हो सकें)
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// DOM Elements
const splashScreen = document.getElementById('splash-screen');
const app = document.getElementById('app');
const termsCheck = document.getElementById('terms-check');
const btnTextChat = document.getElementById('btn-text-chat');
const btnVideoChat = document.getElementById('btn-video-chat');
const modeSelection = document.getElementById('mode-selection');
const chatContainer = document.getElementById('chat-container');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const msgInput = document.getElementById('msg-input');
const btnSend = document.getElementById('btn-send');
const chatMessages = document.getElementById('chat-messages');

// 3 सेकंड बाद स्प्लैश स्क्रीन हटाने के बाद ऐप दिखाना
setTimeout(() => {
    app.classList.remove('hidden');
}, 3000);

// Terms & Conditions Checkbox Enable/Disable Buttons
termsCheck.addEventListener('change', (e) => {
    if (e.target.checked) {
        btnTextChat.removeAttribute('disabled');
        btnVideoChat.removeAttribute('disabled');
    } else {
        btnTextChat.setAttribute('disabled', 'true');
        btnVideoChat.setAttribute('disabled', 'true');
    }
});

// Text Chat Mode Click
btnTextChat.addEventListener('click', () => {
    isVideoChatMode = false;
    startChat(false);
});

// Video & Text Chat Mode Click
btnVideoChat.addEventListener('click', () => {
    isVideoChatMode = true;
    startChat(true);
});

async function startChat(videoEnabled) {
    modeSelection.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    msgInput.removeAttribute('disabled');
    btnSend.removeAttribute('disabled');

    if (!videoEnabled) {
        document.getElementById('video-area').classList.add('hidden');
        document.getElementById('video-controls').classList.add('hidden');
    } else {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
        } catch (err) {
            alert('कैमरा और माइक की अनुमति (Permission) जरूरी है!');
            console.error(err);
        }
    }

    // सर्वर से पार्टनर ढूंढने के लिए कहें
    findPartner();
}

function findPartner() {
    appendSystemMessage('अजनबी (Stranger) की तलाश की जा रही है...');
    socket.emit('find-partner');
}

// Socket Events
socket.on('match-found', async (data) => {
    targetSocketId = data.partnerId;
    currentRoomId = data.roomId;
    appendSystemMessage('अजनबी मिल गया है! बातचीत शुरू करें।');

    if (isVideoChatMode) {
        createPeerConnection(targetSocketId);
        if (data.initiate) {
            let offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('signal', { target: targetSocketId, signal: { type: 'offer', sdp: offer } });
        }
    }
});

socket.on('signal', async (data) => {
    if (!peerConnection) createPeerConnection(data.sender);

    let signal = data.signal;
    if (signal.type === 'offer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        let answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', { target: data.sender, signal: { type: 'answer', sdp: answer } });
    } else if (signal.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    } else if (signal.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
});

// WebRTC Connection Setup
function createPeerConnection(partnerId) {
    peerConnection = new RTCPeerConnection(rtcConfig);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;

    peerConnection.ontrack = (event) => {
        event.streams[0].getTracks().forEach(track => {
            remoteStream.addTrack(track);
        });
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { target: partnerId, signal: { candidate: event.candidate } });
        }
    };
}

// Text Chat Functionality
btnSend.addEventListener('click', sendMessage);
msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    let text = msgInput.value.trim();
    if (text === '') return;

    appendMessage('You', text, 'my-msg');
    socket.emit('send-message', { roomId: currentRoomId, message: text });
    msgInput.value = '';
}

socket.on('receive-message', (message) => {
    appendMessage('Stranger', message, 'partner-msg');
});

function appendMessage(sender, text, className) {
    let div = document.createElement('div');
    div.className = `msg ${className}`;
    div.innerHTML = `<strong>${sender}:</strong> ${text}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendSystemMessage(text) {
    let div = document.createElement('div');
    div.style.color = '#ffcc00';
    div.style.textAlign = 'center';
    div.style.margin = '5px 0';
    div.innerText = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Next Stranger Button
document.getElementById('btn-next').addEventListener('click', () => {
    resetChat();
    findPartner();
});

function resetChat() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    chatMessages.innerHTML = '';
}

// Controls (Mute, Cam Off)
let isMuted = false;
document.getElementById('btn-toggle-mic').addEventListener('click', () => {
    if(localStream) {
        let audioTrack = localStream.getAudioTracks()[0];
        isMuted = !isMuted;
        audioTrack.enabled = !isMuted;
        document.getElementById('btn-toggle-mic').innerText = isMuted ? '🎤 Unmute' : '🎤 Mute';
    }
});

let isCamOff = false;
document.getElementById('btn-toggle-cam').addEventListener('click', () => {
    if(localStream) {
        let videoTrack = localStream.getVideoTracks()[0];
        isCamOff = !isCamOff;
        videoTrack.enabled = !isCamOff;
        document.getElementById('btn-toggle-cam').innerText = isCamOff ? '📷 Cam On' : '📷 Cam Off';
    }
});
