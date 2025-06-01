
document.getElementById('fileTriggerBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click(); // 숨긴 파일 input을 클릭
});

document.getElementById('fileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    document.getElementById('fileStatus').textContent = `✅ ${file.name} 업로드됨`;
  } else {
    document.getElementById('fileStatus').textContent = `❌ 파일이 선택되지 않았습니다`;
  }
});
