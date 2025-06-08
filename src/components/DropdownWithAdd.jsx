import React, { useState, useRef, useEffect } from 'react';
import styles from './DropdownWithAdd.module.css';

export default function DropdownWithAdd({
  label,
  items,
  selected,
  onSelect,
  onAdd,
  disabled = false,
  fullWidth = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [newValue, setNewValue] = useState('');
  const containerRef = useRef(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={styles.dropdownContainer} ref={containerRef}>
      {label && <label className={styles.label}>{label}</label>}

      <button
        type="button"
        className={`${styles.toggleButton} ${fullWidth ? styles.fullWidth : ''}`}
        onClick={() => !disabled && setIsOpen(o => !o)}
        disabled={disabled}
      >
        <span className={styles.toggleText}>
          {selected ?? `-- ${label} --`}
        </span>
        <span className={styles.arrow}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className={styles.menu}>
          {items.map(item => (
            <div
              key={item}
              className={styles.menuItem}
              onClick={() => {
                onSelect(item);
                setIsOpen(false);
              }}
            >
              {item}
            </div>
          ))}

          {onAdd && (
            <div className={styles.addSection}>
              <input
                className={styles.addInput}
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                placeholder={`${label} 추가`}
              />
              <button
                className={styles.addButton}
                disabled={!newValue.trim()}
                onClick={() => {
                  if (typeof onAdd === 'function') {
                    onAdd(newValue.trim());
                  }
                  setNewValue('');
                  setIsOpen(false);
                }}
              >
                추가
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
