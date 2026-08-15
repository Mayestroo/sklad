'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from 'next-intl';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DatePickerProps {
  id?: string;
  label?: string;
  value: string; // ISO date string 'YYYY-MM-DD' or ''
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  error?: string;
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
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${dd}/${mm}/${y}`;
}

export function DatePicker({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  style,
  error,
}: DatePickerProps) {
  const locale = (useLocale() as 'uz' | 'ru') || 'uz';
  const effectivePlaceholder = placeholder ?? (locale === 'ru' ? 'Выберите дату...' : 'Sana tanlang...');
  
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    openUpward: boolean;
  }>({ left: 0, width: 280, openUpward: false });

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Parse current value or use today for calendar view
  const parsedDate = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState<number>(parsedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(parsedDate.getMonth()); // 0-indexed

  // Sync calendar view when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

  const updatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldOpenUpward = spaceBelow < 340 && spaceAbove > 340;

    setCoords({
      left: Math.min(rect.left, window.innerWidth - 290),
      width: 280,
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

  // Click outside listener
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

  // Calendar math
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Monday = 0

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const formatted = `${viewYear}-${mm}-${dd}`;
    onChange(formatted);
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
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const monthNames = MONTHS[locale] || MONTHS.uz;
  const dayNames = DAYS[locale] || DAYS.uz;

  return (
    <div
      ref={containerRef}
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
            fontWeight: 500,
            color: 'var(--color-text-secondary)',
            marginBottom: '2px',
          }}
        >
          {label}
        </label>
      )}

      {/* Input Trigger Button */}
      <div
        id={id}
        onClick={() => {
          if (!disabled) {
            if (!isOpen) updatePosition();
            setIsOpen(!isOpen);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          height: '38px',
          boxSizing: 'border-box',
          fontSize: 'var(--text-sm)',
          fontFamily: 'inherit',
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
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', minWidth: 0 }}>
          <CalendarIcon size={16} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <span
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
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
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--color-text-tertiary)',
              padding: '2px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
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
            zIndex: 99999,
            width: '280px',
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-xl)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            animation: 'fadeIn 0.15s ease forwards',
          }}
        >
          {/* Header Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={handlePrevMonth}
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-light)',
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={16} />
            </button>

            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {monthNames[viewMonth]} {viewYear}
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-light)',
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Days of Week Header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
            {dayNames.map((d) => (
              <span key={d} style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)', paddingBottom: '4px' }}>
                {d}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
            {/* Empty slots before first day */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {/* Month Days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const isSelected = value === dateStr;
              const isToday = todayStr === dateStr;

              return (
                <button
                  key={dayNum}
                  type="button"
                  onClick={() => handleSelectDay(dayNum)}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: 'var(--radius-md)',
                    border: isToday && !isSelected ? '1px solid var(--color-primary-600)' : 'none',
                    backgroundColor: isSelected
                      ? 'var(--color-primary-600)'
                      : 'transparent',
                    color: isSelected
                      ? '#ffffff'
                      : isToday
                      ? 'var(--color-primary-600)'
                      : 'var(--color-text-primary)',
                    fontWeight: isSelected || isToday ? 'var(--font-bold)' : 'var(--font-regular)',
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          {/* Quick Actions Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--color-border-light)' }}>
            <button
              type="button"
              onClick={handleClear}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-medium)',
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer',
              }}
            >
              {locale === 'ru' ? 'Очистить' : 'Tozalash'}
            </button>
            <button
              type="button"
              onClick={handleToday}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-semibold)',
                color: 'var(--color-primary-600)',
                cursor: 'pointer',
              }}
            >
              {locale === 'ru' ? 'Сегодня' : 'Bugun'}
            </button>
          </div>
        </div>,
        document.body
      )}

      {error && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error-600)' }}>
          {error}
        </span>
      )}
    </div>
  );
}
