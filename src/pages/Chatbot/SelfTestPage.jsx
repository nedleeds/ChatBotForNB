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
  const [selections, setSelections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);

  const fetchQnA = async (append = false, force = false) => {
    setLoading(true);
    setError(null);
    const endpoint = append ? '/api/qna/append' : '/api/qna';
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8088';
      const res = await axios.post(
        `${API_BASE}${endpoint}`,
               null,
       {
         params: {
           company, team, part, chatbot_name: chatbotName,
           ...(force ? { force: true } : {})
         }
       }
      );
      const { questions: qs } = res.data;
      if (!qs || qs.length === 0) {
        setMessage('일렉트론 쪽에서 질문을 만듭니다...');
      } else {
        setQuestions(prev => append ? [...prev, ...qs] : qs);
        setMessage('');
        setCurrentIndex(0);
        setSelectedChoice(null);
        setScore(0);
        setIsFinished(false);
        setSelections([]);
      }
    } catch (e) {
      console.error('fetchQnA error:', e.response ? e.response.data : e.message);
      setError('질문 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQnA(false);
  }, []);

  const handleNext = () => {
    setSelections(prev => [...prev, selectedChoice]);
    if (selectedChoice === questions[currentIndex].answerIndex) {
      setScore(prev => prev + 1);
    }
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedChoice(null);
    } else {
      setIsFinished(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setSelectedChoice(null);
    }
  };

  const handleRemoveWrong = async (itemId) => {
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8088';
      const res = await axios.delete(
        `${API_BASE}/api/qna/question`,
        { params: { company, team, part, chatbot_name: chatbotName, question_id: itemId } }
      );
      setQuestions(res.data.questions);
    } catch (e) {
      console.error('deleteQnA error:', e.response ? e.response.data : e.message);
    }
  };

  const handleAppend = () => fetchQnA(true);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>{message || '로딩 중...'}</p>
      </div>
    );
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  // 질문 없음 상태
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
            <p>질문지가 없습니다. 새로 생성해 주세요.</p>
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
      .map((item, idx) => ({ ...item, chosen: selections[idx] }))
      .filter(item => item.chosen !== item.answerIndex);
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <button className={styles.back} onClick={() => navigate('/chatbot')}>뒤로</button>
          <h2 className={styles.headerCenter}>{chatbotName} 자가 평가 결과</h2>
          <div className={styles.headerRight}>평가자: {evaluatorID}</div>
        </header>
        <div className={styles.content}>
          <div className={styles.buttonGroupTop}>
            <button onClick={handleAppend} className={styles.appendButton}>추가 QnA 만들기</button>
            <button className={styles.btn} onClick={() => navigate('/chatbot')}>챗봇 목록으로</button>
          </div>
          {wrongs.length > 0 && (
            <div className={styles.reviewSection}>
              <h3>틀린 문항</h3>
              {wrongs.map((item, i) => (
                <div key={`${item.id}-${i}`} className={styles.reviewQuestionCard}>
                  <p className={styles.question}>Q{i + 1}. {item.question}</p>
                  <div className={styles.responseItem}>
                    <p><span className={styles.labelWrong}>내 답:</span> {item.choices[item.chosen]}</p>
                    <p><span className={styles.labelCorrect}>정답:</span> {item.choices[item.answerIndex]}</p>
                  </div>
                  <button onClick={() => handleRemoveWrong(item.id)} className={styles.removeBtn}>삭제</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 진행 화면
  const q = questions[currentIndex];
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
          <p className={styles.question}>Q{currentIndex + 1}. {q.question}</p>
          <div className={styles.choices}>
            {q.choices.map((c, idx) => (
              <label key={idx} className={styles.choice}>
                <input type="radio" name="choice" checked={selectedChoice === idx} onChange={() => setSelectedChoice(idx)} />
                <span>{c}</span>
              </label>
            ))}
          </div>
          <div className={styles.btnGroup}>
            <button onClick={handlePrev} disabled={currentIndex === 0} className={styles.btn}>이전</button>
            <button onClick={handleNext} disabled={selectedChoice === null} className={styles.btn}>{currentIndex < questions.length - 1 ? '다음' : '제출'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
