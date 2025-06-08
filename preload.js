// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  //
  // 1) login.json 읽기/쓰기
  //
  loadLogin: () => ipcRenderer.invoke('login:load'),
  saveLogin: (newLoginData) => ipcRenderer.invoke('login:save', newLoginData),
  fetchLoginOptions: (params) => ipcRenderer.invoke('login:search', params),
  addCompany: (payload) => ipcRenderer.invoke('add:company', payload),
  addTeam: (payload) => ipcRenderer.invoke('add:team', payload),
  addPart: (payload) => ipcRenderer.invoke('add:part', payload),
  loginSubmit: (info) => ipcRenderer.invoke('login:submit', info),
  loginSubmit: (loginInfo) => ipcRenderer.invoke('login:submit', loginInfo),
  //
  // 2) 챗봇 목록 조회 (chatbot:getList)
  //
  getChatbotList: ({ company, team, part }) =>
    ipcRenderer.invoke('chatbot:getList', { company, team, part }),

  //
  // 3) 챗봇 인덱스 존재 여부 확인 (checkChatbotData)
  //
  checkChatbotData: ({ company, team, part }) =>
    ipcRenderer.invoke('checkChatbotData', { company, team, part }),

  //
  // 4) 챗봇 학습 (trainAndCreate)
  //
  trainAndCreate: (options) =>
    ipcRenderer.invoke('chatbot:trainAndCreate', options),

  //
  // 5) PDF 파일 선택 대화상자 (openFileDialog)
  //
  openFileDialog: () => ipcRenderer.invoke('openFileDialog'),

  //
  // 6) 학습 로그 구독 (onTrainChatbotLog)
  //
  onTrainChatbotLog: (callback) => {
    ipcRenderer.on('trainChatbot-log', callback);
  },

  //
  // 7) 특정 콜백 하나 제거 (offTrainChatbotLog)
  //
  offTrainChatbotLog: (callback) => {
    ipcRenderer.removeListener('trainChatbot-log', callback);
  },

  //
  // 8) 'trainChatbot-log' 채널의 모든 리스너 제거 (removeAllTrainChatbotLogListeners)
  //
  removeAllTrainChatbotLogListeners: () => {
    ipcRenderer.removeAllListeners('trainChatbot-log');
  },

  //
  // 9) 이미 학습된 챗봇 불러오기 (loadChatbot)
  //
  loadChatbot: (chatbotName) =>
    ipcRenderer.invoke('chatbot:load', { name: chatbotName }),

  //
  // 10) 챗봇 재학습 (retrainChatbot)
  //
  retrainChatbot: (chatbotName) =>
    ipcRenderer.invoke('chatbot:retrain', { name: chatbotName }),

  //
  // 11) 챗봇 삭제 (deleteChatbot)
  //
  deleteChatbot: (chatbotName) =>
    ipcRenderer.invoke('delete-chatbot', chatbotName),
});
