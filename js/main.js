document.addEventListener('DOMContentLoaded', () => {
  console.log('AM-0 init');

  if (typeof setMode !== 'function') {
    console.error('Ошибка: setMode не найден. Проверь порядок подключения скриптов.');
    return;
  }

  setMode('photo');
});

