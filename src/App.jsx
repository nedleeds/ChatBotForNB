import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login/LoginPage';
import ChatbotPage from './pages/Chatbot/ChatbotPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* 기본 경로로 접속 시 /login으로 리다이렉트 */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 로그인 화면 */}
        <Route path="/login" element={<LoginPage />} />

        {/* 챗봇 화면 */}
        <Route path="/chatbot" element={<ChatbotPage />} />

        {/* 그 외 존재하지 않는 경로는 다시 로그인으로 */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </HashRouter>
  );
}
