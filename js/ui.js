const tabVideoBtn = document.getElementById('tabVideoBtn');
const tabPhotoBtn = document.getElementById('tabPhotoBtn');
const tabCameraBtn = document.getElementById('tabCameraBtn');

const photoPanel = document.getElementById('photoPanel');
const videoPanel = document.getElementById('videoPanel');
const cameraPanel = document.getElementById('cameraPanel');

const photoStage = document.getElementById('photoStage');
const videoStage = document.getElementById('videoStage');
const cameraStage = document.getElementById('cameraStage');

async function setMode(mode) { ... }

tabPhotoBtn.addEventListener('click', () => setMode('photo'));
tabVideoBtn.addEventListener('click', () => setMode('video'));
tabCameraBtn.addEventListener('click', () => setMode('camera'));
