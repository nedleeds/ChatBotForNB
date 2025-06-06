
// src/components/DropdownWithAdd.jsx
import React, { useState } from 'react';
import styles from './DropdownWithAdd.module.css';

export default function DropdownWithAdd({ label, items, onAdd, onSelect, selected }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newValue, setNewValue] = useState('');

  const handleAddClick = () => {
    setIsAdding(true);
    setNewValue('');
  };

  const handleAddSubmit = (e) => {
    e.preventDefault();            // ← 반드시 있어야 합니다!
    const trimmed = newValue.trim();
    if (trimmed && !items.includes(trimmed)) {
      onAdd(trimmed);              // ← 여기가 호출되어야 저장 로직 (saveAll) 이 실행됩니다
    }
    setIsAdding(false);
  };

  return (
    <div className={styles.wrapper}>
      <label className={styles.label}>{label}</label>
      {isAdding ? (
        <form onSubmit={handleAddSubmit} className={styles.addForm}>
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className={styles.addInput}
            placeholder={`새 ${label} 입력`}
            autoFocus
          />
          <button type="submit" className={styles.addBtn}>
            ✓
          </button>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => setIsAdding(false)}
          >
            ✕
          </button>
        </form>
      ) : (
        <div className={styles.selectWrap}>
          <select
            value={selected || ''}
            onChange={(e) => onSelect(e.target.value)}
            className={styles.select}
          >
            <option value="" disabled>
              -- {label} 선택 --
            </option>
            {items.map((it) => (
              <option key={it} value={it}>
                {it}
              </option>
            ))}
          </select>
          <button type="button" className={styles.plusBtn} onClick={handleAddClick}>
            ＋
          </button>
        </div>
      )}
    </div>
  );
}
