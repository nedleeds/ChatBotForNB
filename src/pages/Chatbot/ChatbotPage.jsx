// src/pages/Chatbot/ChatbotPage.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import DialogPage from './DialogPage'; // DialogPage import
import styles from './chatbot.module.css';

export default function ChatbotPage() {
  const navigate = useNavigate();

  // ── 0) 로그인 정보 ──
  const [loginData, setLoginData] = useState({
    company: '',
    team: '',
    part: '',
    data: {},
    employeeID: '',
    employeeList: [],
  });

  // ── 드롭다운용 회사/팀/파트 리스트 ──
  const [companies, setCompanies] = useState([]);
  const [teams, setTeams] = useState([]);
  const [parts, setParts] = useState([]);

  // ── 사용자가 선택한 회사/팀/파트/사번 ──
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedPart, setSelectedPart] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');

  // ── 로컬스토리지 키 ──
  const STORAGE_KEY = 'loginSelections';

  // ── 학습된 챗봇 목록 ──
  const [chatbots, setChatbots] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  // ── 업로드/벡터 생성 중 로딩 스피너 ──
  const [loadingTrain, setLoadingTrain] = useState(false);

  // ── 로그 (필요 시) ──
  const [logs, setLogs] = useState([]);
  const handleLog = useCallback((event, log) => {
    if (log && typeof log === 'object' && 'message' in log) {
      setLogs((prev) => [...prev, log]);
    }
  }, []);

  // ── 새 챗봇 생성 모달 ──
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadName, setUploadName] = useState('');

  // ── 숨겨진 파일 입력 ref ──
  const fileInputRef = useRef(null);

  // ── 1) 로컬스토리지에서 로그인 데이터 복원 ──
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { company, team, part, employeeID } = JSON.parse(saved);
        if (company) {
          setSelectedCompany(company);
          setCompanies([company]);
        }
        if (team) {
          setSelectedTeam(team);
          setTeams([team]);
        }
        if (part) {
          setSelectedPart(part);
          setParts([part]);
        }
        if (employeeID) {
          setSelectedEmployee(employeeID);
        }
      } catch {
        /* JSON parse 오류 무시 */
      }
    }
  }, []);

  // ── 2) 마운트 시 login.json 불러오기(IPC) 및 로그 리스너 등록 ──
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.loadLogin) {
      window.electronAPI.loadLogin().then((data) => {
        setLoginData(data);
        const allDataMap = data.data || {};
        setCompanies(Object.keys(allDataMap));

        if (data.company) setSelectedCompany(data.company);
        if (data.team) setSelectedTeam(data.team);
        if (data.part) setSelectedPart(data.part);
        if (data.employeeID) setSelectedEmployee(data.employeeID);

        if (data.company && allDataMap[data.company]) {
          setTeams(Object.keys(allDataMap[data.company]));
        }
        if (
          data.company &&
          data.team &&
          allDataMap[data.company]?.[data.team]
        ) {
          setParts(allDataMap[data.company][data.team]);
        }
      });
    }

    if (
      window.electronAPI &&
      window.electronAPI.removeAllTrainChatbotLogListeners
    ) {
      window.electronAPI.removeAllTrainChatbotLogListeners();
    }
    if (window.electronAPI && window.electronAPI.onTrainChatbotLog) {
      window.electronAPI.onTrainChatbotLog(handleLog);
    }

    return () => {
      if (
        window.electronAPI &&
        window.electronAPI.removeAllTrainChatbotLogListeners
      ) {
        window.electronAPI.removeAllTrainChatbotLogListeners();
      }
    };
  }, [handleLog]);

  // ── 3) 회사/팀/파트 변경 시 “학습된 챗봇 목록” 재조회 ──
  useEffect(() => {
    if (selectedCompany && selectedTeam && selectedPart) {
      fetchChatbotList(selectedCompany, selectedTeam, selectedPart);
    } else {
      setLoadingList(false);
      setChatbots([]);
    }
  }, [selectedCompany, selectedTeam, selectedPart]);

  // ── 4) “학습된 챗봇 목록” 조회 (FastAPI GET /chatbots) ──
  const fetchChatbotList = async (company, team, part) => {
    setLoadingList(true);
    try {
      const res = await axios.get('http://localhost:8088/chatbots', {
        params: { company, team, part },
      });
      setChatbots(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('FastAPI → 챗봇 목록 조회 중 오류:', err);
      setChatbots([]);
    } finally {
      setLoadingList(false);
    }
  };

  // ── 5) 챗봇 삭제 ──
  const handleDelete = async (name) => {
    const confirmed = window.confirm(`"${name}" 챗봇을 정말 삭제하시겠습니까?`);
    if (!confirmed) return;

    setLoadingTrain(true);
    try {
      const res = await axios.delete('http://localhost:8088/chatbots', {
        params: {
          company: selectedCompany,
          team: selectedTeam,
          part: selectedPart,
          chatbot_name: name,
        },
      });
      console.log('삭제 응답:', res.data);
      await fetchChatbotList(selectedCompany, selectedTeam, selectedPart);
    } catch (err) {
      console.error('FastAPI → 챗봇 삭제 중 오류:', err);
      const detail =
        err.response && err.response.data && err.response.data.detail
          ? err.response.data.detail
          : err.message;
      alert(`❌ 챗봇 삭제에 실패했습니다:\n${detail}`);
    } finally {
      setLoadingTrain(false);
    }
  };

  // ── activeChatbot 상태 추가 ──
  const [activeChatbot, setActiveChatbot] = useState(null);

  // ── 6) “불러오기” 클릭 → DialogPage 보여주기 ──
  const handleLoad = async (chatbotName) => {
    try {
      // 회사/팀/파트 정보와 함께 Electron IPC 호출
      const result = await window.electronAPI.loadChatbot({
        company: selectedCompany,
        team: selectedTeam,
        part: selectedPart,
        chatbotName,
      });
      if (result.success) {
        setActiveChatbot(chatbotName);
      } else {
        alert('챗봇 불러오기 실패: ' + result.error);
      }
    } catch (err) {
      console.error('챗봇 불러오기 에러:', err);
      alert('챗봇 불러오기 중 오류가 발생했습니다.');
    }
  };

  // ── 7) “새 챗봇 학습(업로드)” 클릭 ──
  const onClickUpload = () => {
    setUploadName('');
    setShowUploadModal(true);
  };

  // ── 8) 이름 입력 “확인” → 파일 선택 다이얼로그 오픈 ──
  const handleUploadConfirm = () => {
    if (!uploadName.trim()) {
      alert('챗봇 이름을 입력해주세요.');
      return;
    }
    setShowUploadModal(false);

    if (!selectedCompany || !selectedTeam || !selectedPart) {
      alert('회사, 팀, 파트를 먼저 선택해주세요.');
      return;
    }

    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // ── 9) 파일 선택 후 → FastAPI POST /upload_pdf 호출 ──
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoadingTrain(true);
    setLogs([]);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('company', selectedCompany);
    formData.append('team', selectedTeam);
    formData.append('part', selectedPart);
    formData.append('chatbot_name', uploadName.trim());

    try {
      await axios.post('http://localhost:8088/upload_pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      alert('✅ 챗봇 업로드 및 벡터 생성 완료');
      await fetchChatbotList(selectedCompany, selectedTeam, selectedPart);
    } catch (err) {
      console.error('챗봇 업로드 중 오류:', err);
      alert('❌ 챗봇 업로드에 실패했습니다. 콘솔을 확인하세요.');
    } finally {
      setLoadingTrain(false);
      e.target.value = null;
    }
  };

  // ── 10) 이름 모달 “취소” ──
  const handleUploadCancel = () => {
    setShowUploadModal(false);
  };

  // ── 11) 드롭다운(회사/팀/파트/사번) 변경 핸들러 ──
  const onChangeCompany = (e) => {
    const company = e.target.value;
    setSelectedCompany(company);
    setSelectedTeam('');
    setSelectedPart('');
    setTeams([]);
    setParts([]);

    const updated = {
      ...loginData,
      company,
      team: '',
      part: '',
      employeeID: selectedEmployee,
    };
    window.electronAPI.saveLogin(updated);
    setLoginData(updated);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ company, team: '', part: '', employeeID: selectedEmployee })
    );

    if (loginData.data && loginData.data[company]) {
      setTeams(Object.keys(loginData.data[company]));
    }
  };

  const onChangeTeam = (e) => {
    const team = e.target.value;
    setSelectedTeam(team);
    setSelectedPart('');
    setParts([]);

    const updated = {
      ...loginData,
      company: selectedCompany,
      team,
      part: '',
      employeeID: selectedEmployee,
    };
    window.electronAPI.saveLogin(updated);
    setLoginData(updated);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ company: selectedCompany, team, part: '', employeeID: selectedEmployee })
    );

    if (
      loginData.data &&
      loginData.data[selectedCompany] &&
      loginData.data[selectedCompany][team]
    ) {
      setParts(loginData.data[selectedCompany][team]);
    }
  };

  const onChangePart = (e) => {
    const part = e.target.value;
    setSelectedPart(part);

    const updated = {
      ...loginData,
      company: selectedCompany,
      team: selectedTeam,
      part,
      employeeID: selectedEmployee,
    };
    window.electronAPI.saveLogin(updated);
    setLoginData(updated);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ company: selectedCompany, team: selectedTeam, part, employeeID: selectedEmployee })
    );
  };

  // ── 12) 로그아웃 ──
  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    const cleared = {
      ...loginData,
      company: '',
      team: '',
      part: '',
      employeeID: '',
    };
    window.electronAPI.saveLogin(cleared);
    navigate('/login');
  };

  // ── Debug: DialogPage에 넘길 값들을 여기서도 확인 ──
  useEffect(() => {
    if (activeChatbot) {
      console.log('DialogPage에 넘길 값들:', {
        selectedCompany,
        selectedTeam,
        selectedPart,
        activeChatbot,
        // chatbots 배열이 업데이트될 때마다 확인
      });
    }
  }, [activeChatbot, selectedCompany, selectedTeam, selectedPart, chatbots]);

  // ── 렌더링 ──
  return (
    <div className={styles.container}>
      {/* ── 스피너 오버레이 (loadingTrain === true일 때만 표시) ── */}
      {loadingTrain && (
        <div className={styles.spinnerOverlay}>
          <div className={styles.spinner} />
          <div className={styles.loadingOverlayText}>
            챗봇 업로드/벡터 생성 중...
          </div>
        </div>
      )}

      {/* ── 상단 헤더 ── */}
      <header className={styles.header}>
        <div className={styles.fieldsRow}>
          {/* 회사 선택 */}
          <select
            className={styles.darkSelect}
            value={selectedCompany}
            onChange={onChangeCompany}
          >
            <option value="" disabled>
              회사 선택
            </option>
            {companies.map((comp) => (
              <option key={comp} value={comp}>
                {comp}
              </option>
            ))}
          </select>

          {/* 팀 선택 */}
          <select
            className={styles.darkSelect}
            value={selectedTeam}
            onChange={onChangeTeam}
            disabled={!selectedCompany}
          >
            <option value="" disabled>
              팀 선택
            </option>
            {teams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>

          {/* 파트 선택 */}
          <select
            className={styles.darkSelect}
            value={selectedPart}
            onChange={onChangePart}
            disabled={!selectedTeam}
          >
            <option value="" disabled>
              파트 선택
            </option>
            {parts.map((part) => (
              <option key={part} value={part}>
                {part}
              </option>
            ))}
          </select>

          {/* 사번 읽기 전용 박스 */}
          <div className={styles.employeeBox}>
            {selectedEmployee || '사번 없음'}
          </div>

          {/* 로그아웃 버튼 */}
          <button className={styles.logoutBtn} onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </header>

      {/* ── 본문: 챗봇 영역 ── */}
      <main className={styles.chatbotBody}>
        {activeChatbot ? (
          // DialogPage에 필요한 모든 prop을 전달하도록 수정
          (() => {
            // 현재 activeChatbot 이름과 일치하는 메타를 chatbots 배열에서 찾음
            const matched = chatbots.find((c) => c.name === activeChatbot) || {};
            // 디버깅: matched 값 확인
            console.log('DialogPage용 메타:', matched);

            return (
              <DialogPage
                company={selectedCompany}
                team={selectedTeam}
                part={selectedPart}
                chatbotName={activeChatbot}
                createdAt={matched.createdAt}
                lastTrainedAt={matched.lastTrainedAt}
                onClose={() => {
                  setActiveChatbot(null);
                }}
              />
            );
          })()
        ) : (
          <section className={styles.chatbotContent}>
            {/* ── 학습된 챗봇이 있을 때 ── */}
            {!loadingTrain && !loadingList && chatbots.length > 0 && (
              <>
                <h3 className={styles.subheading}>저장된 챗봇 목록</h3>
                <div className={styles.chatbotListContainer}>
                  {chatbots.map((c) => (
                    <div key={c.name} className={styles.chatbotCard}>
                      {/* 삭제 버튼 */}
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
                        <div>
                          <strong>생성:</strong>{' '}
                          {new Date(c.createdAt).toLocaleString()}
                        </div>
                        <div>
                          <strong>마지막 학습:</strong>{' '}
                          {new Date(c.lastTrainedAt).toLocaleString()}
                        </div>
                      </div>
                      <div className={styles.cardActions}>
                        {/* 불러오기 버튼 (DialogPage 표시) */}
                        <button
                          className={styles.loadButton}
                          onClick={() => handleLoad(c.name)}
                        >
                          불러오기
                        </button>

                        {/* 추가학습 버튼 */}
                        <button
                          className={styles.retrainButton}
                          onClick={async () => {
                            try {
                              setLoadingTrain(true);
                              const result = await window.electronAPI.retrainChatbot(
                                c.name
                              );
                              if (result.success) {
                                alert(`"${c.name}" 챗봇이 추가학습 되었습니다.`);
                                fetchChatbotList(
                                  selectedCompany,
                                  selectedTeam,
                                  selectedPart
                                );
                              } else {
                                alert('챗봇 추가학습 실패: ' + result.error);
                              }
                            } catch (err) {
                              console.error('챗봇 추가학습 에러:', err);
                              alert('챗봇 추가학습 중 오류가 발생했습니다.');
                            } finally {
                              setLoadingTrain(false);
                            }
                          }}
                        >
                          추가학습
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 업로드 버튼 */}
                <button
                  className={styles.uploadBtn}
                  onClick={onClickUpload}
                  disabled={loadingTrain}
                >
                  새로운 챗봇 학습(업로드)
                </button>
              </>
            )}

            {/* ── 학습된 챗봇이 하나도 없을 때 ── */}
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

            {/* ── 챗봇 목록 로딩 중 ── */}
            {!loadingTrain && loadingList && (
              <div className={styles.loadingText}>
                챗봇 목록을 불러오는 중...
              </div>
            )}
          </section>
        )}
      </main>

      {/* ── 이름 입력 모달 ── */}
      {showUploadModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3>새 챗봇 이름을 입력해주세요</h3>
            <input
              type="text"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              className={styles.nameInput}
              placeholder="예: 나의 첫 챗봇"
            />
            <div className={styles.modalButtons}>
              <button
                onClick={handleUploadConfirm}
                className={styles.confirmButton}
                disabled={!uploadName.trim()}
              >
                확인
              </button>
              <button
                onClick={handleUploadCancel}
                className={styles.cancelButton}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 숨겨진 파일 입력 (PDF 업로드용) ── */}
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
