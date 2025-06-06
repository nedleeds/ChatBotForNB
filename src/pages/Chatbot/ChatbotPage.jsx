// src/pages/Chatbot/ChatbotPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './chatbot.module.css';

export default function ChatbotPage() {
  const navigate = useNavigate();

  // ── 로그인 정보 (login.json) ──
  const [loginData, setLoginData] = useState({
    company: '',
    team: '',
    part: '',
    data: {}, // { [company]: { [team]: [partList] } }
    employeeID: '',
    employeeList: [],
  });

  // ── 드롭다운에 보여줄 회사/팀/파트 리스트 ──
  const [companies, setCompanies] = useState([]);
  const [teams, setTeams] = useState([]);
  const [parts, setParts] = useState([]);

  // ── 사용자가 선택한 회사/팀/파트/사번 ──
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedPart, setSelectedPart] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');

  // ── 로컬스토리지에 저장할 키 ──
  const STORAGE_KEY = 'loginSelections';

  // ── 챗봇 목록 (chatbots.json에서 회사/팀/파트로 필터링하여 가져옴) ──
  const [chatbots, setChatbots] = useState([]); // [{name, company, team, part, indexPath, createdAt, lastTrainedAt}, …]
  const [loadingList, setLoadingList] = useState(true);

  // ── 학습(인덱스 생성) 중인지 표시 ──
  const [loadingTrain, setLoadingTrain] = useState(false);

  // ── 학습 로그 ──
  const [logs, setLogs] = useState([]); // { type: 'stdout'|'stderr'|'info', message: string }[]

  // ── 새로운 챗봇 생성 플로우: 이름 입력용 모달 상태 ──
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadName, setUploadName] = useState('');

  // ── 로그 콜백 (한 번만 등록하기 위해 useCallback) ──
  const handleLog = useCallback((event, log) => {
    if (log && typeof log === 'object' && 'type' in log && 'message' in log) {
      setLogs((prev) => [...prev, log]);
    }
  }, []);

  // ── 0) 로컬스토리지에서 로그인 선택값 복원 (가장 먼저 실행) ──
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { company, team, part, employeeID } = JSON.parse(saved);
        if (company) {
          setSelectedCompany(company);
          setCompanies([company]); // 임시로 localStorage에 남은 값만 보여줌
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
        // parsing error 시 무시
      }
    }
  }, []);

  // ── 컴포넌트 마운트 시 → loadLogin 호출, login.json 데이터 세팅, 학습 로그 리스너 등록 ──
  useEffect(() => {
    // 1) login.json 로드
    if (window.electronAPI && window.electronAPI.loadLogin) {
      window.electronAPI.loadLogin().then((data) => {
        // data = { company, team, part, data: {...}, employeeID, employeeList }
        setLoginData(data);

        // ── data.data에서 실제 회사 목록 뽑아오기 ──
        const allDataMap = data.data || {};
        const companyList = Object.keys(allDataMap);
        setCompanies(companyList);

        // ── loadLogin에서 반환된 선택값으로 상태 덮어쓰기 ──
        if (data.company) {
          setSelectedCompany(data.company);
        }
        if (data.team) {
          setSelectedTeam(data.team);
        }
        if (data.part) {
          setSelectedPart(data.part);
        }
        if (data.employeeID) {
          setSelectedEmployee(data.employeeID);
        }

        // ── company가 유효하면 → team 목록 뽑아오기 ──
        if (data.company && allDataMap[data.company]) {
          const teamList = Object.keys(allDataMap[data.company]);
          setTeams(teamList);
        }

        // ── company + team이 유효하면 → part 목록 뽑아오기 ──
        if (
          data.company &&
          data.team &&
          allDataMap[data.company]?.[data.team]
        ) {
          setParts(allDataMap[data.company][data.team]);
        }
      });
    }

    // 2) 학습 로그 리스너 등록 (중복 방지)
    if (
      window.electronAPI &&
      window.electronAPI.removeAllTrainChatbotLogListeners
    ) {
      window.electronAPI.removeAllTrainChatbotLogListeners();
    }
    if (window.electronAPI && window.electronAPI.onTrainChatbotLog) {
      window.electronAPI.onTrainChatbotLog(handleLog);
    }

    // 언마운트 시 cleanup: 리스너 제거
    return () => {
      if (
        window.electronAPI &&
        window.electronAPI.removeAllTrainChatbotLogListeners
      ) {
        window.electronAPI.removeAllTrainChatbotLogListeners();
      }
    };
  }, [handleLog]);

  // ── “회사/팀/파트”가 바뀔 때마다 → 챗봇 리스트 다시 가져오기 ──
  useEffect(() => {
    if (selectedCompany && selectedTeam && selectedPart) {
      fetchChatbotList(selectedCompany, selectedTeam, selectedPart);
    } else {
      setLoadingList(false);
      setChatbots([]);
    }
  }, [selectedCompany, selectedTeam, selectedPart]);

  // ── 챗봇 목록 조회 함수 ──
  const fetchChatbotList = async (company, team, part) => {
    setLoadingList(true);
    try {
      // main.js의 ipcMain.handle('chatbot:getList', …) 호출
      const list = await window.electronAPI.getChatbotList({ company, team, part });
      setChatbots(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('챗봇 목록 조회 중 오류:', err);
      setChatbots([]);
    } finally {
      setLoadingList(false);
    }
  };

  // ── 삭제 버튼 핸들러: 카드 및 데이터 삭제 ──
  const handleDelete = async (name) => {
    const confirmed = window.confirm(`"${name}" 챗봇을 정말 삭제하시겠습니까?`);
    if (!confirmed) return;

    try {
      if (window.electronAPI && window.electronAPI.deleteChatbot) {
        const result = await window.electronAPI.deleteChatbot(name);
        if (result.success) {
          setChatbots((prev) => prev.filter((c) => c.name !== name));
          if (result.warning) {
            alert('⚠️ ' + result.warning);
          }
        } else {
          alert('❌ 챗봇 삭제 실패: ' + (result.error || '알 수 없는 오류'));
        }
      }
    } catch (err) {
      console.error('챗봇 삭제 중 예외 발생:', err);
      alert('챗봇 삭제 중 예외가 발생했습니다.');
    }
  };

  // ── “새로운 챗봇 학습(업로드)” 버튼 클릭 → 이름 모달 오픈 ──
  const onClickUpload = () => {
    setUploadName('');
    setShowUploadModal(true);
  };

  // ── 이름 모달에서 “확인” 클릭 → PDF 선택 → IPC 호출 ──
  const handleUploadConfirm = async () => {
    if (!uploadName.trim()) {
      alert('챗봇 이름을 입력해주세요.');
      return;
    }
    setShowUploadModal(false);

    // PDF 파일 선택 다이얼로그
    const pdfPaths = await window.electronAPI.openFileDialog();
    if (!pdfPaths || pdfPaths.length === 0) {
      return;
    }

    setLoadingTrain(true);
    setLogs([]);
    try {
      // main.js의 ipcMain.handle('chatbot:trainAndCreate', …) 호출
      await window.electronAPI.trainAndCreate({
        company: selectedCompany,
        team: selectedTeam,
        part: selectedPart,
        name: uploadName.trim(),
        pdfPaths,
      });

      await fetchChatbotList(selectedCompany, selectedTeam, selectedPart);
      alert('✅ 챗봇이 생성되었습니다.');
    } catch (err) {
      console.error('챗봇 생성 중 오류:', err);
      alert('❌ 챗봇 생성에 실패했습니다. 콘솔을 확인하세요.');
    } finally {
      setLoadingTrain(false);
    }
  };

  // ── 이름 모달에서 “취소” 클릭 ──
  const handleUploadCancel = () => {
    setShowUploadModal(false);
  };

  // ── 드롭다운 변경 핸들러(회사/팀/파트) ──
  const onChangeCompany = (e) => {
    const company = e.target.value;
    setSelectedCompany(company);
    setSelectedTeam('');
    setSelectedPart('');
    setTeams([]);
    setParts([]);

    // localStorage에도 반영
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

    // 회사가 바뀌면, 실제 loginData.data에서 팀 목록을 다시 세팅
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

  // ── 로그아웃 핸들러 ──
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

  return (
    <div className={styles.container}>
      {/* ── 상단 헤더 ── */}
      <header className={styles.header}>
        <div className={styles.fieldsRow}>
          {/* 회사 선택 드롭다운 */}
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

          {/* 팀 선택 드롭다운 */}
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

          {/* 파트 선택 드롭다운 */}
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
        <section className={styles.chatbotContent}>
          {/* ── 로딩 중 ▷ 학습 or 목록 불러오기 ▷ 표시 ── */}
          {loadingTrain && (
            <div className={styles.loadingText}>챗봇 생성/학습 중...</div>
          )}
          {!loadingTrain && loadingList && (
            <div className={styles.loadingText}>챗봇 목록을 불러오는 중...</div>
          )}

          {/* ── 챗봇 카드 리스트 (챗봇이 있을 때) ── */}
          {!loadingTrain && !loadingList && chatbots.length > 0 && (
            <>
              <h3 className={styles.subheading}>저장된 챗봇 목록</h3>
              <div className={styles.chatbotListContainer}>
                {chatbots.map((c) => (
                  <div key={c.name} className={styles.chatbotCard}>
                    {/* ── 휴지통 아이콘(삭제 버튼) ── */}
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
                      {c.lastTrainedAt && (
                        <div>
                          <strong>마지막 학습:</strong>{' '}
                          {new Date(c.lastTrainedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className={styles.cardActions}>
                      <button
                        className={styles.loadButton}
                        onClick={async () => {
                          try {
                            const result = await window.electronAPI.loadChatbot(c.name);
                            if (result.success) {
                              alert(`"${c.name}" 챗봇이 불러와졌습니다.`);
                            } else {
                              alert('챗봇 불러오기 실패: ' + result.error);
                            }
                          } catch (err) {
                            console.error('챗봇 불러오기 에러:', err);
                            alert('챗봇 불러오기 중 오류가 발생했습니다.');
                          }
                        }}
                      >
                        불러오기
                      </button>
                      <button
                        className={styles.retrainButton}
                        onClick={async () => {
                          try {
                            setLoadingTrain(true);
                            const result = await window.electronAPI.retrainChatbot(c.name);
                            if (result.success) {
                              alert(`"${c.name}" 챗봇이 재학습되었습니다.`);
                              fetchChatbotList(
                                selectedCompany,
                                selectedTeam,
                                selectedPart
                              );
                            } else {
                              alert('챗봇 재학습 실패: ' + result.error);
                            }
                          } catch (err) {
                            console.error('챗봇 재학습 에러:', err);
                            alert('챗봇 재학습 중 오류가 발생했습니다.');
                          } finally {
                            setLoadingTrain(false);
                          }
                        }}
                      >
                        재학습
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── 업로드 버튼 ── */}
              <button
                className={styles.uploadBtn}
                onClick={onClickUpload}
                disabled={loadingTrain}
              >
                새로운 챗봇 학습(업로드)
              </button>
            </>
          )}

          {/* ── 챗봇 전체가 없을 때 ── */}
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

          {/* ── 학습 로그 출력 (학습 중에만) ── */}
          {loadingTrain && logs.length > 0 && (
            <div className={styles.logContainer}>
              <h3 className={styles.logTitle}>학습 로그</h3>
              <div className={styles.logOutput}>
                {logs.map((log, idx) =>
                  log ? (
                    <pre
                      key={idx}
                      className={
                        log.type === 'stderr'
                          ? styles.logError
                          : log.type === 'stdout'
                            ? styles.logStdout
                            : styles.logInfo
                      }
                    >
                      {log.message}
                    </pre>
                  ) : null
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ── 새로운 챗봇 생성 전 이름 입력 모달 ── */}
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
              <button onClick={handleUploadCancel} className={styles.cancelButton}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
