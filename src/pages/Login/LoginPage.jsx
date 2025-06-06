// src/pages/Login/LoginPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DropdownWithAdd from '../../components/DropdownWithAdd';
import styles from './login.module.css';

export default function LoginPage() {
  // 1) login.json 전체 객체 (employeeList 필드 포함)
  const [loginData, setLoginData] = useState({
    company: '',
    team: '',
    part: '',
    data: {},
    employeeID: '',
    employeeList: [],
  });

  // 2) 드롭다운 목록
  const [companies, setCompanies] = useState([]);
  const [teams, setTeams] = useState([]);
  const [parts, setParts] = useState([]);
  const [employeeList, setEmployeeList] = useState([]);

  // 3) 사용자 선택값
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedPart, setSelectedPart] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');

  const STORAGE_KEY = 'loginSelections';
  const navigate = useNavigate();

  // ──── 앱 마운트 시: localStorage 우선 → login.json 불러오기 ────
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { company, team, part, employeeID } = JSON.parse(saved);
        setSelectedCompany(company || '');
        setSelectedTeam(team || '');
        setSelectedPart(part || '');
        setSelectedEmployee(employeeID || '');
      } catch (err) {
        console.warn('JSON 파싱 실패:', err);
      }
    }

    window.electronAPI.loadLogin().then((data) => {
      console.log('▶ loadLogin 결과:', data);
      setLoginData(data);

      // 1) 전체 company 목록 세팅
      const compList = Object.keys(data.data || {});
      setCompanies(compList);

      // 2) 현재 login.json에 company/team/part/employeeID가 있으면, 화면에도 반영
      //    - 로컬 스토리지에 있던 값(saved) 보다 우선하지 않고, 
      //      항상 file(data) 에 있는 값으로 세팅하도록 한다.
      const activeCompany = data.company || '';
      const activeTeam = data.team || '';
      const activePart = data.part || '';
      const activeEmployee = data.employeeID || '';

      setSelectedCompany(activeCompany);
      setSelectedTeam(activeTeam);
      setSelectedPart(activePart);
      setSelectedEmployee(activeEmployee);

      // 3) teams 목록
      if (activeCompany && data.data[activeCompany]) {
        const teamList = Object.keys(data.data[activeCompany]);
        setTeams(teamList);
      } else {
        setTeams([]);
      }

      // 4) parts 목록
      if (
        activeCompany &&
        activeTeam &&
        data.data[activeCompany] &&
        data.data[activeCompany][activeTeam]
      ) {
        setParts(data.data[activeCompany][activeTeam]);
      } else {
        setParts([]);
      }

      // 5) employeeList 목록
      if (Array.isArray(data.employeeList)) {
        setEmployeeList(data.employeeList);
      } else {
        console.warn('employeeList가 배열이 아님:', data.employeeList);
        setEmployeeList([]);
      }
    });
  }, []);

  // ──── 로그인 정보 저장(로컬스토리지 + userData/login.json) ────
  const saveAll = (newLoginData) => {
    console.log('▶ saveAll 호출, newLoginData=', newLoginData);

    // 1) localStorage에 company/team/part/employeeID 저장
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        company: newLoginData.company,
        team: newLoginData.team,
        part: newLoginData.part,
        employeeID: newLoginData.employeeID,
      })
    );

    // 2) React state 및 userData/login.json 파일 덮어쓰기
    setLoginData(newLoginData);
    window.electronAPI.saveLogin(newLoginData);
  };

  // ──── 드롭다운(onSelect) 핸들러들 ────
  const onSelectCompany = (company) => {
    console.log('▶ onSelectCompany:', company);
    setSelectedCompany(company);
    setSelectedTeam('');
    setSelectedPart('');

    // 해당 회사의 팀 목록
    const teamList = Object.keys(loginData.data[company] || {});
    setTeams(teamList);
    setParts([]);

    // loginData 속성 업데이트
    const newLD = {
      ...loginData,
      company,
      team: '',
      part: '',
      employeeID: selectedEmployee,
    };
    saveAll(newLD);
  };

  const onSelectTeam = (team) => {
    console.log('▶ onSelectTeam:', team);
    setSelectedTeam(team);
    setSelectedPart('');

    // 해당 (company → team)의 파트 목록
    const partList = (loginData.data[selectedCompany] || {})[team] || [];
    setParts(partList);

    const newLD = {
      ...loginData,
      company: selectedCompany,
      team,
      part: '',
      employeeID: selectedEmployee,
    };
    saveAll(newLD);
  };

  const onSelectPart = (part) => {
    console.log('▶ onSelectPart:', part);
    setSelectedPart(part);

    const newLD = {
      ...loginData,
      company: selectedCompany,
      team: selectedTeam,
      part,
      employeeID: selectedEmployee,
    };
    saveAll(newLD);
  };

  const onSelectEmployee = (eid) => {
    console.log('▶ onSelectEmployee:', eid);
    setSelectedEmployee(eid);

    const newLD = {
      ...loginData,
      employeeID: eid,
    };
    saveAll(newLD);
  };

  // ──── 새 사번 추가(체크) 핸들러 ────
  const handleAddEmployee = (newEid) => {
    console.log('▶ handleAddEmployee:', newEid);

    // loginData.employeeList가 배열인지 먼저 확인, 아니면 빈 배열로 처리
    const baseList = Array.isArray(loginData.employeeList)
      ? loginData.employeeList
      : [];

    // 새로운 사번이 baseList에 없는 경우에만 추가
    if (!baseList.includes(newEid)) {
      const updatedEmpList = [...baseList, newEid];

      // 새로운 loginData 객체 생성
      const newLD = {
        ...loginData,
        employeeList: updatedEmpList,
        employeeID: newEid,
      };
      console.log('▶ handleAddEmployee → newLD:', newLD);

      // React state 동기화
      setLoginData(newLD);
      setEmployeeList(updatedEmpList);
      setSelectedEmployee(newEid);

      // 로컬스토리지와 login.json 파일에 저장
      saveAll(newLD);
    } else {
      console.log(`▶ 사번 "${newEid}" 이미 목록에 존재합니다.`);
    }
  };

  return (
    <div className={styles.container}>
      {/* 좌측 패널 (배경 + 문구) */}
      <div className={styles.leftPanel}>
        <div className={styles.overlay}>
          <h1 className={styles.logo}>HD현대</h1>
          <p className={styles.subtitle}>신입사원 교육용 챗봇 프로그램</p>
        </div>
      </div>

      {/* 우측 패널 (회사 → 팀 → 파트 → 사번 순서) */}
      <div className={styles.rightPanel}>
        <h2 style={{ marginBottom: '1rem', color: '#333' }}>
          로그인 정보 입력
        </h2>

        {/* 1) 회사 드롭다운 */}
        <DropdownWithAdd
          label="회사"
          items={companies}
          selected={selectedCompany}
          onAdd={(newCompany) => {
            console.log('▶ 새 회사 추가:', newCompany);
            const updatedData = { ...loginData.data, [newCompany]: {} };
            const newLD = {
              ...loginData,
              data: updatedData,
              company: newCompany,
              team: '',
              part: '',
              employeeID: selectedEmployee,
            };
            setLoginData(newLD);
            setCompanies((prev) => [...prev, newCompany]);
            setSelectedCompany(newCompany);
            setTeams([]);
            setParts([]);
            saveAll(newLD);
          }}
          onSelect={onSelectCompany}
        />

        {/* 2) 팀 드롭다운 */}
        <DropdownWithAdd
          label="팀"
          items={teams}
          selected={selectedTeam}
          onAdd={(newTeam) => {
            console.log('▶ 새 팀 추가:', newTeam);
            const updatedCompanyObj = {
              ...(loginData.data[selectedCompany] || {}),
              [newTeam]: [],
            };
            const updatedData = {
              ...loginData.data,
              [selectedCompany]: updatedCompanyObj,
            };
            const newLD = {
              ...loginData,
              data: updatedData,
              company: selectedCompany,
              team: newTeam,
              part: '',
              employeeID: selectedEmployee,
            };
            setLoginData(newLD);
            setTeams((prev) => [...prev, newTeam]);
            setSelectedTeam(newTeam);
            setParts([]);
            saveAll(newLD);
          }}
          onSelect={onSelectTeam}
        />

        {/* 3) 파트 드롭다운 */}
        <DropdownWithAdd
          label="파트"
          items={parts}
          selected={selectedPart}
          onAdd={(newPart) => {
            console.log('▶ 새 파트 추가:', newPart);
            const updatedPartsArray = [
              ...(loginData.data[selectedCompany]?.[selectedTeam] || []),
              newPart,
            ];
            const updatedCompanyObj = {
              ...loginData.data[selectedCompany],
              [selectedTeam]: updatedPartsArray,
            };
            const updatedData = {
              ...loginData.data,
              [selectedCompany]: updatedCompanyObj,
            };
            const newLD = {
              ...loginData,
              data: updatedData,
              company: selectedCompany,
              team: selectedTeam,
              part: newPart,
              employeeID: selectedEmployee,
            };
            setLoginData(newLD);
            setParts(updatedPartsArray);
            setSelectedPart(newPart);
            saveAll(newLD);
          }}
          onSelect={onSelectPart}
        />

        {/* 4) 사번 드롭다운 (맨 하단) */}
        <DropdownWithAdd
          label="사번"
          items={employeeList}
          selected={selectedEmployee}
          onAdd={handleAddEmployee}
          onSelect={onSelectEmployee}
        />

        <button
          onClick={() => {
            if (
              !selectedCompany ||
              !selectedTeam ||
              !selectedPart ||
              !selectedEmployee
            ) {
              alert('사번, 회사, 팀, 파트를 모두 입력/선택해주세요.');
              return;
            }

            //   `로그인 성공!\n사번: ${selectedEmployee}\n회사: ${selectedCompany}\n팀: ${selectedTeam}\n파트: ${selectedPart}`
            // );
            navigate('/chatbot');
          }}
          style={{
            marginTop: '2rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          로그인
        </button>
      </div>
    </div>
  );
}
