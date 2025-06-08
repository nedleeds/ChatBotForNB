// src/pages/Chatbot/ChatbotPage.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import DialogPage from './DialogPage';
import DropdownWithAdd from '../../components/DropdownWithAdd';
import styles from './chatbot.module.css';

export default function ChatbotPage() {
  const navigate = useNavigate();
  const STORAGE_KEY = 'loginData';

  const [tree, setTree] = useState([]);             // 전체 트리 (data)
  const [companies, setCompanies] = useState([]);
  const [teams, setTeams] = useState([]);
  const [parts, setParts] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedPart, setSelectedPart] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');

  const [chatbots, setChatbots] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingTrain, setLoadingTrain] = useState(false);
  const [activeChatbot, setActiveChatbot] = useState(null);

  // 1) 로컬스토리지에 저장할 공통 함수
  const persistLoginData = () => {
    const payload = {
      company: selectedCompany,
      team: selectedTeam,
      part: selectedPart,
      employeeID: selectedEmployee,
      data: tree,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  };

  const getCompanies = useMemo(
    () => tree?.map(c => c.name) || [],
    [tree]
  );
  const getTeams = useMemo(
    () =>
      tree
        .find(c => c.name === selectedCompany)
        ?.teams?.map(t => t.name) || [],
    [tree, selectedCompany]
  );
  const getParts = useMemo(
    () =>
      tree
        .find(c => c.name === selectedCompany)
        ?.teams?.find(t => t.name === selectedTeam)
        ?.parts?.map(p => p.name) || [],
    [tree, selectedCompany, selectedTeam]
  );
  const getEmployees = useMemo(
    () =>
      tree
        .find(c => c.name === selectedCompany)
        ?.teams?.find(t => t.name === selectedTeam)
        ?.parts?.find(p => p.name === selectedPart)
        ?.employees || [],
    [tree, selectedCompany, selectedTeam, selectedPart]
  );


  // ── 1) 마운트 시 로컬스토리지에서 tree(=data)와 선택값 복원 ──
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const { company, team, part, employeeID, data } = JSON.parse(raw);
    setTree(data);

    // selected data 값
    if (company) setSelectedCompany(company);
    if (team) setSelectedTeam(team);
    if (part) setSelectedPart(part);
    if (employeeID) setSelectedEmployee(employeeID);
  }, []);

  // ── 드롭박스에서 특정값을 선택했을 때 ──
  const onSelectCompany = name => {
    setSelectedCompany(name);
    setSelectedTeam('');
    setSelectedPart('');
    setSelectedEmployee('');
    persistLoginData();
  };
  const onSelectTeam = name => {
    setSelectedTeam(name);
    setSelectedPart('');
    setSelectedEmployee('');
    persistLoginData();
  };
  const onSelectPart = name => {
    setSelectedPart(name);
    setSelectedEmployee('');
    persistLoginData();
  };
