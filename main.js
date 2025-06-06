// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { spawn } = require('child_process');

let mainWindow;

/** ─────────────────────────────────────────────────────────────────────────────
 * 1. 앱 전용 데이터 디렉토리 및 JSON 파일 경로 정의
 *    - login.json: 로그인 정보 저장
 *    - chatbots.json: 챗봇 메타데이터(회사/팀/파트/이름/경로/생성일 등) 저장
 * ───────────────────────────────────────────────────────────────────────────── */
const userDataDir = app.getPath('userData');
const loginJsonPath = path.join(userDataDir, 'login.json');
const chatbotMetaPath = path.join(userDataDir, 'chatbots.json');

/** ─────────────────────────────────────────────────────────────────────────────
 * 2. ANSI 컬러 코드(이스케이프 시퀀스) 제거 유틸 함수
 * ───────────────────────────────────────────────────────────────────────────── */
function stripAnsiCodes(str) {
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

/** ─────────────────────────────────────────────────────────────────────────────
 * 3. login.json 읽기/쓰기 함수
 * ───────────────────────────────────────────────────────────────────────────── */
function ensureLoginJsonExists() {
  if (!fs.existsSync(loginJsonPath)) {
    const defaultData = {
      company: '',
      team: '',
      part: '',
      data: {},         // { [company]: { [team]: [partList] } }
      employeeID: '',
      employeeList: []
    };
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(loginJsonPath, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }
  try {
    const raw = fs.readFileSync(loginJsonPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    const defaultData = {
      company: '',
      team: '',
      part: '',
      data: {},
      employeeID: '',
      employeeList: []
    };
    fs.writeFileSync(loginJsonPath, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }
}

ipcMain.handle('login:load', async () => ensureLoginJsonExists());
ipcMain.handle('login:save', async (event, newLoginData) => {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(loginJsonPath, JSON.stringify(newLoginData, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/** ─────────────────────────────────────────────────────────────────────────────
 * 4. 챗봇 메타데이터 파일 초기화/관리
 * ───────────────────────────────────────────────────────────────────────────── */

// 4-1. 앱 시작 시 chatbots.json이 없으면 빈 배열로 생성
async function ensureChatbotMetaFile() {
  try {
    await fsPromises.access(chatbotMetaPath);
    // 이미 존재한다면 아무 작업도 하지 않음
  } catch (e) {
    await fsPromises.mkdir(userDataDir, { recursive: true });
    await fsPromises.writeFile(chatbotMetaPath, JSON.stringify([], null, 2), 'utf-8');
  }
}

// 4-2. chatbots.json에서 목록을 읽어 JavaScript 배열로 반환
async function readChatbotList() {
  try {
    const raw = await fsPromises.readFile(chatbotMetaPath, 'utf-8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('❌ 챗봇 목록 읽기 실패:', e);
    return [];
  }
}

// 4-3. 새로운 챗봇 메타데이터를 추가하고 JSON 파일 업데이트
async function addNewChatbot(meta) {
  const list = await readChatbotList();
  list.push(meta);
  await fsPromises.writeFile(chatbotMetaPath, JSON.stringify(list, null, 2), 'utf-8');
  return meta;
}

// 4-4. 기존 챗봇 메타데이터 수정 (재학습 시 lastTrainedAt 업데이트)
async function updateChatbotMeta(name, newFields) {
  const list = await readChatbotList();
  const idx = list.findIndex((c) => c.name === name);
  if (idx === -1) throw new Error('해당 챗봇을 찾을 수 없습니다.');
  list[idx] = { ...list[idx], ...newFields };
  await fsPromises.writeFile(chatbotMetaPath, JSON.stringify(list, null, 2), 'utf-8');
  return list[idx];
}

// 4-5. 챗봇 메타데이터에서 하나를 삭제
async function removeChatbotMeta(name) {
  const list = await readChatbotList();
  const filtered = list.filter((c) => c.name !== name);
  await fsPromises.writeFile(chatbotMetaPath, JSON.stringify(filtered, null, 2), 'utf-8');
  return filtered;
}

/** ─────────────────────────────────────────────────────────────────────────────
 * 5. Electron 윈도우 생성 함수
 * ───────────────────────────────────────────────────────────────────────────── */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

/** ─────────────────────────────────────────────────────────────────────────────
 * 6. 앱 준비(ready) 시 실행: 윈도우 생성 + chatbots.json 초기화
 * ───────────────────────────────────────────────────────────────────────────── */
app.whenReady().then(async () => {
  // 6-1. 챗봇 메타 파일이 없으면 빈 배열로 초기화
  await ensureChatbotMetaFile();

  // 6-2. 메인 윈도우 생성
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/** ─────────────────────────────────────────────────────────────────────────────
 * 7. IPC 핸들러: 챗봇 메타데이터 관련
 * ───────────────────────────────────────────────────────────────────────────── */

// 7-1. 저장된 챗봇 목록 조회 요청 (회사/팀/파트 필터링)
ipcMain.handle('chatbot:getList', async (event, { company, team, part }) => {
  const list = await readChatbotList();
  const filtered = list.filter(
    (c) => c.company === company && c.team === team && c.part === part
  );
  return filtered;
});

// 7-2. 새 챗봇 생성 + 학습 요청
ipcMain.handle(
  'chatbot:trainAndCreate',
  async (event, { company, team, part, name, pdfPaths }) => {
    try {
      // 1) 챗봇 디렉토리 경로: userData/chatbots/회사/팀/파트/이름
      const baseChatbotDir = path.join(
        userDataDir,
        'chatbots',
        company,
        team,
        part,
        name
      );
      const sourceDir = path.join(baseChatbotDir, 'source_data');
      const indexDir = path.join(baseChatbotDir, 'index');

      // 2) 디렉토리 생성
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(indexDir, { recursive: true });

      // 3) PDF 파일들을 source_data 아래로 복사
      const copiedPdfPaths = [];
      for (const originalPdfPath of pdfPaths) {
        const fileName = path.basename(originalPdfPath);
        const dest = path.join(sourceDir, fileName);
        fs.copyFileSync(originalPdfPath, dest);
        copiedPdfPaths.push(dest);
      }

      // 4) 파이썬 스크립트 경로 확인
      const scriptPath = path.join(__dirname, 'backend', 'train_index.py');
      if (!fs.existsSync(scriptPath)) {
        mainWindow.webContents.send('trainChatbot-log', {
          type: 'stderr',
          message: `❌ train_index.py를 찾을 수 없습니다: ${scriptPath}`
        });
        throw new Error(`No such file: ${scriptPath}`);
      }

      // 5) 학습 시작 로그
      mainWindow.webContents.send('trainChatbot-log', {
        type: 'info',
        message: '🚀 학습을 시작합니다...'
      });

      // 6) 파이썬 프로세스 spawn: --pdf <경로들> --output <indexDir> 등
      await new Promise((resolve, reject) => {
        const args = [
          scriptPath,
          '--pdf',
          ...copiedPdfPaths,
          '--output',
          indexDir,
          '--userData',
          userDataDir,
          '--company',
          company,
          '--team',
          team,
          '--part',
          part,
          '--name',
          name
        ];

        const pyProcess = spawn('python3', args);

        // stdout 로그 처리
        pyProcess.stdout.on('data', (data) => {
          const raw = data.toString();
          const clean = stripAnsiCodes(raw);
          mainWindow.webContents.send('trainChatbot-log', {
            type: 'stdout',
            message: clean
          });
        });

        // stderr 로그 처리
        pyProcess.stderr.on('data', (data) => {
          const raw = data.toString();
          const clean = stripAnsiCodes(raw);
          mainWindow.webContents.send('trainChatbot-log', {
            type: 'stderr',
            message: clean
          });
        });

        pyProcess.on('error', (err) => {
          mainWindow.webContents.send('trainChatbot-log', {
            type: 'stderr',
            message: `❌ 학습 중 오류 발생: ${err.message}`
          });
          reject(err);
        });

        pyProcess.on('close', (code) => {
          if (code === 0) {
            mainWindow.webContents.send('trainChatbot-log', {
              type: 'info',
              message: '✅ 학습이 정상적으로 완료되었습니다.'
            });
            resolve();
          } else {
            mainWindow.webContents.send('trainChatbot-log', {
              type: 'stderr',
              message: `❌ train_index.py exited with code ${code}`
            });
            reject(new Error(`train_index.py exited with code ${code}`));
          }
        });
      });

      // 7) Python 학습 완료 시점: 메타 등록
      const faissIndexPath = path.join(indexDir, 'faiss.index');
      const now = new Date().toISOString();
      const newMeta = {
        company,
        team,
        part,
        name,
        indexPath: faissIndexPath,
        createdAt: now,
        lastTrainedAt: now
      };
      await addNewChatbot(newMeta);

      return { success: true, chatbot: newMeta };
    } catch (err) {
      console.error('❌ chatbot:trainAndCreate 에러:', err);
      return { success: false, error: err.message };
    }
  }
);

// 7-3. 챗봇 불러오기 요청
ipcMain.handle('chatbot:load', async (event, { name }) => {
  try {
    const list = await readChatbotList();
    const meta = list.find((c) => c.name === name);
    if (!meta) throw new Error('해당 챗봇 정보를 찾을 수 없습니다.');

    // TODO: 실제 챗봇 로드 로직(예: 메모리나 백엔드에서 모델 초기화 등)
    return { success: true, chatbot: meta };
  } catch (err) {
    console.error('❌ 챗봇 불러오기 중 오류:', err);
    return { success: false, error: err.message };
  }
});

// 7-4. 챗봇 재학습 요청
ipcMain.handle('chatbot:retrain', async (event, { name }) => {
  try {
    const list = await readChatbotList();
    const meta = list.find((c) => c.name === name);
    if (!meta) throw new Error('해당 챗봇 정보를 찾을 수 없습니다.');

    // TODO: 실제 재학습 로직(예: Python 스크립트 재호출)
    // 여기선 인덱스만 재갱신한다고 가정하고, lastTrainedAt만 업데이트
    const updated = await updateChatbotMeta(name, {
      lastTrainedAt: new Date().toISOString()
    });
    return { success: true, chatbot: updated };
  } catch (err) {
    console.error('❌ 챗봇 재학습 중 오류:', err);
    return { success: false, error: err.message };
  }
});

// 7-5. 챗봇 파일 업로드(파일 선택) 대화상자 요청
ipcMain.handle('dialog:openChatbotFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '업로드할 챗봇 데이터 파일을 선택하세요',
    properties: ['openFile'],
    filters: [
      { name: 'Chatbot Data', extensions: ['json', 'csv', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (canceled || filePaths.length === 0) {
    return null;
  }
  return filePaths[0];
});

/** ─────────────────────────────────────────────────────────────────────────────
 * 8. 기존 IPC 핸들러: 챗봇 인덱스 존재 여부 확인
 * ───────────────────────────────────────────────────────────────────────────── */
ipcMain.handle('checkChatbotData', async (event, { company, team, part }) => {
  try {
    const indexPath = path.join(
      userDataDir,
      'chatbots',
      company,
      team,
      part,
      'index',
      'faiss.index'
    );
    return fs.existsSync(indexPath);
  } catch {
    return false;
  }
});

/** ─────────────────────────────────────────────────────────────────────────────
 * 9. PDF 학습(파이썬 실행 → stdout/stderr → 렌더러 전송)
 *    (※ 이 IPC는 기존 trainChatbot 로직이므로, 이제는 trainAndCreate로 대체 권장)
 * ───────────────────────────────────────────────────────────────────────────── */
ipcMain.handle(
  'trainChatbot',
  async (event, { company, team, part, pdfPaths }) => {
    const baseDir = path.join(userDataDir, 'chatbots', company, team, part);
    const sourceDir = path.join(baseDir, 'source_data');
    const indexDir = path.join(baseDir, 'index');

    try {
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(indexDir, { recursive: true });

      const copiedPdfPaths = [];
      for (const originalPdfPath of pdfPaths) {
        const fileName = path.basename(originalPdfPath);
        const dest = path.join(sourceDir, fileName);
        fs.copyFileSync(originalPdfPath, dest);
        copiedPdfPaths.push(dest);
      }

      const scriptPath = path.join(__dirname, 'backend', 'train_index.py');
      if (!fs.existsSync(scriptPath)) {
        mainWindow.webContents.send('trainChatbot-log', {
          type: 'stderr',
          message: `❌ train_index.py를 찾을 수 없습니다: ${scriptPath}`
        });
        throw new Error(`No such file: ${scriptPath}`);
      }

      mainWindow.webContents.send('trainChatbot-log', {
        type: 'info',
        message: '🚀 학습을 시작합니다...'
      });

      return await new Promise((resolve, reject) => {
        const args = [
          scriptPath,
          '--pdf',
          ...copiedPdfPaths,
          '--userData',
          userDataDir,
          '--company',
          company,
          '--team',
          team,
          '--part',
          part
        ];

        const pyProcess = spawn('python3', args);

        pyProcess.stdout.on('data', (data) => {
          const raw = data.toString();
          const clean = stripAnsiCodes(raw);
          mainWindow.webContents.send('trainChatbot-log', {
            type: 'stdout',
            message: clean
          });
        });

        pyProcess.stderr.on('data', (data) => {
          const raw = data.toString();
          const clean = stripAnsiCodes(raw);
          mainWindow.webContents.send('trainChatbot-log', {
            type: 'stderr',
            message: clean
          });
        });

        pyProcess.on('error', (err) => {
          mainWindow.webContents.send('trainChatbot-log', {
            type: 'stderr',
            message: `❌ 학습 중 오류 발생: ${err.message}`
          });
          reject(err);
        });

        pyProcess.on('close', (code) => {
          if (code === 0) {
            mainWindow.webContents.send('trainChatbot-log', {
              type: 'info',
              message: '✅ 학습이 정상적으로 완료되었습니다.'
            });
            resolve(true);
          } else {
            mainWindow.webContents.send('trainChatbot-log', {
              type: 'stderr',
              message: `❌ train_index.py exited with code ${code}`
            });
            reject(new Error(`train_index.py exited with code ${code}`));
          }
        });
      });
    } catch (err) {
      mainWindow.webContents.send('trainChatbot-log', {
        type: 'stderr',
        message: `❌ trainChatbot error: ${err.message}`
      });
      throw err;
    }
  }
);

/** ─────────────────────────────────────────────────────────────────────────────
 * 10. PDF 파일 선택 대화상자 (기존 코드)
 * ───────────────────────────────────────────────────────────────────────────── */
ipcMain.handle('openFileDialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '학습할 PDF 파일을 선택하세요',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });
  return canceled ? [] : filePaths;
});

// ────────────────────────────────────────────────────────────────────────────────
//  deleteChatbot IPC 핸들러 구현
//  이제 회사/팀/파트/챗봇 이름을 메타데이터에서 찾아야 합니다.
// ────────────────────────────────────────────────────────────────────────────────
ipcMain.handle('delete-chatbot', async (event, chatbotName) => {
  // 1) 유효성 검사 및 메타데이터 조회
  if (typeof chatbotName !== 'string' || chatbotName.trim() === '') {
    return { success: false, error: '유효한 챗봇 이름을 전달받지 못했습니다.' };
  }

  const allMetas = await readChatbotList();
  const meta = allMetas.find((c) => c.name === chatbotName);
  if (!meta) {
    // 메타가 없으면 이미 삭제되었거나, 존재하지 않는 챗봇
    console.warn(`delete-chatbot: 메타데이터를 찾을 수 없음 → ${chatbotName}`);
    return { success: false, error: '삭제할 챗봇 메타데이터를 찾을 수 없습니다.' };
  }

  // 2) 사용자 데이터 경로 및 챗봇 저장 경로 계산
  //   → userData/chatbots/회사/팀/파트/챗봇이름
  const targetFolder = path.join(
    userDataDir,
    'chatbots',
    meta.company,
    meta.team,
    meta.part,
    meta.name
  );

  // 3) ‘폴더 존재 여부’ 검사
  try {
    await fsPromises.access(targetFolder);
    // 접근 가능 → 폴더가 존재함
  } catch (err) {
    console.warn(`delete-chatbot: 폴더를 찾을 수 없음 → ${targetFolder}`);
    // 폴더가 없으면, 메타 데이터만 삭제해도 무방
    await removeChatbotMeta(chatbotName);
    return {
      success: false,
      error: '챗봇 폴더를 찾을 수 없어 메타데이터만 삭제했습니다.',
      warning: '실제 데이터 폴더가 존재하지 않아 메타데이터만 제거했습니다.'
    };
  }

  // 4) 폴더 재귀 삭제
  try {
    // Node.js v14 이상에서는 fsPromises.rm을 권장
    await fsPromises.rm(targetFolder, { recursive: true, force: true });
    console.log(`delete-chatbot: 성공적으로 삭제됨 → ${targetFolder}`);

    // 5) 메타데이터에서도 해당 챗봇 정보 제거
    await removeChatbotMeta(chatbotName);
    console.log('delete-chatbot: chatbots.json 업데이트 완료');

    return { success: true };
  } catch (fsErr) {
    console.error(`delete-chatbot: 삭제 중 오류 → ${fsErr}`);
    return { success: false, error: fsErr.message || String(fsErr) };
  }
});
