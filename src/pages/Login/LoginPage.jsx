// src/pages/Login/LoginPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DropdownWithAdd from '../../components/DropdownWithAdd';
import styles from './login.module.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const STORAGE_KEY = 'loginData';

  // ── 1) FastAPI로부터 받아올 전체 트리 구조 ──
  const [tree, setTree] = useState([]); // CompanyOption[]

  // ── 2) 선택값 ──
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedPart, setSelectedPart] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');

  // ── 3) 마운트 시 로그인 옵션(fetchLoginOptions) 가져오기 ──
  useEffect(() => {
    async function fetchOptions() {
      try {
        const { companies } = await window.electronAPI.fetchLoginOptions({});
        setTree(companies);
      } catch (err) {
        console.error('로그인 옵션 로드 실패:', err);
      }
    }
    fetchOptions();
  }, []);

  // ── 4) tree로부터 각 레벨별 옵션 계산(useMemo) ──
  const companyOptions = useMemo(
    () => tree.map(c => c.name),
    [tree]
  );

  const teamOptions = useMemo(() => {
    const comp = tree.find(c => c.name === selectedCompany);
    return comp ? comp.teams.map(t => t.name) : [];
  }, [tree, selectedCompany]);

  const partOptions = useMemo(() => {
    const comp = tree.find(c => c.name === selectedCompany);
    const team = comp?.teams.find(t => t.name === selectedTeam);
    return team ? team.parts.map(p => p.name) : [];
  }, [tree, selectedCompany, selectedTeam]);
  const employeeOptions = useMemo(() => {
    const comp = tree.find(c => c.name === selectedCompany);
    const team = comp?.teams.find(t => t.name === selectedTeam);
    const part = team?.parts.find(p => p.name === selectedPart);
    return part ? part.employees : [];
  }, [tree, selectedCompany, selectedTeam, selectedPart]);

  // ── 5) 셀렉터 변경 핸들러 ──
  const onSelectCompany = name => {
    setSelectedCompany(name);
    setSelectedTeam('');
    setSelectedPart('');
    setSelectedEmployee('');
  };
  const onSelectTeam = name => {
    setSelectedTeam(name);
    setSelectedPart('');
    setSelectedEmployee('');
  };
  const onSelectPart = name => {
    setSelectedPart(name);
    setSelectedEmployee('');
  };
  const onSelectEmployee = id => setSelectedEmployee(id);

  // ── 6) 로그인 버튼 클릭 시 처리 ──
  const handleLogin = async () => {
    if (!selectedCompany || !selectedTeam || !selectedPart || !selectedEmployee) {
      alert('모든 정보를 선택/입력해주세요.');
      return;
    }

    // 로그인 정보 + 전체 트리 + 현재 사번 리스트를 함께 저장
    const loginInfo = {
      company: selectedCompany,
      team: selectedTeam,
      part: selectedPart,
      employeeID: selectedEmployee,
      data: tree,
    };

    try {
      // 백엔드에도 저장
      await window.electronAPI.loginSubmit({
        company: selectedCompany,
        team: selectedTeam,
        part: selectedPart,
        employeeID: selectedEmployee
      });

      // 로컬스토리지에 통째로 저장
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loginInfo));

      navigate('/chatbot');
    } catch (err) {
      console.error('로그인 저장 실패:', err);
      alert('로그인 저장에 실패했습니다.');
    }
  };

  const handleAddItem = async (level, newValue) => {
    try {
      switch (level) {
        case 'company':
          await window.electronAPI.addCompany({ company: newValue });
          setTree(prev => [...prev, { name: newValue, teams: [] }]);
          setSelectedCompany(newValue);
          setSelectedTeam('');
          setSelectedPart('');
          setSelectedEmployee('');
          break;

        case 'team':
          await window.electronAPI.addTeam({
            company: selectedCompany,
            team: newValue
          });
          setTree(prev => prev.map(c =>
            c.name === selectedCompany
              ? { ...c, teams: [...c.teams, { name: newValue, parts: [] }] }
              : c
          ));
          setSelectedTeam(newValue);
          setSelectedPart('');
          setSelectedEmployee('');
          break;

        case 'part':
          await window.electronAPI.addPart({
            company: selectedCompany,
            team: selectedTeam,
            part: newValue
          });

          setTree(prev => prev.map(c =>
            c.name === selectedCompany
              ? {
                ...c,
                teams: c.teams.map(t =>
                  t.name === selectedTeam
                    ? { ...t, parts: [...t.parts, { name: newValue, employees: [] }] }
                    : t
                )
              }
              : c
          ));
          setSelectedPart(newValue);
          setSelectedEmployee('');
          break;

        case 'employee':
          await window.electronAPI.loginSubmit({
            company: selectedCompany,
            team: selectedTeam,
            part: selectedPart,
            employeeID: newValue
          });
          setTree(prev => prev.map(c =>
            c.name === selectedCompany
              ? {
                ...c,
                teams: c.teams.map(t =>
                  t.name === selectedTeam
                    ? {
                      ...t,
                      parts: t.parts.map(p =>
                        p.name === selectedPart
                          ? { ...p, employees: [...p.employees, newValue] }
                          : p
                      )
                    }
                    : t
                )
              }
              : c
          ));
          setSelectedEmployee(newValue);
          break;

        default:
          throw new Error('Unknown level: ' + level);
      }
    } catch (err) {
      console.error(`추가 오류 (${level}):`, err);
      alert(`${level} 추가에 실패했습니다:\n${err.message}`);
    }
  };


  return (
    <div className={styles.container}>
      {/* 왼쪽 배경 + 슬로건 */}
      <div className={styles.leftPanel}>
        <div className={styles.leftOverlay}>
          <h1 className={styles.logo}>HD현대</h1>
          <p className={styles.slogan}>
            챗봇과 함께 성장하는 내일
          </p>
        </div>
      </div>

      <div className={styles.loginCard}>
        <h2 className={styles.formTitle}>시작하기</h2>

        <DropdownWithAdd
          label="회사"
          items={companyOptions}
          selected={selectedCompany}
          onSelect={onSelectCompany}
          disabled={false}
          fullWidth={true}
          onAdd={name => handleAddItem('company', name)}
        />

        <DropdownWithAdd
          label="팀"
          items={teamOptions}
          selected={selectedTeam}
          onSelect={onSelectTeam}
          disabled={!selectedCompany}
          onAdd={name => handleAddItem('team', name)}
          fullWidth={true}
        />

        <DropdownWithAdd
          label="파트"
          items={partOptions}
          selected={selectedPart}
          onSelect={onSelectPart}
          disabled={!selectedTeam}
          onAdd={name => handleAddItem('part', name)}
          fullWidth={true}
        />

        <DropdownWithAdd
          label="사번"
          items={employeeOptions}
          selected={selectedEmployee}
          onSelect={onSelectEmployee}
          disabled={!selectedPart}
          onAdd={name => handleAddItem('employee', name)}
          fullWidth={true}
        />

        <button onClick={handleLogin} className={styles.loginButton}>
          로그인
        </button>
      </div>
    </div>
  );
}
