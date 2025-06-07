// src/pages/SelfTest/SelfTestPage.jsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './selfTest.module.css';

export default function SelfTestPage() {
  const { state } = useLocation();
  const chatbotName = state?.chatbotName || '알 수 없는 챗봇';
  const evaluatorID = state?.evaluatorID || '알 수 없는 사번';
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [selections, setSelections] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const sampleQuestions = [
      {
        id: 1,
        question: 'PDF.js workerSrc를 설정하는 방법은?',
        choices: [
          'pdfjs.GlobalWorkerOptions.workerSrc = url',
          'Document.workerSrc = url',
          'import pdfWorker from "pdfjs-dist/build/pdf.worker.js"',
          'page.worker = url'
        ],
        answerIndex: 0
      },
      {
        id: 2,
        question: 'React Router v6에서 페이지 이동 훅은?',
        choices: ['useRoute', 'useHistory', 'useNavigate', 'useLink'],
        answerIndex: 2
      }
    ];
    setQuestions(sampleQuestions);
  }, []);

  if (questions.length === 0) {
    return <div className={styles.loading}>로딩 중...</div>;
  }

  const q = questions[currentIndex];

  const handleNext = () => {
    // 선택 저장
    setSelections(prev => [...prev, selectedChoice]);
    // 점수 계산
    if (selectedChoice === q.answerIndex) {
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


  if (isFinished) {
    const wrongs = questions
      .map((item, idx) => ({ ...item, chosen: selections[idx] }))
      .filter(item => item.chosen !== item.answerIndex);
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <button className={styles.back} onClick={() => navigate(-1)}>뒤로</button>
          <h2 className={styles.headerCenter}>{chatbotName} 자가 평가 결과</h2>
          <div className={styles.headerRight}>평가자: {evaluatorID}</div>
        </header>
        <div className={styles.result}>
          <div className={styles.scoreLeft}>
            총점: {Math.round((score / questions.length) * 100)}점
          </div>
          <div className={styles.scoreRight}>
            틀린 문항: {wrongs.length}개
          </div>
        </div>
        {wrongs.length > 0 && (
          <div className={styles.reviewSection}>
            <h3>다시 풀어보기</h3>
            {wrongs.map((item, i) => (
              <div key={item.id} className={styles.reviewQuestionCard}>
                <p className={styles.question}>Q{i + 1}. {item.question}</p>
                <p><span className={styles.labelWrong}>내 답:</span> <span className={styles.wrongAnswer}>{item.choices[item.chosen]}</span></p>
                <p><span className={styles.labelCorrect}>정답:</span> <span className={styles.correctAnswer}>{item.choices[item.answerIndex]}</span></p>
              </div>
            ))}
          </div>
        )}
        <button className={styles.btn} onClick={() => navigate(-1)}>챗봇 목록으로</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate(-1)}>뒤로</button>
        <h2 className={styles.headerCenter}>{chatbotName} 자가 평가</h2>
        <div className={styles.headerRight}>평가자: {evaluatorID}</div>
      </header>

      {/* <div className={styles.progress}> */}
      {/*   {currentIndex + 1} / {questions.length} */}
      {/* </div> */}

      <div className={styles.questionCard}>
        <p className={styles.question}>Q{currentIndex + 1}. {q.question}</p>
        <div className={styles.choices}>
          {q.choices.map((c, idx) => (
            <label key={idx} className={styles.choice}>
              <input
                type="radio"
                name="choice"
                checked={selectedChoice === idx}
                onChange={() => setSelectedChoice(idx)}
              />
              <span>{c}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.btnGroup}>
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className={styles.btn}
        >
          이전
        </button>
        <button
          onClick={handleNext}
          disabled={selectedChoice === null}
          className={styles.btn}
        >
          {currentIndex < questions.length - 1 ? '다음' : '제출'}
        </button>
      </div>
    </div>
  );
}
