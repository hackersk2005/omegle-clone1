// Connect to main namespace
const socket = io('/');

const conversation = document.querySelector('.conversation');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let alreadyTyping = false;
let localStream;
let peerConnection;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Update number of online users
socket.on('numberOfOnline', size => {
    document.querySelector('.online').innerHTML = `${size.toLocaleString()} online now`;
});

// Start searching for a chat partner
document.querySelector('#start').addEventListener('click', () => {
    socket.emit('start', socket.id);
});

// Display searching message
socket.on('searching', msg => {
    conversation.innerHTML = `<div class="message">${msg}</div>`;
});

// Chat start message
socket.on('chatStart', msg => {
    conversation.innerHTML = `<div class="message">${msg}</div>`;
    document.querySelector('#stop').classList.remove('hide');
    document.querySelector('#start').classList.add('hide');
    document.querySelector('#text').disabled = false;
    document.querySelector('#send').disabled = false;

    // Initialize video chat
    initVideoChat();
});

// Initialize local video stream
function initLocalStream() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }) // Enable audio
        .then(stream => {
            localStream = stream;
            localVideo.srcObject = stream;
        })
        .catch(error => {
            console.error('Error accessing media devices.', error);
        });
}

// Start the video chat
function initVideoChat() {
    initLocalStream();
    peerConnection = new RTCPeerConnection(config);

    // Add audio and video tracks to peer connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { target: socket.id, signal: event.candidate });
        }
    };

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.createOffer()
        .then(offer => {
            return peerConnection.setLocalDescription(offer);
        })
        .then(() => {
            socket.emit('signal', { target: socket.id, signal: peerConnection.localDescription });
        });
}

// Handle signaling messages
socket.on('signal', (data) => {
    if (data.signal) {
        if (data.signal.type === 'offer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal))
                .then(() => {
                    return peerConnection.createAnswer();
                })
                .then(answer => {
                    return peerConnection.setLocalDescription(answer);
                })
                .then(() => {
                    socket.emit('signal', { target: data.sender, signal: peerConnection.localDescription });
                });
        } else if (data.signal.type === 'answer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
        } else if (data.signal.candidate) {
            peerConnection.addIceCandidate(new RTCIceCandidate(data.signal));
        }
    }
});

// Event listener for form submit
document.querySelector('.form').addEventListener('submit', e => {
    e.preventDefault();
    submitMessage();
});

// Event listener for Enter key
document.querySelector('#text').onkeydown = e => {
    if (e.keyCode === 13 && !e.shiftKey) {
        e.preventDefault();
        submitMessage();
    }
}

// Event listener for user typing
document.querySelector('#text').addEventListener('input', e => {
    if (!alreadyTyping) {
        socket.emit('typing', 'Stranger is typing...');
        alreadyTyping = true;
    }
    if (e.target.value === '') {
        socket.emit('doneTyping');
        alreadyTyping = false;
    }
});

// Event listener when textarea loses focus
document.querySelector('#text').addEventListener('blur', () => {
    socket.emit('doneTyping');
    alreadyTyping = false;
});

// Event listener for textarea click
document.querySelector('#text').addEventListener('click', e => {
    if (e.target.value !== '') {
        socket.emit('typing', 'Stranger is typing...');
        alreadyTyping = true;
    }
});

// Receive new messages and update HTML
socket.on('newMessageToClient', data => {
    const notStranger = data.id === socket.id;
    conversation.innerHTML += `
        <div class="chat">
            <span class="${notStranger ? 'name blue' : 'name red'}">${notStranger ? 'You: ' : 'Stranger: '}</span>
            <span class="text">${data.msg}</span>
        </div>
    `;
    conversation.scrollTo(0, conversation.scrollHeight);
});

// Display typing messages
socket.on('strangerIsTyping', msg => {
    conversation.innerHTML += `<div class="message typing">${msg}</div>`;
    conversation.scrollTo(0, conversation.scrollHeight);
});

// Remove typing message
socket.on('strangerIsDoneTyping', () => {
    const typing = document.querySelector('.typing');
    if (typing) {
        typing.remove();
    }
});

// Handle user disconnect
socket.on('goodBye', msg => {
    conversation.innerHTML += `<div class="message">${msg}</div>`;
    reset();
});

// Stop button
document.querySelector('#stop').addEventListener('click', () => {
    document.querySelector('#stop').classList.add('hide');
    document.querySelector('#really').classList.remove('hide');
});

// Confirm stop button
document.querySelector('#really').addEventListener('click', () => {
    socket.emit('stop');
});

// Display disconnect message
socket.on('strangerDisconnected', msg => {
    conversation.innerHTML += `<div class="message">${msg}</div>`;
    reset();
});

// End chat message
socket.on('endChat', msg => {
    conversation.innerHTML += `<div class="message">${msg}</div>`;
    reset();
});

// Submit message function
function submitMessage() {
    const input = document.querySelector('#text');
    if (/\S/.test(input.value)) {
        socket.emit('doneTyping');
        socket.emit('newMessageToServer', input.value);
        input.value = '';
        alreadyTyping = false;
    }
}

// Reset chat interface
function reset() {
    document.querySelector('#start').classList.remove('hide');
    document.querySelector('#stop').classList.add('hide');
    document.querySelector('#really').classList.add('hide');

    const text = document.querySelector('#text');
    text.disabled = true;
    text.value = '';
    document.querySelector('#send').disabled = true;

    const typing = document.querySelector('.typing');
    if (typing) {
        typing.remove();
    }

    alreadyTyping = false;

    // Stop local stream and clear video sources
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
        remoteVideo.srcObject = null;
    }

    conversation.scrollTo(0, conversation.scrollHeight);
}
