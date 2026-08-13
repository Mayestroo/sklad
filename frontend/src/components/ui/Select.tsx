'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { ChevronDown, Check, Search, X } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface CustomSelectProps {
  id?: string;
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  noOptionsText?: string;
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
  className?: string;
}

export function Select({
  id,
  label,
  options,
  value,
  onChange,
  placeholder,
  error,
  disabled = false,
  searchable,
  searchPlaceholder,
  noOptionsText,
  size = 'md',
  style,
  className,
}: CustomSelectProps) {
  let locale = 'uz';
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    locale = useLocale();
  } catch (e) {
    // fallback
  }
  const isRu = locale === 'ru';

  const effectivePlaceholder = placeholder ?? (isRu ? 'Выберите...' : 'Tanlang...');
  const effectiveSearchPlaceholder = searchPlaceholder ?? (isRu ? 'Поиск...' : 'Qidirish...');
  const effectiveNoOptionsText = noOptionsText ?? (isRu ? 'Результаты не найдены' : 'Natija topilmadi');

  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Enable search if searchable is true OR option count > 6
  const showSearch = searchable ?? options.length > 6;

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 250 && rect.top > 250) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        opt.description?.toLowerCase().includes(query)
    );
  }, [options, searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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

  useEffect(() => {
    if (isOpen && showSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen, showSearch]);

  const sizeStyles = {
    sm: { height: '32px', padding: '4px 10px', fontSize: 'var(--text-xs)' },
    md: { height: '38px', padding: '8px 12px', fontSize: 'var(--text-sm)' },
    lg: { height: '44px', padding: '10px 14px', fontSize: 'var(--text-base)' },
  }[size];

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        position: 'relative',
        zIndex: isOpen ? 50 : 'auto',
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

      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
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
          color: selectedOption ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxShadow: isOpen ? '0 0 0 3px rgba(79, 70, 229, 0.15)' : 'var(--shadow-xs)',
          transition: 'all var(--transition-fast)',
          ...sizeStyles,
        }}
      >
        <span
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {selectedOption ? (
            <>
              {selectedOption.icon}
              {selectedOption.label}
            </>
          ) : (
            effectivePlaceholder
          )}
        </span>

        <ChevronDown
          size={16}
          style={{
            color: 'var(--color-text-tertiary)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform var(--transition-fast)',
            flexShrink: 0,
          }}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: openUpward ? 'auto' : 'calc(100% + 4px)',
            bottom: openUpward ? 'calc(100% + 4px)' : 'auto',
            left: 0,
            minWidth: '100%',
            zIndex: 999,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
            boxShadow: 'var(--shadow-lg)',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            animation: 'fadeIn 150ms ease',
          }}
        >
          {/* Search Box */}
          {showSearch && (
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                paddingBottom: '4px',
                borderBottom: '1px solid var(--color-border-light)',
              }}
            >
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '10px',
                  color: 'var(--color-text-tertiary)',
                  pointerEvents: 'none',
                }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={effectiveSearchPlaceholder}
                style={{
                  width: '100%',
                  padding: '6px 26px 6px 30px',
                  fontSize: 'var(--text-xs)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-tertiary)',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {/* Options List */}
          <div
            style={{
              maxHeight: '220px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {filteredOptions.length === 0 ? (
              <div
                style={{
                  padding: '12px 8px',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-tertiary)',
                  textAlign: 'center',
                }}
              >
                {effectiveNoOptionsText}
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-sm)',
                      fontWeight: isSelected ? 'var(--font-semibold)' : 'var(--font-regular)',
                      color: isSelected ? 'var(--color-primary-600)' : 'var(--color-text-primary)',
                      backgroundColor: isSelected ? 'var(--color-primary-50)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      {option.icon}
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <div>{option.label}</div>
                        {option.description && (
                          <div
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: 'var(--color-text-tertiary)',
                              fontWeight: 'var(--font-regular)',
                            }}
                          >
                            {option.description}
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check size={16} style={{ color: 'var(--color-primary-600)', flexShrink: 0 }} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {error && (
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-error-500)',
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
