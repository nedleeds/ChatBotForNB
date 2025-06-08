// src/pages/SelfTest/SelfTestPage.jsx

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './selfTest.module.css';

export default function SelfTestPage() {
  const { state } = useLocation();
  const {
    company = '',
    team = '',
    part = '',
    chatbotName = '알 수 없는 챗봇',
    evaluatorID = '알 수 없는 사번',
  } = state || {};

  const navigate = useNavigate();

  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [selections, setSelections] = useState([]);  // 질문별 선택 저장
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);

  // 질문 불러오기
  const fetchQnA = async (append = false, force = false) => {
    setLoading(true);
    setError(null);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8088';
      const { data } = await axios.post(
        `${API_BASE}/${append ? 'api/qna/append' : 'api/qna'}`,
        null,
        { params: { company, team, part, chatbot_name: chatbotName, ...(force && { force: true }) } }
      );
      const qs = data.questions || [];
      if (append) {
        // 이미 있는 question.id 는 제외하고 새 ID만 추가
        setQuestions(prev => {
          const existingIds = new Set(prev.map(q => q.id));
          const newOnes = qs.filter(q => !existingIds.has(q.id));
          return [...prev, ...newOnes];
        });
      } else {
        // 새로 시작
        setQuestions(qs);
        setSelections([]);
        setScore(0);
        setCurrentIndex(0);
        setIsFinished(false);
        setSelectedChoice(null);
      }
      setMessage(qs.length === 0 ? '생성된 질문이 없습니다.' : '');
    } catch (e) {
      console.error(e);
      setError('질문 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQnA(false); }, []);

  // 페이지 이동 시 이전 선택 복원
  useEffect(() => {
    setSelectedChoice(selections[currentIndex] ?? null);
  }, [currentIndex, selections]);

  // “다음” 버튼
  const handleNext = () => {
    // 선택 저장
    setSelections(prev => {
      const copy = [...prev];
      copy[currentIndex] = selectedChoice;
      return copy;
    });
    // 정답 체크
    if (selectedChoice === questions[currentIndex].answerIndex) {
      setScore(s => s + 1);
    }
    // 이동
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      setIsFinished(true);
    }
  };

  // “이전” 버튼
  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
    }
  };

  // 틀린 문항 삭제
  const handleRemoveWrong = async (id) => {
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8088';
      const { data } = await axios.delete(`${API_BASE}/api/qna/question`, {
        params: { company, team, part, chatbot_name: chatbotName, question_id: id }
      });
      const newQs = data.questions || [];
      setQuestions(newQs);
      // 삭제된 인덱스 동기화
      const removedIdx = questions.findIndex(q => q.id === id);
      if (removedIdx !== -1) {
        setSelections(prev => {
          const copy = [...prev];
          copy.splice(removedIdx, 1);
          return copy;
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 추가 QnA: 질문 뒤에 붙이고, 첫 문제부터 다시 시작
  const handleAppend = async () => {
    // 1) 결과 모드 해제
    setIsFinished(false);
    // 2) 점수·선택·인덱스 초기화
    setScore(0);
    setSelections([]);
    setCurrentIndex(0);
    setSelectedChoice(null);
    // 3) API에서 뒤에 QnA 붙이기
    await fetchQnA(true);
  };

  // // 추가 QnA: 기존 질문 뒤에 새로 생성된 질문 붙이기
  // const handleAppend = () => {
  //   // 완료 화면에서 다시 문제 풀이 화면으로 전환
  //   setIsFinished(false);
  //   // append 모드로만 호출 (force 옵션 불필요)
  //   fetchQnA(true);
  // };


  // 추가 QnA

  // 로딩 오버레이
  if (loading) {
    return (
      <div className={styles.loadingOverlay}>
        <div className={styles.loadingCard}>
          <div className={styles.spinner} />
          <div className={styles.loadingText}>{message || '로딩 중...'}</div>
        </div>
      </div>
    );
  }
  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  // 질문 없을 때
  if (questions.length === 0) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <button className={styles.back} onClick={() => navigate('/chatbot')}>뒤로</button>
          <h2 className={styles.headerCenter}>{chatbotName} 자가 평가</h2>
          <div className={styles.headerRight}>평가자: {evaluatorID}</div>
        </header>
        <div className={styles.content}>
          <div className={styles.loadingContainer}>
            <p>{message}</p>
            <button className={styles.appendButton} onClick={() => fetchQnA(false, true)}>
              QnA 생성하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 완료 화면
  if (isFinished) {
    const wrongs = questions
      .map((q, i) => ({ ...q, chosen: selections[i], origIndex: i }))
      .filter(q => q.chosen !== q.answerIndex);

    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <button className={styles.back} onClick={() => navigate('/chatbot')}>뒤로</button>
          <h2 className={styles.headerCenter}>{chatbotName} 결과</h2>
          <div className={styles.headerRight}>평가자: {evaluatorID}</div>
        </header>
        <div className={styles.content}>
          <div className={styles.buttonGroupTop}>
            <button onClick={handleAppend} className={styles.appendButton}>추가 QnA 만들기</button>
            <button className={styles.btn} onClick={() => navigate('/chatbot')}>챗봇 목록으로</button>
          </div>

          {wrongs.length > 0 && (
            <div className={styles.reviewSection}>
              <h3>틀린 문항 ({wrongs.length}개)</h3>
              {wrongs.map(item => (
                <div key={`${item.origIndex}-${item.id}`} className={styles.reviewQuestionCard}>
                  <div className={styles.cardHeader}>
                    <p className={styles.question}>
                      Q{item.origIndex + 1}. {item.question}
                    </p>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveWrong(item.id); }}
                      className={styles.removeBtn}
                    >
                      삭제
                    </button>
                  </div>
                  <div className={styles.responseItem}>
                    <p className={styles.responseRow}>
                      <span className={styles.labelWrong}>오답:</span>
                      <span className={styles.value}>{item.choices[item.chosen]}</span>
                    </p>
                    <p className={styles.responseRow}>
                      <span className={styles.labelCorrect}>정답:</span>
                      <span className={styles.value}>{item.choices[item.answerIndex]}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 진행 화면
  const curr = questions[currentIndex];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/chatbot')}>뒤로</button>
        <h2 className={styles.headerCenter}>{chatbotName} 자가 평가</h2>
        <div className={styles.headerRight}>평가자: {evaluatorID}</div>
      </header>
      <div className={styles.content}>
        <div className={styles.progress}>{currentIndex + 1} / {questions.length}</div>
        <div className={styles.questionCard}>
          <p className={styles.question}>Q{currentIndex + 1}. {curr.question}</p>
          <div className={styles.choices}>
            {curr.choices.map((c, i) => (
              <label key={i} className={styles.choice}>
                <input
                  type="radio"
                  name="choice"
                  checked={selectedChoice === i}
                  onChange={() => {
                    setSelectedChoice(i);
                    setSelections(prev => {
                      const copy = [...prev];
                      copy[currentIndex] = i;
                      return copy;
                    });
                  }}
                />
                <span>{c}</span>
              </label>
            ))}
          </div>
          <div className={styles.btnGroup}>
            <button onClick={handlePrev} disabled={currentIndex === 0} className={styles.btn}>이전</button>
            <button onClick={handleNext} disabled={selectedChoice == null} className={styles.btn}>
              {currentIndex < questions.length - 1 ? '다음' : '제출'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
