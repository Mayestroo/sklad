'use client';

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from 'next-intl';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, ChevronDown } from 'lucide-react';

export interface DatePickerProps {
  id?: string;
  label?: string;
  value: string; // ISO date string 'YYYY-MM-DD' or ''
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
  className?: string;
  error?: string;
  minDate?: string;
  maxDate?: string;
}

const MONTHS: Record<string, string[]> = {
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
};

const DAYS: Record<string, string[]> = {
  uz: ['Dsh', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
};

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  if (!y || !m || !d) return dateStr;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

export function DatePicker({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  size = 'md',
  style,
  className,
  error,
  minDate,
  maxDate,
}: DatePickerProps) {
  let locale = 'uz';
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    locale = useLocale();
  } catch (e) {
    // fallback
  }
  const isRu = locale === 'ru';
  const effectivePlaceholder = placeholder ?? (isRu ? 'Дата...' : 'Sana...');

  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<'days' | 'months' | 'years'>('days');

  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    openUpward: boolean;
  }>({ left: 0, width: 290, openUpward: false });

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Parse current value or use today for initial view
  const initialDate = useMemo(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }, [value]);

  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth()); // 0-11
  const [yearPageStart, setYearPageStart] = useState<number>(Math.floor(initialDate.getFullYear() / 12) * 12);

  // Sync calendar view when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
        setYearPageStart(Math.floor(d.getFullYear() / 12) * 12);
      }
    }
  }, [value]);

  const updatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const popupHeight = 350;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldOpenUpward = spaceBelow < popupHeight && spaceAbove > popupHeight;

    const leftPos = Math.max(8, Math.min(rect.left, window.innerWidth - 300));

    setCoords({
      left: leftPos,
      width: Math.max(rect.width, 290),
      top: shouldOpenUpward ? undefined : rect.bottom + 4,
      bottom: shouldOpenUpward ? window.innerHeight - rect.top + 4 : undefined,
      openUpward: shouldOpenUpward,
    });
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  // Click outside & keyboard Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Reset viewMode to days on popup open
  useEffect(() => {
    if (isOpen) {
      setViewMode('days');
    }
  }, [isOpen]);

  // Calendar math
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Monday = 0
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMode === 'days') {
      if (viewMonth === 0) {
        setViewMonth(11);
        setViewYear((y) => y - 1);
      } else {
        setViewMonth((m) => m - 1);
      }
    } else if (viewMode === 'years') {
      setYearPageStart((y) => y - 12);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMode === 'days') {
      if (viewMonth === 11) {
        setViewMonth(0);
        setViewYear((y) => y + 1);
      } else {
        setViewMonth((m) => m + 1);
      }
    } else if (viewMode === 'years') {
      setYearPageStart((y) => y + 12);
    }
  };

  const handleSelectDay = (dateString: string) => {
    if (minDate && dateString < minDate) return;
    if (maxDate && dateString > maxDate) return;
    onChange(dateString);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
  };

  const handleToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;
    
    setViewYear(yyyy);
    setViewMonth(today.getMonth());
    onChange(todayFormatted);
    setIsOpen(false);
  };

  const todayStr = useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const monthNames = MONTHS[locale] || MONTHS.uz;
  const dayNames = DAYS[locale] || DAYS.uz;

  const sizeStyles = {
    sm: { height: '32px', padding: '4px 10px', fontSize: 'var(--text-xs)' },
    md: { height: '38px', padding: '8px 12px', fontSize: 'var(--text-sm)' },
    lg: { height: '44px', padding: '10px 14px', fontSize: 'var(--text-base)' },
  }[size];

  // Render grid items
  const renderCalendarCells = () => {
    const cells = [];

    // Previous month trailing days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const isDisabled = Boolean((minDate && dateStr < minDate) || (maxDate && dateStr > maxDate));

      cells.push(
        <button
          key={`prev-${dayNum}`}
          type="button"
          disabled={isDisabled}
          onClick={() => {
            setViewYear(prevY);
            setViewMonth(prevM);
            handleSelectDay(dateStr);
          }}
          style={{
            width: '100%',
            aspectRatio: '1',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            backgroundColor: 'transparent',
            color: 'var(--color-text-tertiary)',
            opacity: 0.4,
            fontSize: 'var(--text-xs)',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            if (!isDisabled) e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
          }}
          onMouseLeave={(e) => {
            if (!isDisabled) e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {dayNum}
        </button>
      );
    }

    // Current month days
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const isSelected = value === dateStr;
      const isToday = todayStr === dateStr;
      const isDisabled = Boolean((minDate && dateStr < minDate) || (maxDate && dateStr > maxDate));

      cells.push(
        <button
          key={`current-${dayNum}`}
          type="button"
          disabled={isDisabled}
          onClick={() => handleSelectDay(dateStr)}
          style={{
            width: '100%',
            aspectRatio: '1',
            borderRadius: 'var(--radius-md)',
            border: isToday && !isSelected ? '1.5px solid var(--color-primary-600)' : 'none',
            backgroundColor: isSelected
              ? 'var(--color-primary-600)'
              : 'transparent',
            color: isSelected
              ? '#ffffff'
              : isToday
              ? 'var(--color-primary-600)'
              : isDisabled
              ? 'var(--color-text-tertiary)'
              : 'var(--color-text-primary)',
            fontWeight: isSelected || isToday ? 'var(--font-bold)' : 'var(--font-medium)',
            fontSize: 'var(--text-xs)',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isSelected ? '0 2px 6px rgba(79, 70, 229, 0.35)' : 'none',
            opacity: isDisabled ? 0.4 : 1,
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            if (!isSelected && !isDisabled) {
              e.currentTarget.style.backgroundColor = 'var(--color-primary-50)';
              e.currentTarget.style.color = 'var(--color-primary-600)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected && !isDisabled) {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = isToday ? 'var(--color-primary-600)' : 'var(--color-text-primary)';
            }
          }}
        >
          {dayNum}
        </button>
      );
    }

    // Next month leading days to complete 6-row or 5-row layout nicely
    const totalSlots = cells.length;
    const remainingSlots = (totalSlots > 35 ? 42 : 35) - totalSlots;

    for (let dayNum = 1; dayNum <= remainingSlots; dayNum++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const isDisabled = Boolean((minDate && dateStr < minDate) || (maxDate && dateStr > maxDate));

      cells.push(
        <button
          key={`next-${dayNum}`}
          type="button"
          disabled={isDisabled}
          onClick={() => {
            setViewYear(nextY);
            setViewMonth(nextM);
            handleSelectDay(dateStr);
          }}
          style={{
            width: '100%',
            aspectRatio: '1',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            backgroundColor: 'transparent',
            color: 'var(--color-text-tertiary)',
            opacity: 0.4,
            fontSize: 'var(--text-xs)',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            if (!isDisabled) e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
          }}
          onMouseLeave={(e) => {
            if (!isDisabled) e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {dayNum}
        </button>
      );
    }

    return cells;
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        position: 'relative',
        fontFamily: 'var(--font-sans)',
        width: '100%',
        ...style,
      }}
    >
      {label && (
        <label
          htmlFor={id}
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--font-medium)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {label}
        </label>
      )}

      {/* Input Trigger Button */}
      <div
        id={id}
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          if (!disabled) {
            if (!isOpen) updatePosition();
            setIsOpen(!isOpen);
          }
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!isOpen) updatePosition();
            setIsOpen(!isOpen);
          }
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          boxSizing: 'border-box',
          borderRadius: 'var(--radius-md)',
          border: error
            ? '1px solid var(--color-error-500)'
            : isOpen
            ? '1px solid var(--color-primary-600)'
            : '1px solid var(--color-border)',
          backgroundColor: disabled ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
          color: value ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxShadow: isOpen ? '0 0 0 3px rgba(79, 70, 229, 0.15)' : 'var(--shadow-xs)',
          transition: 'all var(--transition-fast)',
          userSelect: 'none',
          ...sizeStyles,
        }}
        onMouseEnter={(e) => {
          if (!disabled && !isOpen) {
            e.currentTarget.style.borderColor = 'var(--color-primary-400)';
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !isOpen) {
            e.currentTarget.style.borderColor = error ? 'var(--color-error-500)' : 'var(--color-border)';
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', minWidth: 0 }}>
          <CalendarIcon size={16} style={{ color: isOpen ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)', flexShrink: 0, transition: 'color var(--transition-fast)' }} />
          <span
            style={{
              fontWeight: value ? 'var(--font-medium)' : 'var(--font-regular)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {value ? formatDisplayDate(value) : effectivePlaceholder}
          </span>
        </div>

        {value && !disabled ? (
          <button
            type="button"
            onClick={handleClear}
            title={isRu ? 'Очистить' : 'Tozalash'}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--color-text-tertiary)',
              padding: '2px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color var(--transition-fast), background-color var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-error-600)';
              e.currentTarget.style.backgroundColor = 'var(--color-error-50)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {/* Calendar Portal Dropdown Popup */}
      {isOpen && mounted && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top !== undefined ? `${coords.top}px` : 'auto',
            bottom: coords.bottom !== undefined ? `${coords.bottom}px` : 'auto',
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxWidth: '320px',
            zIndex: 99999,
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-xl)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            animation: 'fadeIn 120ms ease forwards',
          }}
        >
          {/* Header Navigation Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={viewMode === 'months'}
              style={{
                width: 30,
                height: 30,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-light)',
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-primary)',
                cursor: viewMode === 'months' ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: viewMode === 'months' ? 0.3 : 1,
                transition: 'all var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                if (viewMode !== 'months') e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (viewMode !== 'months') e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
              }}
            >
              <ChevronLeft size={16} />
            </button>

            {/* Quick Month & Year Title Clickers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'months' ? 'days' : 'months')}
                style={{
                  background: viewMode === 'months' ? 'var(--color-primary-50)' : 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 6px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--font-bold)',
                  color: viewMode === 'months' ? 'var(--color-primary-600)' : 'var(--color-text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  if (viewMode !== 'months') e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (viewMode !== 'months') e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {monthNames[viewMonth]}
                <ChevronDown size={14} style={{ opacity: 0.6 }} />
              </button>

              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'years' ? 'days' : 'years')}
                style={{
                  background: viewMode === 'years' ? 'var(--color-primary-50)' : 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 6px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--font-bold)',
                  color: viewMode === 'years' ? 'var(--color-primary-600)' : 'var(--color-text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  if (viewMode !== 'years') e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (viewMode !== 'years') e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {viewYear}
                <ChevronDown size={14} style={{ opacity: 0.6 }} />
              </button>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              disabled={viewMode === 'months'}
              style={{
                width: 30,
                height: 30,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-light)',
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-primary)',
                cursor: viewMode === 'months' ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: viewMode === 'months' ? 0.3 : 1,
                transition: 'all var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                if (viewMode !== 'months') e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (viewMode !== 'months') e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* VIEW MODE 1: Days Calendar Grid */}
          {viewMode === 'days' && (
            <>
              {/* Days of Week Header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
                {dayNames.map((d) => (
                  <span
                    key={d}
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 'var(--font-semibold)',
                      color: 'var(--color-text-tertiary)',
                      paddingBottom: '2px',
                    }}
                  >
                    {d}
                  </span>
                ))}
              </div>

              {/* Days Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {renderCalendarCells()}
              </div>
            </>
          )}

          {/* VIEW MODE 2: Month Selector Grid */}
          {viewMode === 'months' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', padding: '4px 0' }}>
              {monthNames.map((name, index) => {
                const isCurrentMonth = index === viewMonth;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setViewMonth(index);
                      setViewMode('days');
                    }}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 'var(--radius-md)',
                      border: isCurrentMonth ? '1.5px solid var(--color-primary-600)' : '1px solid var(--color-border-light)',
                      backgroundColor: isCurrentMonth ? 'var(--color-primary-50)' : 'var(--color-bg-tertiary)',
                      color: isCurrentMonth ? 'var(--color-primary-600)' : 'var(--color-text-primary)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: isCurrentMonth ? 'var(--font-bold)' : 'var(--font-medium)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isCurrentMonth) e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isCurrentMonth) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          {/* VIEW MODE 3: Year Selector Grid */}
          {viewMode === 'years' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', padding: '4px 0' }}>
              {Array.from({ length: 12 }).map((_, i) => {
                const year = yearPageStart + i;
                const isSelectedYear = year === viewYear;
                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() => {
                      setViewYear(year);
                      setViewMode('days');
                    }}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 'var(--radius-md)',
                      border: isSelectedYear ? '1.5px solid var(--color-primary-600)' : '1px solid var(--color-border-light)',
                      backgroundColor: isSelectedYear ? 'var(--color-primary-50)' : 'var(--color-bg-tertiary)',
                      color: isSelectedYear ? 'var(--color-primary-600)' : 'var(--color-text-primary)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: isSelectedYear ? 'var(--font-bold)' : 'var(--font-medium)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelectedYear) e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelectedYear) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
                    }}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          )}

          {/* Quick Actions Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '8px',
              borderTop: '1px solid var(--color-border-light)',
            }}
          >
            <button
              type="button"
              onClick={handleClear}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 6px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-medium)',
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer',
                transition: 'color var(--transition-fast), background-color var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-error-600)';
                e.currentTarget.style.backgroundColor = 'var(--color-error-50)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {isRu ? 'Очистить' : 'Tozalash'}
            </button>

            <button
              type="button"
              onClick={handleToday}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-bold)',
                color: 'var(--color-primary-600)',
                cursor: 'pointer',
                transition: 'background-color var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-primary-50)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {isRu ? 'Сегодня' : 'Bugun'}
            </button>
          </div>
        </div>,
        document.body
      )}

      {error && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error-600)', fontWeight: 500 }}>
          {error}
        </span>
      )}
    </div>
  );
}