const onSelectEmployee = name => {
  // 1) state 업데이트
  setSelectedEmployee(name);

  // 2) 로컬스토리지에 바로 저장 (직접 payload 생성)
  const payload = {
    company: selectedCompany,
    team: selectedTeam,
    part: selectedPart,
    employeeID: name,       // ← name을 직접 사용
    data: tree,             // ← tree도 함께 저장
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};
  // ── 챗봇 목록 조회 ──
  const fetchChatbotList = async (company, team, part) => {
    setLoadingList(true);
    try {
      const res = await axios.get('http://localhost:8088/chatbots', {
        params: { company, team, part },
      });
      setChatbots(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('챗봇 목록 조회 오류:', err);
      setChatbots([]);
    } finally {
      setLoadingList(false);
    }
  };

  // ── 챗봇 삭제 ──
  const handleDelete = async (botName) => {
    if (!window.confirm(`"${botName}" 챗봇을 정말 삭제하시겠습니까?`)) return;
    setLoadingTrain(true);
    try {
      await axios.delete('http://localhost:8088/chatbots', {
        params: {
          company: selectedCompany,
          team: selectedTeam,
          part: selectedPart,
          chatbot_name: botName,
        },
      });
      await fetchChatbotList(selectedCompany, selectedTeam, selectedPart);
    } catch (err) {
      console.error('삭제 오류:', err);
      alert('❌ 챗봇 삭제 실패:\n' + (err.message || 'Unknown'));
    } finally {
      setLoadingTrain(false);
    }
  };

  // ── 챗봇 불러오기 ──
  const META_KEY_PREFIX = 'chatbotMeta_';
  const handleLoad = async (c) => {
    const result = await window.electronAPI.loadChatbot({
      company: selectedCompany,
      team: selectedTeam,
      part: selectedPart,
      chatbotName: c.name,
    });
    if (result.success) {
      setActiveChatbot(c.name);
      // 메타 저장
      const key = `${META_KEY_PREFIX}${selectedCompany}_${selectedTeam}_${selectedPart}_${c.name}`;
      const meta = {
        company: selectedCompany,
        team: selectedTeam,
        part: selectedPart,
        chatbotName: c.name,
        pdfUrl: c.pdf_url || '',
        createdAt: c.createdAt,
        lastTrainedAt: c.lastTrainedAt,
      };
      localStorage.setItem(key, JSON.stringify(meta));
    } else {
      alert('챗봇 불러오기 실패: ' + result.error);
    }
  };

  // ── 새 챗봇 업로드 모달 & 파일 입력 ──
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const fileInputRef = useRef(null);

  const onClickUpload = () => {
    setUploadName('');
    setShowUploadModal(true);
  };
  const handleUploadConfirm = () => {
    if (!uploadName.trim()) return alert('챗봇 이름을 입력해주세요.');
    setShowUploadModal(false);
    if (!selectedCompany || !selectedTeam || !selectedPart) {
      return alert('회사/팀/파트 먼저 선택해주세요.');
    }
    fileInputRef.current?.click();
  };
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoadingTrain(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('company', selectedCompany);
    fd.append('team', selectedTeam);
    fd.append('part', selectedPart);
    fd.append('chatbot_name', uploadName.trim());
    try {
      await axios.post('http://localhost:8088/upload_pdf', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert('✅ 챗봇 업로드 완료');
      await fetchChatbotList(selectedCompany, selectedTeam, selectedPart);
    } catch (err) {
      console.error('업로드 오류:', err);
      alert('❌ 업로드 실패');
    } finally {
      setLoadingTrain(false);
      e.target.value = null;
    }
  };

  const handleUploadCancel = () => setShowUploadModal(false);

  // ── 3) 마운트 후, 선택된 값이 있으면 자동 목록 조회 ──
  useEffect(() => {
    if (selectedCompany && selectedTeam && selectedPart) {
      fetchChatbotList(selectedCompany, selectedTeam, selectedPart);
    }
  }, [selectedCompany, selectedTeam, selectedPart]);

  return (
    <div className={styles.container}>
      {/* ── 업로드/벡터 생성 스피너 ── */}
      {loadingTrain && (
        <div className={styles.spinnerOverlay}>
          <div className={styles.spinner} />
          <div className={styles.loadingOverlayText}>
            챗봇 업로드/벡터 생성 중...
          </div>
        </div>
      )}

      {/* ── 헤더 ── */}
      <header className={styles.header}>
        <div className={styles.dropdownGroup}>
          <DropdownWithAdd items={getCompanies} selected={selectedCompany} onSelect={onSelectCompany} disabled={false} />
          <DropdownWithAdd items={getTeams} selected={selectedTeam} onSelect={onSelectTeam} disabled={false} />
          <DropdownWithAdd items={getParts} selected={selectedPart} onSelect={onSelectPart} disabled={false} />
          <DropdownWithAdd items={getEmployees} selected={selectedEmployee} onSelect={onSelectEmployee} disabled={false} />
        </div>
        <button className={styles.logoutBtn} onClick={() => { navigate('/login'); }}>로그아웃</button>
      </header>
      {/* ── 본문 ── */}
      <main className={styles.chatbotBody}>
        {activeChatbot ? (
          // DialogPage 렌더링
          (() => {
            const matched = chatbots.find(c => c.name === activeChatbot) || {};
            return (
              <DialogPage
                company={selectedCompany}
                team={selectedTeam}
                part={selectedPart}
                chatbotName={activeChatbot}
                createdAt={matched.createdAt}
                pdfUrl={`http://localhost:8088${matched.pdf_url}`}
                lastTrainedAt={matched.lastTrainedAt}
                onClose={() => setActiveChatbot(null)}
              />
            );
          })()
        ) : (
          <section className={styles.chatbotContent}>
            {/* 챗봇 카드 리스트 */}
            {!loadingTrain && !loadingList && chatbots.length > 0 && (
              <>
                <h3 className={styles.subheading}>저장된 챗봇 목록</h3>
                <div className={styles.chatbotListContainer}>
                  {chatbots.map(c => (
                    <div key={c.name} className={styles.chatbotCard}>
                      <button
                        className={styles.deleteButton}
                        onClick={() => handleDelete(c.name)}
                        title="삭제"
                      >
                        🗑️
                      </button>
                      <div className={styles.cardHeader}>
                        <span className={styles.chatbotName}>{c.name}</span>
                      </div>
                      <div className={styles.cardMeta}>
                        <strong>마지막 학습:</strong>{' '}
                        {new Date(c.lastTrainedAt).toLocaleString()}
                      </div>
                      <div className={styles.cardActions}>
                        <button
                          className={styles.loadButton}
                          onClick={() => handleLoad(c)}
                        >
                          불러오기
                        </button>
                        <button
                          className={styles.retrainButton}
                          onClick={() =>
                            navigate('/self-test', {
                              state: {
                                company: selectedCompany,
                                team: selectedTeam,
                                part: selectedPart,
                                chatbotName: c.name,
                                evaluatorID: selectedEmployee,
                              }
                            })
                          }
                        >
                          자가평가
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  className={styles.uploadBtn}
                  onClick={onClickUpload}
                  disabled={loadingTrain}
                >
                  새로운 챗봇 학습(업로드)
                </button>
              </>
            )}

            {/* 챗봇이 없을 때 */}
            {!loadingTrain && !loadingList && chatbots.length === 0 && (
              <div className={styles.noChatbotContainer}>
                <p className={styles.noChatbotMessage}>
                  학습된 챗봇이 없습니다.
                  <br />
                  PDF 파일을 업로드하여 학습을 진행해주세요.
                </p>
                <button
                  className={styles.uploadBtn}
                  onClick={onClickUpload}
                  disabled={loadingTrain}
                >
                  PDF 파일 선택
                </button>
              </div>
            )}

            {/* 로딩 중 */}
            {!loadingTrain && loadingList && (
              <div className={styles.loadingText}>
                챗봇 목록을 불러오는 중...
              </div>
            )}
          </section>
        )}
      </main>

      {/* 업로드 모달 */}
      {showUploadModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3>새 챗봇 이름 입력</h3>
            <input
              type="text"
              value={uploadName}
              onChange={e => setUploadName(e.target.value)}
              placeholder="예: 나의 첫 챗봇"
            />
            <div className={styles.modalButtons}>
              <button onClick={handleUploadConfirm} disabled={!uploadName.trim()}>
                확인
              </button>
              <button onClick={handleUploadCancel}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 숨겨진 파일 입력 */}
      <input
        type="file"
        accept=".pdf"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}
