const tabVideoBtn = document.getElementById('tabVideoBtn');
const tabPhotoBtn = document.getElementById('tabPhotoBtn');
const tabCameraBtn = document.getElementById('tabCameraBtn');

const photoPanel = document.getElementById('photoPanel');
const videoPanel = document.getElementById('videoPanel');
const cameraPanel = document.getElementById('cameraPanel');

const photoStage = document.getElementById('photoStage');
const videoStage = document.getElementById('videoStage');
const cameraStage = document.getElementById('cameraStage');

async function setMode(mode) {
  tabPhotoBtn.classList.remove('active');
  tabVideoBtn.classList.remove('active');
  tabCameraBtn.classList.remove('active');

  photoPanel.style.display = 'none';
  videoPanel.style.display = 'none';
  cameraPanel.style.display = 'none';

  photoStage.style.display = 'none';
  videoStage.style.display = 'none';
  cameraStage.style.display = 'none';

  if (mode === 'photo') {
    tabPhotoBtn.classList.add('active');
    photoPanel.style.display = 'flex';
    photoStage.style.display = 'flex';
    if (typeof vPauseIfPlaying === 'function') vPauseIfPlaying();
    if (typeof cPauseIfRunning === 'function') cPauseIfRunning();
  } else if (mode === 'video') {
    tabVideoBtn.classList.add('active');
    videoPanel.style.display = 'flex';
    videoStage.style.display = 'flex';
    if (typeof cPauseIfRunning === 'function') cPauseIfRunning();
  } else {
    tabCameraBtn.classList.add('active');
    cameraPanel.style.display = 'flex';
    cameraStage.style.display = 'flex';
    if (typeof vPauseIfPlaying === 'function') vPauseIfPlaying();
    if (cStream && cVideo.srcObject) {
      try {
        await cVideo.play();
        cStartLoop();
        cStatusEl.textContent = 'поток камеры снова активен';
      } catch (err) {
        cStatusEl.textContent = 'не удалось возобновить поток камеры';
      }
    }
  }
}

tabPhotoBtn.addEventListener('click', () => setMode('photo'));
tabVideoBtn.addEventListener('click', () => setMode('video'));
tabCameraBtn.addEventListener('click', () => setMode('camera'));
