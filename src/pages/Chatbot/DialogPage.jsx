// src/pages/Chatbot/DialogPage.jsx

import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import styles from './dialog.module.css';

// React-PDF 워커 설정
import pdfWorkerUrl from 'react-pdf/dist/esm/pdf.worker.entry.js?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function DialogPage(props) {
  const {
    company,
    team,
    part,
    chatbotName: initialName,
    createdAt: initialCreated,
    lastTrainedAt: initialLast,
    pdfUrl: initialPdfUrl,
    onClose,
  } = props;

  const navigate = useNavigate();

  // ── 기존 state들 ──
  const [chatbotName, setChatbotName] = useState(initialName || '');
  const [createdAt, setCreatedAt] = useState(initialCreated || '');
  const [lastTrainedAt, setLastTrainedAt] = useState(initialLast || '');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showRetrieval, setShowRetrieval] = useState(false);
  const [lastMetadata, setLastMetadata] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(initialPdfUrl || '');

  // ── Retrieval 패널 스크롤＋PDF 뷰어용 ref ──
  const pdfViewerRef = useRef(null);

  // ── 추가: Retrieval 패널 Zoom용 state, ref ──
  const [scale, setScale] = useState(1.0);
  const [panelWidth, setPanelWidth] = useState(0);
  const retrievalPanelRef = useRef(null);

  // ── 추가: IME(조합) 상태 감지 ──
  const [isComposing, setIsComposing] = useState(false);

  // ── localStorage에서 메타 정보 불러오기 ──
  useEffect(() => {
    if (!initialName) {
      const stored = localStorage.getItem('activeChatbotMeta');
      if (stored) {
        try {
          const meta = JSON.parse(stored);
          setChatbotName(meta.name || '');
          setCreatedAt(meta.createdAt || '');
          setLastTrainedAt(meta.lastTrainedAt || '');
        } catch (e) {
          console.warn('activeChatbotMeta 파싱 실패:', e);
        }
      }
    }
  }, [initialName]);

  // ── 디버깅: 생성/마지막 학습 시간 로그 ──
  useEffect(() => {
    console.log('state.createdAt:', createdAt, 'state.lastTrainedAt:', lastTrainedAt);
  }, [createdAt, lastTrainedAt]);

  // ── 부모에서 전달된 initialPdfUrl 변경 시 업데이트 ──
  useEffect(() => {
    if (initialPdfUrl) {
      setPdfUrl(initialPdfUrl);
      console.log('Props로 전달된 PDF URL:', initialPdfUrl);
    }
  }, [initialPdfUrl]);

  // ── Retrieval 패널이 렌더될 때/윈도우 리사이즈 시에 너비를 측정 ──
  useEffect(() => {
  function updatePanelWidth() {
    if (retrievalPanelRef.current) {
      setPanelWidth(retrievalPanelRef.current.getBoundingClientRect().width);
    }
  }
  if (showRetrieval) {
    updatePanelWidth();
  }
  window.addEventListener('resize', updatePanelWidth);
  return () => window.removeEventListener('resize', updatePanelWidth);
}, [showRetrieval]);

  // ── Zoom 버튼 핸들러 ──
  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 3));
  };
  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.4));
  };

  // ── “전송” 버튼 클릭 시 호출 ──
  const handleSend = async () => {
    if (input.trim() === '') return;

    setMessages(prev => [...prev, { from: 'user', text: input }]);
    const question = input;
    setInput('');
    setIsTyping(true);

    try {
      const chat_history = messages.map(msg => ({
        role: msg.from === 'user' ? 'user' : 'assistant',
        content: msg.text,
      }));

      const res = await axios.post(
        'http://localhost:8088/chat',
        {
          company,
          team,
          part,
          chatbot_name: chatbotName,
          question,
          chat_history,
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const { answer, sources } = res.data;
      setMessages(prev => [...prev, { from: 'bot', text: answer }]);
      setLastMetadata({
        pages: Array.isArray(sources) ? sources.map(s => s.page) : [],
        scores: Array.isArray(sources) ? sources.map(() => 0) : []
      });
    } catch (err) {
      console.error('챗봇 API 요청 중 오류:', err);
      setMessages(prev => [
        ...prev,
        { from: 'bot', text: '오류가 발생했습니다. 다시 시도해주세요.' }
      ]);
      setLastMetadata(null);
    } finally {
      setIsTyping(false);
    }
  };

  // ── 시간 포맷 함수 ──
  const formatDateTime = (isoValue) => {
    if (!isoValue) return '-';
    try {
      return new Date(isoValue).toLocaleString();
    } catch {
      return '-';
    }
  };

  return (
    <div
      className={styles.container}
      style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}
    >
      {/* ── 상단 바(Header) ── */}
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <button
            className={styles.homeButton}
            onClick={() => {
              if (typeof onClose === 'function') onClose();
              navigate('/chatbot');
            }}
            title="홈으로"
          >
            🏠
          </button>
          <span className={styles.headerTitle}>
            {chatbotName || '이름 없음'}
          </span>
          <span className={styles.headerMeta}>
            생성: {formatDateTime(createdAt)} | 마지막 학습: {formatDateTime(lastTrainedAt)}
          </span>
        </div>
      </div>

      {/* ── 콘텐츠 영역: 채팅 + Retrieval ── */}
      <div
        className={styles.contentWrapper}
        style={{ flex: 1, display: 'flex', overflow: 'hidden' }}
      >
        {/* ── 좌측 채팅 래퍼 ── */}
        <div
          className={styles.chatWrapper}
          style={{ display: 'flex', flexDirection: 'column', flex: 1 }}
        >
          {/* ── 채팅 메시지 목록 ── */}
          <div
            className={styles.chatList}
            style={{ flex: 1, overflowY: 'auto' }}
          >
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={styles.chatMessage}
                style={{ textAlign: msg.from === 'user' ? 'right' : 'left' }}
              >
                <span
                  className={msg.from === 'user' ? styles.userBubble : styles.botBubble}
                >
                  {msg.text}
                </span>
              </div>
            ))}

            {/* 봇 타이핑 인디케이터 */}
            {isTyping && (
              <div className={styles.chatMessage} style={{ textAlign: 'left' }}>
                <span className={styles.botBubble}>
                  <span className={styles.typingIndicator}>
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* ── 입력창 + 버튼 영역 ── */}
          <div className={styles.inputArea} style={{ flexShrink: 0 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="질문을 입력하세요..."
              className={styles.inputField}
            />
            <button
              className={`${styles.infoButton} ${!pdfUrl ? styles.infoButtonDisabled : ''}`}
              onClick={() => setShowRetrieval(prev => !prev)}
              disabled={!pdfUrl}
              title={pdfUrl ? 'Retrieval 정보 보기' : 'PDF URL이 없습니다'}
            >
              정보보기
            </button>
            <button className={styles.sendButton} onClick={handleSend}>
              전송
            </button>
          </div>
        </div>

        {/* ── 우측 Retrieval 패널 ── */}
        {showRetrieval && lastMetadata && pdfUrl && (
          <div
            ref={retrievalPanelRef}
            className={styles.retrievalPanel}
            style={{ display: 'flex', flexDirection: 'column', width: '50%' }}
          >
            {/* Retrieval Header */}
            <div className={styles.retrievalHeader} style={{ display: 'flex', alignItems: 'center' }}>
              <h3 className={styles.retrievalHeaderTitle} style={{ flex: 1 }}>
                Retrieval 정보
              </h3>

              {/* Zoom 버튼 */}
              <button
                onClick={handleZoomOut}
                style={{
                  marginRight: '8px',
                  width: '28px',
                  height: '28px',
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  border: '1px solid #555',
                  color: '#fff',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '18px',
                }}
                title="축소"
              >
                －
              </button>
              <button
                onClick={handleZoomIn}
                style={{
                  marginRight: '16px',
                  width: '28px',
                  height: '28px',
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  border: '1px solid #555',
                  color: '#fff',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '18px',
                }}
                title="확대"
              >
                ＋
              </button>

              {/* 닫기 버튼 */}
              <button
                className={styles.retrievalCloseButton}
                onClick={() => setShowRetrieval(false)}
                title="닫기"
              >
                ×
              </button>
            </div>

            {/* Retrieval Content: 썸네일 렌더 + 스크롤 */}
            <div
              className={styles.retrievalContent}
              style={{ flex: 1, overflow: 'auto' }}
            >
              {lastMetadata.pages.length === 0 ? (
                <p style={{ color: '#e0e0e0', padding: '8px' }}>
                  Retrieval 데이터가 없습니다.
                </p>
              ) : (
                lastMetadata.pages.map((pg, idx) => {
                  const pageNum = pg + 1;
                  return (
                    <div
                      key={idx}
                      className={styles.retrievalItem}
                      style={{ marginBottom: '12px', cursor: 'pointer' }}
                      onClick={() => {
                        if (
                          pdfViewerRef.current &&
                          typeof pdfViewerRef.current.scrollToPage === 'function'
                        ) {
                          pdfViewerRef.current.scrollToPage(pg);
                        }
                      }}
                    >
                      <div className={styles.retrievalItemHeader}>
                        페이지 {pageNum} ({(lastMetadata.scores[idx] * 100).toFixed(1)}%)
                      </div>
                      <div className={styles.thumbnailContainer}
                        style={{ textAlign: 'center', overflow: 'auto' }}>
                        <Document file={pdfUrl} renderMode="canvas">
                          <Page
                            pageNumber={pageNum}
                            width={panelWidth * scale}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                          />
                        </Document>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
