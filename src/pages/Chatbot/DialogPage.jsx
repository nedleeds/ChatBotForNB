import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import styles from './dialog.module.css';

// // PDF.js worker 설정
// pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

// React-PDF이 자체 제공하는 워커 엔트리 파일을 Vite에서 URL로 불러오도록 합니다.
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
    pdfUrl: initialPdfUrl,   // 전체 URL을 props로 받도록 이름 변경
    onClose,
  } = props;

  const navigate = useNavigate();
  const [chatbotName, setChatbotName] = useState(initialName || '');
  const [createdAt, setCreatedAt] = useState(initialCreated || '');
  const [lastTrainedAt, setLastTrainedAt] = useState(initialLast || '');
  const [messages, setMessages] = useState([]);   // 채팅 메시지 히스토리
  const [input, setInput] = useState('');         // 입력창 값
  const [isTyping, setIsTyping] = useState(false); // 봇 타이핑 여부
  const [showRetrieval, setShowRetrieval] = useState(false);
  const [lastMetadata, setLastMetadata] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(initialPdfUrl || ''); // 상태로 관리
  const pdfViewerRef = useRef(null);

  // 초기 렌더링 시, localStorage에 저장된 activeChatbotMeta 읽어서 state 보완
  useEffect(() => {
    if (!initialName) {
      const stored = localStorage.getItem('activeChatbotMeta');
      if (stored) {
        try {
          const meta = JSON.parse(stored);
          console.log('localStorage에서 로드된 meta:', meta);
          setChatbotName(meta.name || '');
          setCreatedAt(meta.createdAt || '');
          setLastTrainedAt(meta.lastTrainedAt || '');
        } catch (e) {
          console.warn('activeChatbotMeta 파싱 실패:', e);
        }
      }
    }
  }, [initialName]);

  // 디버깅: state에 저장된 생성/마지막 학습 시간 확인
  useEffect(() => {
    console.log('state.createdAt:', createdAt, ' state.lastTrainedAt:', lastTrainedAt);
  }, [createdAt, lastTrainedAt]);

  // 부모에서 넘겨준 initialPdfUrl이 바뀌면 갱신
  useEffect(() => {
    if (initialPdfUrl) {
      setPdfUrl(initialPdfUrl);
      console.log('Props로 전달된 PDF URL:', initialPdfUrl);
    }
  }, [initialPdfUrl]);

  // 사용자가 “전송” 버튼 클릭 시 호출
  const handleSend = async () => {
    if (input.trim() === '') return;

    // (1) 화면에 사용자 메시지 추가
    setMessages(prev => [...prev, { from: 'user', text: input }]);
    const question = input;
    setInput('');

    // (2) 봇 타이핑 시작
    setIsTyping(true);

    try {
      // 대화 히스토리를 role/content 형태로 변환
      const chat_history = messages.map(msg => ({
        role: msg.from === 'user' ? 'user' : 'assistant',
        content: msg.text,
      }));

      console.log('▶ 프론트에서 보낼 데이터:', {
        company,
        team,
        part,
        chatbot_name: chatbotName,
        question,
        chat_history
      });

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

      console.log('◀ 백엔드 응답(res.data):', res.data);

      const { answer, sources } = res.data;

      // (3) 화면에 봇 응답 추가
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
      // (4) 봇 타이핑 종료
      setIsTyping(false);
    }
  };

  // Enter 키 입력 시 전송
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  // 시간 문자열을 “YYYY-MM-DD HH:mm:ss”로 포맷팅
  const formatDateTime = (isoValue) => {
    if (!isoValue) return '-';
    try {
      const date = new Date(isoValue);
      return date.toLocaleString();
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
          {/* 홈 버튼 */}
          <button
            className={styles.homeButton}
            onClick={() => {
              if (typeof onClose === 'function') {
                onClose();
              }
              navigate('/chatbot');
            }}
            title="홈으로"
          >
            🏠
          </button>

          {/* 챗봇 이름 */}
          <span className={styles.headerTitle}>
            {chatbotName || '이름 없음'}
          </span>

          {/* 생성/마지막 학습 메타 */}
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
          {/* ── 채팅 메시지 목록 (스크롤 가능) ── */}
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
                  className={
                    msg.from === 'user' ? styles.userBubble : styles.botBubble
                  }
                >
                  {msg.text}
                </span>
              </div>
            ))}

            {/* 봇 타이핑 인디케이터 (좌측) */}
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

            {/* 사용자 타이핑 인디케이터 (우측) */}
            {input.trim() !== '' && (
              <div className={styles.chatMessage} style={{ textAlign: 'right' }}>
                <span className={styles.userBubble}>
                  <span className={styles.typingIndicator}>
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* ── 입력창 + 버튼 영역(Input Area) ── */}
          <div className={styles.inputArea} style={{ flexShrink: 0 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="질문을 입력하세요..."
              className={styles.inputField}
            />

            <button
              className={`${styles.infoButton} ${!pdfUrl ? styles.infoButtonDisabled : ''}`}
              onClick={() => {
                setShowRetrieval(prev => !prev);
              }}
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
            className={styles.retrievalPanel}
            style={{ display: 'flex', flexDirection: 'column', width: '40%' }}
          >
            {/* Retrieval Header */}
            <div className={styles.retrievalHeader}>
              <h3 className={styles.retrievalHeaderTitle}>Retrieval 정보</h3>
              <button
                className={styles.retrievalCloseButton}
                onClick={() => setShowRetrieval(false)}
                title="닫기"
              >
                ×
              </button>
            </div>

            {/* Retrieval Content: “벡터 PDF 페이지” 렌더 + 스크롤 */}
            <div
              className={styles.retrievalContent}
              style={{ flex: 1, overflowY: 'auto' }}
            >
              {lastMetadata.pages.length === 0 ? (
                <p style={{ color: '#e0e0e0', padding: '8px' }}>
                  Retrieval 데이터가 없습니다.
                </p>
              ) : (
                lastMetadata.pages.map((pg, idx) => {
                  const pageNum = pg + 1; // 0-based → 1-based
                  return (
                    <div
                      key={idx}
                      className={styles.retrievalItem}
                      style={{ marginBottom: '12px' }}
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
                      <div className={styles.thumbnailContainer} style={{ textAlign: 'center' }}>
                        {/* React-PDF를 이용해 벡터로 렌더링 */}
                        <Document file={pdfUrl} renderMode="canvas">
                          <Page
                            pageNumber={pageNum}
                            width={300}
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
