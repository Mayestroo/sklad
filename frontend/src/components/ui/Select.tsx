'use client';

import { useState, useRef, useEffect, useMemo, useLayoutEffect, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from 'next-intl';
import { ChevronDown, Check, Search, X, Plus } from 'lucide-react';
import { getInitialActiveOptionIndex, getNextActiveOptionIndex } from './select-keyboard';

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
  onCreateNew?: (searchQuery?: string) => void;
  createNewLabel?: string;
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
  onCreateNew,
  createNewLabel,
}: CustomSelectProps) {
  let locale = 'uz';
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    locale = useLocale();
  } catch {
    // fallback
  }
  const isRu = locale === 'ru';

  const effectivePlaceholder = placeholder ?? (isRu ? 'Выберите...' : 'Tanlang...');
  const effectiveSearchPlaceholder = searchPlaceholder ?? (isRu ? 'Поиск...' : 'Qidirish...');
  const effectiveNoOptionsText = noOptionsText ?? (isRu ? 'Результаты не найдены' : 'Natija topilmadi');

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    openUpward: boolean;
  }>({ left: 0, width: 0, openUpward: false });

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const selectedOption = options.find((opt) => opt.value === value);

  // Enable search if searchable is true OR option count > 6
  const showSearch = searchable ?? options.length > 6;

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldOpenUpward = spaceBelow < 260 && spaceAbove > 260;

    setCoords({
      left: rect.left,
      width: Math.max(rect.width, 220),
      top: shouldOpenUpward ? undefined : rect.bottom + 4,
      bottom: shouldOpenUpward ? window.innerHeight - rect.top + 4 : undefined,
      openUpward: shouldOpenUpward,
    });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

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
  }, [isOpen, updatePosition]);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        opt.description?.toLowerCase().includes(query)
    );
  }, [options, searchQuery]);

  const selectedIndex = filteredOptions.findIndex((option) => option.value === value);
  const initialActiveIndex = getInitialActiveOptionIndex(selectedIndex, filteredOptions.length);
  const activeOptionIndex =
    activeIndex !== null && activeIndex >= 0 && activeIndex < filteredOptions.length
      ? activeIndex
      : initialActiveIndex;

  const closeDropdown = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    setSearchQuery('');
    setActiveIndex(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openDropdown = useCallback(() => {
    updatePosition();
    setSearchQuery('');
    setActiveIndex(null);
    setIsOpen(true);
  }, [updatePosition]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        closeDropdown();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        closeDropdown(true);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDropdown, isOpen]);

  useEffect(() => {
    if (isOpen && showSearch) {
      const timeoutId = window.setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => window.clearTimeout(timeoutId);
    }
  }, [isOpen, showSearch]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (
      !isOpen &&
      (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault();
      openDropdown();
      return;
    }

    if (isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setActiveIndex(
        getNextActiveOptionIndex(
          activeOptionIndex,
          event.key === 'ArrowDown' ? 1 : -1,
          filteredOptions.length,
        ),
      );
      return;
    }

    if (isOpen && event.key === 'Enter') {
      event.preventDefault();
      const activeOption = filteredOptions[activeOptionIndex];
      if (!activeOption) return;

      onChange(activeOption.value);
      closeDropdown(true);
    }
  };

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
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-label={label || placeholder || effectivePlaceholder}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            if (isOpen) {
              closeDropdown();
            } else {
              openDropdown();
            }
          }
        }}
        onKeyDown={(e) => {
          if (!disabled) handleKeyDown(e);
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

      {/* Portal Dropdown Menu */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          onKeyDown={handleKeyDown}
          style={{
            position: 'fixed',
            top: coords.top !== undefined ? `${coords.top}px` : 'auto',
            bottom: coords.bottom !== undefined ? `${coords.bottom}px` : 'auto',
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            zIndex: 99999,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
            boxShadow: 'var(--shadow-lg)',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxSizing: 'border-box',
            animation: 'fadeIn 120ms ease',
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
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setActiveIndex(null);
                }}
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
                  onClick={() => {
                    setSearchQuery('');
                    setActiveIndex(null);
                  }}
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
            id={listboxId}
            role="listbox"
            tabIndex={-1}
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
              filteredOptions.map((option, optionIndex) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={activeOptionIndex === optionIndex ? 0 : -1}
                    onClick={() => {
                      onChange(option.value);
                      closeDropdown(true);
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
                      backgroundColor: isSelected
                        ? 'var(--color-primary-50)'
                        : activeOptionIndex === optionIndex
                        ? 'var(--color-bg-hover)'
                        : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={() => setActiveIndex(optionIndex)}
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

          {onCreateNew && (
            <div
              style={{
                borderTop: '1px solid var(--color-border)',
                padding: '4px',
                backgroundColor: 'var(--color-bg-secondary)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  closeDropdown();
                  onCreateNew(searchQuery);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: 'var(--color-primary-600)',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary-50)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Plus size={16} />
                <span>
                  {createNewLabel
                    ? createNewLabel.replace(/^\+\s*/, '')
                    : isRu
                    ? 'Создать новое'
                    : 'Yangi qo‘shish'}
                </span>
              </button>
            </div>
          )}
        </div>,
        document.body
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
